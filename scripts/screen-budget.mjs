/**
 * 📏 螢幕預算量尺 —— 回答「這個站在手機上,棋盤/畫布真的拿到多少螢幕?」
 *
 * ★ 由來(2026-09-16):使用者說「全螢幕放大後跟放大前差不多,下方選單也不能收起來」。
 *   艦隊稽核如果用「有沒有 ⛶ 鈕」當判準,會**漏掉一整批** —— 踩地雷就有鈕、照樣紅:
 *   瀏覽器的全螢幕只收得掉它自己那條網址列(約 56px),而遊戲自己的殼可能有 286px。
 *   ⇒ 真判準是這四個數字:
 *       ① 殼佔螢幕高的百分比
 *       ② 主畫面(canvas/棋盤)佔螢幕面積的百分比
 *       ③ 整頁要捲幾個螢幕才看得完
 *       ④ **主畫面上有多少比例的點,其實點不到主畫面**(被浮動工具列/徽章接走)
 *
 * ★ 第 ④ 條是 0916-<俄羅斯方塊的全螢幕問題> 那場提出來的,而且他們量到真案例:
 *   工具列壓在橫向棋盤頂端 ⇒ 12×12 點陣裡 9 點(6.3%)被接走,**而 ①②③ 三個數字前後完全沒變**。
 *   「看得到、也夠大,就是點不到」——這一族只有逐點 elementFromPoint 量得出來。
 *
 * 用法:
 *   node scripts/screen-budget.mjs <url> [--sel=canvas,.board] [--json]
 *   node scripts/screen-budget.mjs <url> --press="全螢幕鈕的選擇器"   ← 量「按了之後有沒有變」
 *
 * ★★ 稽核最該問的就是 --press 這一問:**「有沒有 ⛶ 鈕」不是判準** ——
 *   踩地雷就有鈕,按下去卻只收掉瀏覽器那條網址列(56px),自己的殼 286px 一格沒少。
 *   判準是「按之前 vs 按之後」這兩組數字有沒有真的變。
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

const pressSel = (args.find((a) => a.startsWith('--press=')) || '').split('=').slice(1).join('=');

const browser = await chromium.launch();
const rows = [];

for (const [name, viewport] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500); // 給開場動畫/自動生成盤面一點時間
    const measure = (selectors) => page.evaluate((sels) => {
      // 主畫面 = 選擇器裡「面積最大」的那個元素(canvas 站與 DOM 棋盤站都吃得下)
      let best = null;
      for (const s of sels.split(',')) {
        for (const el of document.querySelectorAll(s.trim())) {
          const r = el.getBoundingClientRect();
          if (!best || r.width * r.height > best.w * best.h) {
            best = { w: Math.round(r.width), h: Math.round(r.height), el };
          }
        }
      }
      const stageOut = best ? { w: best.w, h: best.h } : null;
      return {
        vw: innerWidth,
        vh: innerHeight,
        stage: stageOut,
        pageH: document.documentElement.scrollHeight,
        // ④ 主畫面上被別的元素接走的取樣點 %(12×12 點陣)
        stolen: (() => {
          if (!best || !best.el) return null;
          const r = best.el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) return null;
          let hit = 0, total = 0;
          for (let gy = 0; gy < 12; gy++) {
            for (let gx = 0; gx < 12; gx++) {
              const x = r.left + (r.width * (gx + 0.5)) / 12;
              const y = r.top + (r.height * (gy + 0.5)) / 12;
              if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
              total++;
              const top = document.elementFromPoint(x, y);
              if (top && top !== best.el && !best.el.contains(top)) hit++;
            }
          }
          return total ? { pct: +((hit / total) * 100).toFixed(1), hit, total } : null;
        })(),
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
    }, selectors);

    const m = await measure(sel);
    let after = null;
    if (pressSel) {
      try {
        await page.locator(pressSel).first().click({ timeout: 4000 });
      } catch {
        // 點不到就用 DOM 直接按:量的是「按下去會不會變」,不是按鈕好不好按
        await page.evaluate((q) => document.querySelector(q)?.click(), pressSel);
      }
      await page.waitForTimeout(600);
      after = await measure(sel);
    }

    const stageArea = m.stage ? (m.stage.w * m.stage.h) / (m.vw * m.vh) : 0;
    // 殼 = 整頁高扣掉主畫面(**不是**視窗高扣掉主畫面)——
    // 棋盤溢出畫面時,用視窗高會算出一個小得離譜的殼,把最嚴重的情況說成沒事。
    const chromeH = m.stage ? Math.max(0, m.pageH - m.stage.h) : m.vh;
    const screens = m.pageH / m.vh;
    const light = stageArea >= 0.55 && screens <= 1.05 ? '🟢' : stageArea >= 0.35 && screens <= 1.2 ? '🟡' : '🔴';
    const row = { url, viewport: name, light, stolen: m.stolen, stageArea: +(stageArea * 100).toFixed(1), chromePct: +((chromeH / m.vh) * 100).toFixed(0), screens: +screens.toFixed(2), stage: m.stage, fixedBars: m.fixedBars };
    if (after) {
      const aArea = after.stage ? (after.stage.w * after.stage.h) / (after.vw * after.vh) : 0;
      row.after = {
        stageArea: +(aArea * 100).toFixed(1),
        screens: +(after.pageH / after.vh).toFixed(2),
        stage: after.stage,
        stolen: after.stolen
      };
      // 面積沒多 10%、捲動也沒少 0.1 個螢幕 ⇒ 那顆鈕等於沒有用
      row.pressHelps = aArea - stageArea > 0.1 || row.screens - row.after.screens > 0.1;
      // ★ 但「按之前就已經不用捲」時,按了沒變是**合理的**(主畫面本來就吃滿了)——
      //   少了這一條,會把做對的站也判成紅燈。
      row.pressNeeded = screens > 1.05 || stageArea < 0.35;
    }
    rows.push(row);
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
        (r.stolen ? `  觸控被接走 ${r.stolen.pct}%(${r.stolen.hit}/${r.stolen.total} 點)` : '') +
        (r.fixedBars.length ? `  固定列:${r.fixedBars.map((b) => `${b.cls || b.tag}(${b.h}px)`).join(' ')}` : '')
    );
    if (r.after) {
      const verdict = !r.pressNeeded
        ? 'ℹ️ 按之前就不用捲了(沒變是合理的)'
        : r.pressHelps
          ? '✅ 按了真的有變'
          : '❌ 按了等於沒按 —— 只收掉瀏覽器那條網址列,自己的殼一格沒少';
      console.log(
        `   ${verdict}:主畫面 ${r.stageArea}% → ${r.after.stageArea}%` +
          `(${r.after.stage.w}×${r.after.stage.h})  整頁 ${r.screens} → ${r.after.screens} 個螢幕` +
          (r.after.stolen ? `  觸控被接走 ${r.stolen?.pct ?? '?'}% → ${r.after.stolen.pct}%` : '')
      );
    }
  }
}
