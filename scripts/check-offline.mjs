/**
 * 離線可玩驗收(PWA 的命脈)。
 *
 * ★ 為什麼單獨一支:0915 全艦隊修過 51 站的同一顆地雷 ——
 *   Cloudflare Workers 的資產服務會把 `/index.html` **307 導向 `/`**,
 *   而 workbox 的 precache 清單裡放的正是 `index.html`。
 *   拿到「被導向過」的回應去當導覽退路,瀏覽器會直接拒絕
 *   (Response served by service worker has redirections),結果是:
 *   線上一切正常、測試全綠,**只有真的斷網那一刻才會壞**。
 *
 * 用法:
 *   node scripts/check-offline.mjs
 *   BASE=https://hfpc-minesweeper.summer09201017.workers.dev node scripts/check-offline.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:4173';

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

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  console.log(`\n▶ 離線驗收 ${BASE}`);

  // ① 先上線開一次,讓 Service Worker 裝好、把資產收進快取
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.board .cell');
  const swReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'no-sw-api';
    const reg = await navigator.serviceWorker.ready;
    return reg.active ? 'active' : 'not-active';
  });
  check('Service Worker 裝得起來', swReady === 'active', swReady);

  // 等 precache 真的寫進 Cache Storage(install 是非同步的)
  await page.waitForFunction(
    async () => {
      const names = await caches.keys();
      for (const n of names) {
        const keys = await (await caches.open(n)).keys();
        if (keys.length > 3) return true;
      }
      return false;
    },
    { timeout: 20000 }
  );

  const cached = await page.evaluate(async () => {
    const out = [];
    for (const n of await caches.keys()) {
      for (const req of await (await caches.open(n)).keys()) out.push(req.url);
    }
    return out;
  });
  check('資產有進快取', cached.length > 3, `${cached.length} 筆`);

  // ★ 關鍵:快取裡的導覽退路不可以是「被導向過」的回應
  const redirected = await page.evaluate(async () => {
    const bad = [];
    for (const n of await caches.keys()) {
      const c = await caches.open(n);
      for (const req of await c.keys()) {
        const res = await c.match(req);
        if (res && res.redirected) bad.push(req.url);
      }
    }
    return bad;
  });
  check(
    '快取裡沒有「被導向過」的回應(有的話斷網會整個打不開)',
    redirected.length === 0,
    redirected.join(', ')
  );

  // ② 斷網,重新載入
  await ctx.setOffline(true);
  let navOk = true;
  let navErr = '';
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) {
    navOk = false;
    navErr = e.message.split('\n')[0];
  }
  check('斷網後重新載入不會失敗', navOk, navErr);

  if (navOk) {
    const hasBoard = await page
      .waitForSelector('.board .cell', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check('斷網後棋盤畫得出來', hasBoard);

    if (hasBoard) {
      // 離線也要能真的玩:第一次點擊會跑無猜盤面生成(純本機運算,不需要網路)
      await page.locator('.cell[data-i="40"]').click();
      const opened = await page
        .waitForFunction(
          () => document.querySelectorAll('.cell[data-state="revealed"]').length > 0,
          { timeout: 15000 }
        )
        .then(() => true)
        .catch(() => false);
      check('斷網後還能開格子(無猜盤面生成是純本機運算)', opened);
    }
  }

  check('沒有頁面層級的錯誤', errors.length === 0, errors.slice(0, 2).join(' | '));

  await ctx.setOffline(false);
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
