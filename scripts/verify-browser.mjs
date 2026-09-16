/**
 * 真瀏覽器行為驗收。
 *
 * 用法:
 *   npm run preview                                    # 另一個視窗先起 preview
 *   node scripts/verify-browser.mjs
 *   BASE=https://hfpc-minesweeper.summer09201017.workers.dev node scripts/verify-browser.mjs
 *   SHOT_DIR=<資料夾> ...                               # 順便存截圖
 *
 * ★ 為什麼非有不可:41 項單元測試證明「規則對」,證不了「畫面上做得到」。
 *   0915 dragtetris 的兩顆實錄都是「測試全綠也看不到」:
 *     ① 版號簡歷那層遮罩因為 inline display:flex 贏過 hidden 屬性,一開頁就蓋住全畫面
 *     ② 角落的固定徽章偷走了按鈕下緣的觸控(截圖看不出來,elementFromPoint 才量得到)
 *   ⇒ 這兩項在這裡是常駐迴歸檢查。
 * ★ 不用 process.exit():fetch 之後 keep-alive socket 還開著就 exit,Windows 上離開碼會亂。
 *   一律 process.exitCode。
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const SHOT_DIR = process.env.SHOT_DIR || '';

let pass = 0;
let fail = 0;
const fails = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  × ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function shot(page, name) {
  if (!SHOT_DIR) return;
  try {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
  } catch (e) {
    console.log(`  (截圖 ${name} 失敗:${e.message})`);
  }
}

/** 清空本機狀態重開,回到乾淨起點。 */
async function reset(page, settings = {}) {
  await page.evaluate((s) => {
    try {
      localStorage.clear();
      if (Object.keys(s).length) localStorage.setItem('ms.settings.v1', JSON.stringify(s));
    } catch {
      /* 無痕模式 */
    }
  }, settings);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.board .cell');
}

const cellAt = (page, i) => page.locator(`.cell[data-i="${i}"]`);
const countRevealed = (page) => page.locator('.cell[data-state="revealed"]').count();

/** 七段顯示器讀不出數字(它是 SVG),改讀 aria-label。 */
async function segValue(page, label) {
  const el = page.locator(`.seg[aria-label^="${label}"]`).first();
  const aria = await el.getAttribute('aria-label');
  return Number(String(aria).replace(label, '').trim());
}

async function openMenu(page, name) {
  await page.locator('.menubar button', { hasText: name }).first().click();
  await page.waitForSelector('.menu-popup');
}

