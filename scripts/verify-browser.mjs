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
