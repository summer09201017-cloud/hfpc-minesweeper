/**
 * 從 SVG 產出 PNG 圖示(安裝到主畫面用)。
 *
 * ★ 為什麼非要 PNG 不可:**iOS 的 `apple-touch-icon` 只吃 PNG**(Apple 規格)。
 *   指向 SVG 的話,iPhone「加入主畫面」之後桌面圖示會變成**網頁縮圖**,
 *   不是那顆地雷 —— 而且不會有任何錯誤訊息,是你把它裝到手機上才看得到。
 *   (Android/Chrome 吃得下 SVG,所以這個缺陷在桌機與 Android 上完全看不出來。)
 *
 * ★ 為什麼 maskable 要另外產一張:Android 會把圖示**裁成圓形/方圓形**。
 *   滿版的 SVG 直接標 `purpose: maskable` 的話,四個角的立體邊框會被切掉、
 *   中間那顆雷也可能貼邊。⇒ maskable 版本把內容縮到 ~72%(安全區),周圍留底色。
 *
 * 用 Playwright 的 Chromium 當渲染器(本來就是 devDependency,不必多裝繪圖套件)。
 *   node scripts/gen-icons.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SRC = 'public/icons/icon-512.svg';
const OUT = 'public/icons';

/** 要產的尺寸:192/512 給 manifest,180 給 iOS。 */
const PLAIN = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 }
];
/** maskable:內容縮到安全區,四周補底色。 */
const MASKABLE = [{ file: 'icon-maskable-512.png', size: 512, inset: 0.14, bg: '#c0c0c0' }];

const svg = readFileSync(SRC, 'utf8');

/**
 * 讓 SVG 撐滿容器:**只動根元素的 width/height**。
 * ⚠ 第一版寫成「整份檔案的 width=/height= 全部拿掉」,結果把 `<rect width="64" height="64">`
 *   那塊灰底和地雷上的白色反光點一起拔掉 —— 產出來的圖示變成透明底 + 沒有反光。
 *   PNG 檔是好的、魔術位元組也對、腳本印 ✓,**只有真的打開圖來看才發現**。
 */
function fitSvg(src) {
  return src.replace(/<svg([^>]*)>/, (_m, attrs) => {
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${cleaned} width="100%" height="100%">`;
  });
}

const page = await (await chromium.launch()).newPage();

async function render({ file, size, inset = 0, bg = 'transparent' }) {
  const pad = Math.round(size * inset);
  const inner = size - pad * 2;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${bg};
       display:flex;align-items:center;justify-content:center">
       <div style="width:${inner}px;height:${inner}px">${fitSvg(svg)}</div>
     </body></html>`
  );
  const buf = await page.screenshot({ omitBackground: bg === 'transparent' });
  writeFileSync(`${OUT}/${file}`, buf);
  // PNG 魔術位元組:確定產出來的真的是 PNG,不是一個副檔名叫 .png 的東西
  const head = readFileSync(`${OUT}/${file}`).subarray(0, 8);
  const ok = head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  console.log(`${ok ? '✓' : '✗'} ${file} ${size}×${size} (${buf.length} bytes)`);
  if (!ok) process.exitCode = 1;
}

for (const s of PLAIN) await render(s);
for (const s of MASKABLE) await render(s);

await page.context().browser()?.close();