async function run() {
  const browser = await chromium.launch();

  // ── 桌機 ───────────────────────────────────────────────
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await desktop.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  console.log(`\n▶ 桌機 ${BASE}`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.board .cell');
  await reset(page);

  // ① 版面與版號兩件套
  check('棋盤畫出來了(初級 9×9 = 81 格)', (await page.locator('.board .cell').count()) === 81);
  check('剩餘雷數開場顯示 10', (await segValue(page, '剩餘雷數')) === 10);
  check('計時器開場是 0', (await segValue(page, '經過秒數')) === 0);

  const badge = await page.locator('#appVerBadge').innerText();
  check('版號徽章有文字', /版本\s*v\d/.test(badge), badge);
  check(
    '版號簡歷開場是收起來的(不可以一開頁就蓋住畫面)',
    await page.locator('#appVerSheet').isHidden()
  );

  // ★ 常駐迴歸:徽章不可以偷走底下按鈕的觸控(0915 dragtetris 實錄)
  const badgeSteals = await page.evaluate(() => {
    const b = document.getElementById('appVerBadge');
    if (!b) return 'no-badge';
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && (hit === b || b.contains(hit)) ? 'steals' : 'ok';
  });
  check('版號徽章不吃點擊(pointer-events:none)', badgeSteals === 'ok', badgeSteals);

  // ② 左鍵開格子 → 第一次點擊才佈雷
  await cellAt(page, 40).click();
  await page.waitForFunction(() => document.querySelectorAll('.cell[data-state="revealed"]').length > 0);
  check('左鍵可以開格子', (await countRevealed(page)) > 0);
  check(
    '預設「保證開出一片」⇒ 一點就開出一大片',
    (await countRevealed(page)) >= 9,
    `只開了 ${await countRevealed(page)} 格`
  );
  check(
    '無猜盤面徽章有出現(而且講的是這一盤的真實狀態)',
    (await page.locator('.badge-noguess, .badge-guess').count()) === 1
  );
  check('狀態列有 3BV', /3BV/.test(await page.locator('.statusbar').innerText()));
  await shot(page, 'desktop-opened');

  // ③ 右鍵插旗 → 剩餘雷數跟著減
  // ⚠ locator 是「查詢」不是「某一格」:插旗之後 .cell[data-state="hidden"] 的第一格
  //    已經換人了。第二次一定要用固定的 data-i 點回同一格,不然測的是另一格。
  const hiddenIndex = Number(
    await page.locator('.cell[data-state="hidden"]').first().getAttribute('data-i')
  );
  await cellAt(page, hiddenIndex).click({ button: 'right' });
  await page.waitForTimeout(120);
  check('右鍵插得了旗', (await cellAt(page, hiddenIndex).getAttribute('data-state')) === 'flag');
  check('插旗後剩餘雷數變 9', (await segValue(page, '剩餘雷數')) === 9);
  await cellAt(page, hiddenIndex).click({ button: 'right' });
  await page.waitForTimeout(120);
  check(
    '再按一次拔旗(未開啟「標記(?)」時不會變問號)',
    (await cellAt(page, hiddenIndex).getAttribute('data-state')) === 'hidden'
  );

  // ④ 計時器真的在走
  await page.waitForTimeout(1400);
  check('計時器有在走', (await segValue(page, '經過秒數')) >= 1);

  // ⑤ 笑臉鈕開新局
  await page.locator('.face-btn').click();
  await page.waitForTimeout(150);
  check('笑臉鈕可以開新局(棋盤清空)', (await countRevealed(page)) === 0);
  check('新局計時器歸零', (await segValue(page, '經過秒數')) === 0);

  // ⑥ 選單:換難度
  await openMenu(page, '遊戲');
  await page.locator('.menu-item', { hasText: '中級' }).first().click();
  await page.waitForTimeout(200);
  check('換成中級 = 16×16 = 256 格', (await page.locator('.board .cell').count()) === 256);
  check('中級剩餘雷數 40', (await segValue(page, '剩餘雷數')) === 40);

  await openMenu(page, '遊戲');
  await page.locator('.menu-item', { hasText: '高級' }).first().click();
  await page.waitForTimeout(200);
  check('換成高級 = 30×16 = 480 格(不是 16×30)', (await page.locator('.board .cell').count()) === 480);
  const boardCols = await page.evaluate(
    () => getComputedStyle(document.querySelector('.board')).gridTemplateColumns.split(' ').length
  );
  check('高級盤真的是 30 欄寬', boardCols === 30, `量到 ${boardCols} 欄`);
  await shot(page, 'desktop-expert');

  await openMenu(page, '遊戲');
  await page.locator('.menu-item', { hasText: '初級' }).first().click();
  await page.waitForTimeout(200);

  // ⑦ 標記(?)
  await openMenu(page, '遊戲');
  await page.locator('.menu-item', { hasText: '標記' }).first().click();
  await page.waitForTimeout(150);
  await cellAt(page, 40).click();
  await page.waitForTimeout(400);
  const h2i = Number(
    await page.locator('.cell[data-state="hidden"]').first().getAttribute('data-i')
  );
  await cellAt(page, h2i).click({ button: 'right' });
  await page.waitForTimeout(80);
  await cellAt(page, h2i).click({ button: 'right' });
  await page.waitForTimeout(120);
  check(
    '開啟「標記(?)」後右鍵會循環到問號',
    (await cellAt(page, h2i).getAttribute('data-state')) === 'question'
  );

  // ⑧ 對話框
  await openMenu(page, '遊戲');
  await page.locator('.menu-item', { hasText: '最佳成績' }).first().click();
  await page.waitForSelector('.dialog');
  check('最佳成績對話框打得開', await page.locator('.records-table').isVisible());
  check(
    '最佳成績把「無猜」和「一般」分開列',
    (await page.locator('.records-table tbody tr').count()) >= 6
  );
  await page.locator('.dialog-actions .btn', { hasText: '關閉' }).click();
  await page.waitForTimeout(150);

  await openMenu(page, '遊戲');
  await page.locator('.menu-item', { hasText: '選項' }).first().click();
  await page.waitForSelector('.dialog');
  check('選項有「首點保護」兩個選項', (await page.locator('input[name="firstclick"]').count()) === 2);
  check(
    '選項有「無猜盤面」開關',
    (await page.locator('.dialog', { hasText: '無猜盤面' }).count()) > 0
  );
  await page.locator('.dialog-actions .btn', { hasText: '關閉' }).click();
  await page.waitForTimeout(150);

  await openMenu(page, '說明');
  await page.locator('.menu-item', { hasText: '玩法說明' }).first().click();
  await page.waitForSelector('.dialog');
  const helpText = await page.locator('.dialog-body').innerText();
  check('說明有講到和弦展開', /和弦/.test(helpText));
  check('說明有講到長按插旗', /長按/.test(helpText));
  await page.locator('.dialog-actions .btn', { hasText: '關閉' }).click();
  await page.waitForTimeout(150);

  await openMenu(page, '說明');
  await page.locator('.menu-item', { hasText: '改版簡歷' }).first().click();
  await page.waitForTimeout(200);
  check('改版簡歷打得開', await page.locator('#appVerSheet').isVisible());
  await page.locator('#appVerClose').click();
  await page.waitForTimeout(150);
  check('改版簡歷關得掉', await page.locator('#appVerSheet').isHidden());

  // ⑧.5 換皮 / 換背景 / 背景音樂
  await reset(page);
  await openMenu(page, '遊戲');
  await page.locator('.menu-item', { hasText: '選項' }).first().click();
  await page.waitForSelector('.dialog');

  const themeCount = await page.locator('.swatch-btn').count();
  check('選項裡有換皮清單(至少 5 種)', themeCount >= 5, `${themeCount} 種`);
  const backdropCount = await page.locator('.backdrop-btn').count();
  check('選項裡有換背景清單(至少 5 種)', backdropCount >= 5, `${backdropCount} 種`);

  const readVars = () =>
    page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        face: cs.getPropertyValue('--face').trim(),
        n1: cs.getPropertyValue('--n1').trim(),
        desk: cs.getPropertyValue('--desk-bg').trim(),
        theme: document.documentElement.dataset.theme,
        backdrop: document.documentElement.dataset.backdrop
      };
    });

  const beforeTheme = await readVars();
  check('開場是經典 XP 皮', beforeTheme.theme === 'xp', beforeTheme.theme);
  check('XP 皮的數字 1 是原版藍', beforeTheme.n1.toLowerCase() === '#0000ff', beforeTheme.n1);

  await page.locator('.swatch-btn', { hasText: '夜間深色' }).first().click();
  await page.waitForTimeout(250);
  const darkVars = await readVars();
  check('換成夜間深色,面色真的變了', darkVars.face !== beforeTheme.face, `${beforeTheme.face} → ${darkVars.face}`);
  check(
    '★ 換皮有把數字色一起換掉(只換底色的話深色皮上的 1 會看不見)',
    darkVars.n1 !== beforeTheme.n1,
    `n1 還是 ${darkVars.n1}`
  );

  // 真的量畫面上那顆數字的顏色,不是只看變數 —— 變數對了但 CSS 沒接上也會是這個症狀
  await page.locator('.dialog-actions .btn', { hasText: '關閉' }).click();
  await page.waitForTimeout(200);
  await cellAt(page, 40).click();
  await page.waitForTimeout(500);
  const drawnColor = await page.evaluate(() => {
    const el = document.querySelector('.cell[data-n="1"]');
    return el ? getComputedStyle(el).color : null;
  });
  check(
    '畫面上真的畫出深色皮的數字色(不是變數對了但 CSS 沒接上)',
    drawnColor !== null && drawnColor !== 'rgb(0, 0, 255)',
    String(drawnColor)
  );

  // ★ 深色皮上的「畫面文字」要真的看得見。
  //   由來:深色皮做好、單元測試全綠、截圖一看 —— 選單「遊戲/說明」與狀態列還是黑字,
  //   因為 CSS 有七處寫死 #000/#444。變數對了但 CSS 沒接上就是長這樣,
  //   只有量 computed color 抓得到。
  const inkContrast = await page.evaluate(() => {
    const lin = (c) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lum = (rgb) => {
      const m = rgb.match(/\d+/g).map(Number);
      return 0.2126 * lin(m[0]) + 0.7152 * lin(m[1]) + 0.0722 * lin(m[2]);
    };
    const bgOf = (el) => {
      let e = el;
      while (e) {
        const b = getComputedStyle(e).backgroundColor;
        if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b;
        e = e.parentElement;
      }
      return 'rgb(255,255,255)';
    };
    const out = [];
    for (const sel of ['.menubar button', '.statusbar', '.mobile-bar button']) {
      const el = document.querySelector(sel);
      if (!el) {
        out.push([sel, -1]);
        continue;
      }
      const la = lum(getComputedStyle(el).color);
      const lb = lum(bgOf(el));
      const hi = Math.max(la, lb);
      const lo = Math.min(la, lb);
      out.push([sel, (hi + 0.05) / (lo + 0.05)]);
    }
    return out;
  });
  for (const [sel, ratio] of inkContrast) {
    check(`深色皮上「${sel}」的文字讀得到(≥4.5:1)`, ratio >= 4.5, `量到 ${ratio.toFixed(2)}:1`);
  }

  // 換背景:獨立於主題
  await openMenu(page, '遊戲');
  await page.locator('.menu-item', { hasText: '選項' }).first().click();
  await page.waitForSelector('.dialog');
  await page.locator('.backdrop-btn', { hasText: '星空夜色' }).first().click();
  await page.waitForTimeout(250);
  const bd = await readVars();
  check('換背景會蓋過主題的桌面色', bd.backdrop === 'night' && bd.desk !== darkVars.desk, bd.desk);
  check('換背景不會動到棋盤主題', bd.theme === 'dark' && bd.face === darkVars.face);

  // ★ 場景圖層是「壞掉也沒人會發現」的一類:data URI 編錯(例如 # 沒編成 %23)
  //   時瀏覽器不報錯、console 全乾淨,只是那一層默默不畫 —— 畫面還是一片漂亮的漸層。
  //   ⇒ 這裡把 body 算出來的每一層 SVG 都真的丟給 Image 解一次,解不開才算數。
  const layersOk = await page.evaluate(async () => {
    const bg = getComputedStyle(document.body).backgroundImage;
    const urls = Array.from(bg.matchAll(/url\("(data:image\/svg\+xml,[^"]*)"\)/g), (m) => m[1]);
    const results = await Promise.all(
      urls.map(
        (u) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth > 0);
            img.onerror = () => resolve(false);
            img.src = u;
          })
      )
    );
    return { total: urls.length, ok: results.filter(Boolean).length };
  });
  check(
    '夜色場景的每一層 SVG 都真的解得開(# 沒編碼的話會整層無聲消失)',
    layersOk.total >= 4 && layersOk.ok === layersOk.total,
    `${layersOk.ok}/${layersOk.total} 層`
  );
  await shot(page, 'backdrop-night');

  // 其餘場景各驗一輪 + 存截圖(圖層數是「有沒有被簡化回單層漸層」的哨兵)
  for (const [name, id, least] of [
    ['草原藍天', 'bliss', 8],
    ['月夜森林', 'moonlit', 4],
    ['夕陽', 'sunset', 5]
  ]) {
    await page.locator('.backdrop-btn', { hasText: name }).first().click();
    await page.waitForTimeout(250);
    const r = await page.evaluate(async (want) => {
      const bg = getComputedStyle(document.body).backgroundImage;
      const urls = Array.from(bg.matchAll(/url\("(data:image\/svg\+xml,[^"]*)"\)/g), (m) => m[1]);
      const ok = await Promise.all(
        urls.map(
          (u) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img.naturalWidth > 0);
              img.onerror = () => resolve(false);
              img.src = u;
            })
        )
      );
      return {
        id: document.documentElement.dataset.backdrop,
        total: urls.length,
        ok: ok.filter(Boolean).length,
        want
      };
    }, least);
    check(
      `「${name}」場景畫得出來(${least} 層以上,每一層都解得開)`,
      r.id === id && r.total >= least && r.ok === r.total,
      `${r.id}:${r.ok}/${r.total} 層`
    );
    await shot(page, `backdrop-${id}`);
  }
  await page.locator('.backdrop-btn', { hasText: '星空夜色' }).first().click();
  await page.waitForTimeout(200);

  // 背景音樂:預設關(別人家的孩子在教室打開不該突然出聲)
  const musicBox = page.locator('.dialog label', { hasText: '播放背景音樂' }).locator('input');
  check('背景音樂預設是關的', (await musicBox.isChecked()) === false);
  await musicBox.check();
  await page.waitForTimeout(250);
  const trackBtns = await page.locator('.dialog .row .btn').count();
  check('打開音樂後看得到曲目可選', trackBtns >= 3, `${trackBtns} 顆`);
  await page.locator('.dialog-actions .btn', { hasText: '關閉' }).click();
  await page.waitForTimeout(200);

  // 設定要活得過重新整理
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.board .cell');
  const after = await readVars();
  check('重新整理後主題還在', after.theme === 'dark', after.theme);
  check('重新整理後背景還在', after.backdrop === 'night', after.backdrop);
  const musicPersisted = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('ms.settings.v1') || '{}').music === true;
    } catch {
      return false;
    }
  });
  check('重新整理後音樂設定還在', musicPersisted);
  await shot(page, 'theme-dark-night');

  // 高對比主題(投影上課用)
  await reset(page, { theme: 'contrast' });
  const hc = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { face: cs.getPropertyValue('--face').trim(), theme: document.documentElement.dataset.theme };
  });
  check('高對比主題套得起來', hc.theme === 'contrast' && hc.face.toLowerCase() === '#ffffff', JSON.stringify(hc));
  await shot(page, 'theme-contrast');
  await reset(page);

  // ⑨ 艦隊必備件
  check('有「← 大廳」鈕', (await page.locator('.topbar-btn', { hasText: '大廳' }).count()) === 1);
  const lobbyBox = await page.locator('.topbar-btn', { hasText: '大廳' }).boundingBox();
  check('大廳鈕高度 ≥ 40px(觸控目標下限)', lobbyBox && lobbyBox.height >= 40, `${lobbyBox?.height}px`);
  check('有 ⛶ 全螢幕鈕', (await page.locator('.topbar-btn[aria-pressed]').count()) === 1);
  check('有打點函式 psPing', await page.evaluate(() => typeof window.psPing === 'function'));

  // ⑩ 一般盤面模式要誠實說「可能需要猜」
  await reset(page, { noGuess: false, firstClickRule: 'opening', difficulty: 'beginner' });
  await cellAt(page, 40).click();
  await page.waitForTimeout(400);
  check(
    '關掉無猜後,畫面誠實標成「一般盤面:可能需要猜」',
    (await page.locator('.badge-guess').count()) === 1
  );

  // ⑪ 每日挑戰:一進來就有開場,而且同一天同一盤
  const daily = await desktop.newPage();
  await daily.goto(`${BASE}?daily`, { waitUntil: 'domcontentloaded' });
  await daily.waitForSelector('.board .cell');
  await daily.waitForFunction(
    () => document.querySelectorAll('.cell[data-state="revealed"]').length > 0,
    { timeout: 15000 }
  );
  check('?daily 一進來就自動開好第一格', (await countRevealed(daily)) > 0);
  check('?daily 標題顯示今日挑戰題號', /今日挑戰\s*#\d{6}/.test(await daily.locator('.topbar-title').innerText()));
  check('?daily 固定用中級盤', (await daily.locator('.board .cell').count()) === 256);
  const dailyFingerprint = async (p) =>
    p.evaluate(() =>
      [...document.querySelectorAll('.cell')].map((c) => c.getAttribute('data-n') || '.').join('')
    );
  const fp1 = await dailyFingerprint(daily);
  await daily.reload({ waitUntil: 'domcontentloaded' });
  await daily.waitForFunction(
    () => document.querySelectorAll('.cell[data-state="revealed"]').length > 0,
    { timeout: 15000 }
  );
  const fp2 = await dailyFingerprint(daily);
  check('?daily 重新整理拿到同一盤(種子決定盤面與開場)', fp1 === fp2);
  await shot(daily, 'daily');
  await daily.close();

  check('主控台沒有錯誤', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  await desktop.close();

  // ── 手機 ───────────────────────────────────────────────
  console.log('\n▶ 手機(iPhone 13 直向)');
  const mobile = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await mobile.newPage();
  await mp.goto(BASE, { waitUntil: 'domcontentloaded' });
  await mp.waitForSelector('.board .cell');
  await reset(mp);

  const overflow = await mp.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check('直向不會整頁左右溢出', overflow <= 1, `多出 ${overflow}px`);

  const cellBox = await mp.locator('.cell').first().boundingBox();
  check('手機格子 ≥ 22px(點得中)', cellBox && cellBox.width >= 22, `${cellBox?.width}px`);

  for (const label of ['模式', '新局', '說明']) {
    const b = mp.locator('.mobile-bar button', { hasText: label }).first();
    const box = await b.boundingBox();
    check(`手機控制列「${label}」觸控目標 ≥ 44px`, box && box.height >= 44, `${box?.height}px`);
  }

  // ★ 常駐迴歸:固定徽章不可以蓋住手機控制列的按鈕
  const barStolen = await mp.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('.mobile-bar button')) {
      const r = b.getBoundingClientRect();
      for (const [dx, dy] of [
        [0.5, 0.25],
        [0.5, 0.75]
      ]) {
        const hit = document.elementFromPoint(r.left + r.width * dx, r.top + r.height * dy);
        if (hit && !b.contains(hit) && hit !== b) out.push(`${b.textContent.trim()}@${dy}`);
      }
    }
    return out;
  });
  check('手機控制列的按鈕沒有被別的東西蓋住', barStolen.length === 0, barStolen.join(','));

  // 觸控:點一下開格子
  await cellAt(mp, 40).tap();
  await mp.waitForFunction(() => document.querySelectorAll('.cell[data-state="revealed"]').length > 0);
  check('手機點一下可以開格子', (await countRevealed(mp)) > 0);

  // 觸控:長按插旗
  const mhi = Number(
    await mp.locator('.cell[data-state="hidden"]').first().getAttribute('data-i')
  );
  // Playwright 沒有「長按」原語 ⇒ 用 dispatch pointer 事件模擬按住
  await mp.evaluate(
    async ({ i }) => {
      const el = document.querySelector(`.cell[data-i="${i}"]`);
      const r = el.getBoundingClientRect();
      const opts = {
        bubbles: true,
        pointerId: 1,
        pointerType: 'touch',
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
        button: 0
      };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      await new Promise((r2) => setTimeout(r2, 620));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
    },
    { i: mhi }
  );
  await mp.waitForTimeout(200);
  check('手機長按會插旗', (await cellAt(mp, mhi).getAttribute('data-state')) === 'flag', mhi);

  // 旗子模式
  await mp.locator('.mobile-bar button', { hasText: '模式' }).first().tap();
  await mp.waitForTimeout(150);
  check(
    '旗子模式切得過去',
    (await mp.locator('.mobile-bar button[aria-pressed="true"]').count()) === 1
  );
  check(
    '模式鈕的圖示跟著狀態走(不可以 🚩 配「挖掘模式」)',
    /🚩\s*插旗模式/.test(await mp.locator('.mobile-bar button[aria-pressed="true"]').innerText())
  );
  const mh2i = Number(
    await mp.locator('.cell[data-state="hidden"]').first().getAttribute('data-i')
  );
  await cellAt(mp, mh2i).tap();
  await mp.waitForTimeout(200);
  check('旗子模式下點一下就插旗', (await cellAt(mp, mh2i).getAttribute('data-state')) === 'flag');

  await shot(mp, 'mobile');
  await mobile.close();

  // ── 手機橫向:高級盤 ────────────────────────────────────
  console.log('\n▶ 手機(橫向・高級盤)');
  const land = await browser.newContext({
    ...devices['iPhone 13 landscape']
  });
  const lp = await land.newPage();
  await lp.goto(BASE, { waitUntil: 'domcontentloaded' });
  await lp.waitForSelector('.board .cell');
  await reset(lp, { difficulty: 'expert' });
  check('橫向高級盤 480 格', (await lp.locator('.board .cell').count()) === 480);
  const landOverflow = await lp.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check('橫向時整頁不左右溢出(棋盤自己捲)', landOverflow <= 1, `多出 ${landOverflow}px`);
  await shot(lp, 'landscape-expert');
  await land.close();

  await browser.close();

  console.log(`\n結果:${pass} 通過 / ${fail} 失敗`);
  if (fails.length) {
    console.log('\n失敗項:');
    for (const f of fails) console.log(`  × ${f}`);
  }
  process.exitCode = fail === 0 ? 0 : 1;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
