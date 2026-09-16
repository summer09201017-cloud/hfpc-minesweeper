/**
 * 📏 螢幕預算量尺 —— 回答「這個站在手機上,棋盤/畫布真的拿到多少螢幕?」
 *
 * ★ 由來(2026-09-16):使用者說「全螢幕放大後跟放大前差不多,下方選單也不能收起來」。
 *   艦隊稽核如果用「有沒有 ⛶ 鈕」當判準,會**漏掉一整批** —— 踩地雷就有鈕、照樣紅:
 *   瀏覽器的全螢幕只收得掉它自己那條網址列(約 56px),而遊戲自己的殼可能有 286px。
 *   ⇒ 真判準是這三個數字:
 *       ① 殼佔螢幕高的百分比
 *       ② 主畫面(canvas/棋盤)佔螢幕面積的百分比
 *       ③ 整頁要捲幾個螢幕才看得完
 *
 * 用法:
 *   node scripts/screen-budget.mjs <url> [--sel .board] [--portrait] [--landscape]
 *   node scripts/screen-budget.mjs <url> --sel canvas --json
 *
 * 判讀(0916 實測出來的經驗值):
 *   🟢 主畫面 ≥ 55% 面積、整頁 ≤ 1.05 個螢幕
 *   🟡 主畫面 35~55%
 *   🔴 主畫面 < 35%,或整頁 > 1.2 個螢幕(要捲=一眼看不完)
 */

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const sel = (args.find((a) => a.startsWith('--sel=')) || '--sel=canvas,.board').split('=')[1];
const asJson = args.includes('--json');
if (!url) {
  console.error('用法:node scripts/screen-budget.mjs <url> [--sel=canvas] [--json]');
  process.exit(2);
}

const VIEWPORTS = [
  ['直向 390×844', { width: 390, height: 844 }],
  ['橫向 844×390', { width: 844, height: 390 }]
];

const browser = await chromium.launch();
const rows = [];

for (const [name, viewport] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500); // 給開場動畫/自動生成盤面一點時間
    const m = await page.evaluate((selectors) => {
      // 主畫面 = 選擇器裡「面積最大」的那個元素(canvas 站與 DOM 棋盤站都吃得下)
      let best = null;
      for (const s of selectors.split(',')) {
        for (const el of document.querySelectorAll(s.trim())) {
          const r = el.getBoundingClientRect();
          if (!best || r.width * r.height > best.w * best.h) {
            best = { w: Math.round(r.width), h: Math.round(r.height) };
          }
        }
      }
      return {
        vw: innerWidth,
        vh: innerHeight,
        stage: best,
        pageH: document.documentElement.scrollHeight,
        // 有沒有「一直站在那裡」的固定列(常見的收不起來的選單)
        fixedBars: [...document.querySelectorAll('body *')]
          .filter((el) => {
            const cs = getComputedStyle(el);
            if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
            const r = el.getBoundingClientRect();
            return r.height >= 24 && r.width >= innerWidth * 0.5 && cs.display !== 'none';
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0, 30), h: Math.round(r.height) };
          })
          .slice(0, 5)
      };
    }, sel);

    const stageArea = m.stage ? (m.stage.w * m.stage.h) / (m.vw * m.vh) : 0;
    // 殼 = 整頁高扣掉主畫面(**不是**視窗高扣掉主畫面)——
    // 棋盤溢出畫面時,用視窗高會算出一個小得離譜的殼,把最嚴重的情況說成沒事。
    const chromeH = m.stage ? Math.max(0, m.pageH - m.stage.h) : m.vh;
    const screens = m.pageH / m.vh;
    const light = stageArea >= 0.55 && screens <= 1.05 ? '🟢' : stageArea >= 0.35 && screens <= 1.2 ? '🟡' : '🔴';
    rows.push({ url, viewport: name, light, stageArea: +(stageArea * 100).toFixed(1), chromePct: +((chromeH / m.vh) * 100).toFixed(0), screens: +screens.toFixed(2), stage: m.stage, fixedBars: m.fixedBars });
  } catch (e) {
    rows.push({ url, viewport: name, light: '⚠', error: String(e).slice(0, 80) });
  }
  await ctx.close();
}
await browser.close();

if (asJson) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  for (const r of rows) {
    if (r.error) {
      console.log(`${r.light} ${r.viewport}  ${r.error}`);
      continue;
    }
    console.log(
      `${r.light} ${r.viewport}  主畫面 ${String(r.stageArea).padStart(5)}% 面積 ` +
        `(${r.stage.w}×${r.stage.h})  殼佔高 ${String(r.chromePct).padStart(3)}%  整頁 ${r.screens} 個螢幕` +
        (r.fixedBars.length ? `  固定列:${r.fixedBars.map((b) => `${b.cls || b.tag}(${b.h}px)`).join(' ')}` : '')
    );
  }
}
