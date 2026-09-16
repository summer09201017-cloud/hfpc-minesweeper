/**
 * 背景場景畫 —— 桌面那一片「窗外風景」。
 *
 * ★ 零美術檔:全部是**行內 SVG 疊成的 CSS 多層背景**,沒有任何 .png/.jpg 要下載,
 *   離線一樣看得到,也不會有「圖還沒載完先白一下」。
 * ★ 只寫一個 CSS 變數 `--desk-bg`(和舊版一樣)—— 元件一行都不用改。
 *   CSS 的 `background` 簡寫吃得下「多層」:前面的層蓋在後面的層上面,
 *   最後一層放漸層 + 一個純色保底(萬一某一層壞掉,不會露出白底)。
 * ★ 位置一律用**百分比**、大小一律用 **vmin**:
 *   手機直向 390×800 和教室投影 1920×1080 差了四倍,寫死 px 的太陽在手機上會佔掉半個天空。
 *   百分比定位還有一個好處 —— 不管什麼比例的螢幕,太陽都不會被切到畫面外。
 * ★ 全部靜態、不做動畫:背景會動 = 每一幀都在重繪,而這款的主角是棋盤;
 *   而且 `prefers-reduced-motion` 的人也不該被桌布晃到。
 *
 * 選單那顆小方塊不畫場景(見 `swatch`):68×52 的鈕裡面塞一顆 20vmin 的太陽只會糊成一團。
 */

import { mulberry32 } from './game/rng';

export interface Backdrop {
  id: string;
  name: string;
  /** 桌面背景的完整 CSS `background` 值;null = 跟著主題走 */
  bg: string | null;
  /** 選單預覽用的單純漸層(場景縮到指甲大看不出是什麼) */
  swatch?: string;
  /** 一句話說明,選單裡顯示在按鈕的 title */
  note?: string;
}

// ───────────────────────────── 工具

/**
 * 把 SVG 變成 CSS 用得了的 data URI。
 *
 * ⚠ `#` 一定要編碼成 `%23` —— 不編碼的話瀏覽器會把 `#` 當成 URL 的片段分隔符,
 *   `fill='#ffffff'` 之後的東西全部被切掉,結果是**整層背景無聲消失**:
 *   不會報錯、console 乾淨、測試也照樣綠。(scenery.test.ts 有一條就在守這個。)
 */
export function svgUrl(svg: string): string {
  const one = svg.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
  const enc = one
    .replace(/%/g, '%25')
    .replace(/&/g, '%26')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, "'");
  return `url("data:image/svg+xml,${enc}")`;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** 用固定種子灑點 —— 手寫三十顆星星既長又假,亂數灑出來才像真的星空。 */
function scatter(count: number, seed: number, fn: (rnd: () => number, i: number) => string): string {
  const rnd = mulberry32(seed);
  let out = '';
  for (let i = 0; i < count; i++) out += fn(rnd, i);
  return out;
}

function svg(viewBox: string, body: string): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'>${body}</svg>`;
}

/** 一層背景:`圖 no-repeat 位置 / 大小`。 */
function layer(image: string, repeat: string, pos: string, size: string): string {
  return `${image} ${repeat} ${pos} / ${size}`;
}

// ───────────────────────────── 白天的零件

/** ☀ 太陽:光暈 + 八道光芒 + 本體。 */
function sun(core = '#fff6c4', mid = '#ffdb5c', edge = '#ffab2e'): string {
  let rays = '';
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    rays +=
      `<line x1='${r1(50 + Math.cos(a) * 34)}' y1='${r1(50 + Math.sin(a) * 34)}' ` +
      `x2='${r1(50 + Math.cos(a) * 46)}' y2='${r1(50 + Math.sin(a) * 46)}'/>`;
  }
  return svg(
    '0 0 100 100',
    `<defs>
      <radialGradient id='s'>
        <stop offset='0' stop-color='${core}'/>
        <stop offset='.6' stop-color='${mid}'/>
        <stop offset='1' stop-color='${edge}'/>
      </radialGradient>
      <radialGradient id='h'>
        <stop offset='.45' stop-color='${mid}' stop-opacity='.45'/>
        <stop offset='1' stop-color='${mid}' stop-opacity='0'/>
      </radialGradient>
     </defs>
     <circle cx='50' cy='50' r='50' fill='url(#h)'/>
     <g stroke='${mid}' stroke-width='3.4' stroke-linecap='round' opacity='.9'>${rays}</g>
     <circle cx='50' cy='50' r='28' fill='url(#s)'/>`
  );
}

/** ☁ 白雲:三坨 + 底下一道陰影,不是一個橢圓。 */
function cloud(top = '#ffffff', shade = '#d7e7f5', opacity = '.95'): string {
  return svg(
    '0 0 200 92',
    `<g opacity='${opacity}'>
      <ellipse cx='62' cy='56' rx='40' ry='26' fill='${top}'/>
      <ellipse cx='104' cy='42' rx='36' ry='31' fill='${top}'/>
      <ellipse cx='146' cy='58' rx='33' ry='23' fill='${top}'/>
      <rect x='28' y='56' width='148' height='26' rx='13' fill='${top}'/>
      <rect x='36' y='70' width='132' height='12' rx='6' fill='${shade}'/>
     </g>`
  );
}

/** 🌈 彩虹:七道弧,半透明才像光不像塑膠。 */
function rainbow(): string {
  const cols = ['#ff5a5a', '#ff9d3c', '#ffd93c', '#5ec85e', '#4db3ff', '#4667dd', '#9b6ee0'];
  let arcs = '';
  cols.forEach((c, k) => {
    const rr = 86 - k * 9;
    arcs += `<path d='M${100 - rr} 108 A${rr} ${rr} 0 0 1 ${100 + rr} 108' stroke='${c}'/>`;
  });
  return svg(
    '0 0 200 112',
    `<g fill='none' stroke-width='9' stroke-linecap='butt' opacity='.5'>${arcs}</g>`
  );
}

/** 🐦 飛鳥:三隻遠山一般大小的 v 字。 */
function birds(color = '#3c4b5c', opacity = '.55'): string {
  return svg(
    '0 0 130 64',
    `<g fill='none' stroke='${color}' stroke-width='3' stroke-linecap='round' opacity='${opacity}'>
      <path d='M8 30 q9 -9 18 0 q9 -9 18 0'/>
      <path d='M60 14 q7 -7 14 0 q7 -7 14 0'/>
      <path d='M78 44 q6 -6 12 0 q6 -6 12 0'/>
     </g>`
  );
}

/** 🌳 樹:闊葉 + 松樹 + 灌木,一塊會橫向重複的帶子。 */
function trees(): string {
  return svg(
    '0 0 320 150',
    `<g>
      <rect x='46' y='84' width='13' height='62' rx='3' fill='#7a5230'/>
      <path d='M52 120 l-16 -14 M53 104 l16 -14' stroke='#7a5230' stroke-width='5' stroke-linecap='round' fill='none'/>
      <ellipse cx='52' cy='70' rx='40' ry='31' fill='#2f6b26'/>
      <ellipse cx='40' cy='62' rx='24' ry='19' fill='#3f8a31'/>
      <ellipse cx='66' cy='58' rx='19' ry='15' fill='#4ea03a'/>

      <rect x='158' y='104' width='10' height='42' rx='3' fill='#6b4526'/>
      <path d='M163 24 l-30 44 h60 z' fill='#2c6b2d'/>
      <path d='M163 52 l-36 48 h72 z' fill='#357a33'/>
      <path d='M163 80 l-42 52 h84 z' fill='#2c6b2d'/>

      <ellipse cx='256' cy='124' rx='34' ry='23' fill='#3d8330'/>
      <ellipse cx='240' cy='118' rx='20' ry='15' fill='#4ea03a'/>
      <ellipse cx='296' cy='134' rx='20' ry='14' fill='#357a2c'/>
     </g>`
  );
}

/** 🌼 花朵 + 草叢:最靠近鏡頭的一層,鋪在畫面最底下。 */
function flowers(): string {
  const petal = (x: number, y: number, s: number, c: string, core: string): string => {
    let p = '';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      p += `<circle cx='${r1(x + Math.cos(a) * s)}' cy='${r1(y + Math.sin(a) * s)}' r='${r1(s * 0.8)}' fill='${c}'/>`;
    }
    return `${p}<circle cx='${x}' cy='${y}' r='${r1(s * 0.66)}' fill='${core}'/>`;
  };

  const blades = scatter(16, 0x6a5d, (rnd) => {
    const x = r1(rnd() * 300);
    const h = r1(14 + rnd() * 20);
    const bend = r1((rnd() - 0.5) * 16);
    return `<path d='M${x} 96 q${bend} ${r1(-h * 0.6)} ${r1(bend * 1.6)} ${r1(-h)}' stroke='#3f8a31' stroke-width='3' stroke-linecap='round' fill='none'/>`;
  });

  const stems =
    `<g stroke='#2f6b28' stroke-width='3' stroke-linecap='round' fill='none'>` +
    `<path d='M40 96 q-3 -22 1 -34'/><path d='M112 96 q4 -26 -1 -40'/>` +
    `<path d='M186 96 q-4 -20 0 -30'/><path d='M254 96 q5 -24 0 -36'/></g>`;

  return svg(
    '0 0 300 100',
    `<g>${blades}</g>${stems}
     ${petal(41, 56, 7, '#ffffff', '#ffd23c')}
     ${petal(111, 50, 8, '#ff7eb0', '#ffe27a')}
     ${petal(186, 62, 6.5, '#ffd23c', '#ff9e2c')}
     ${petal(254, 54, 7.5, '#b98cf0', '#fff0a8')}`
  );
}

// ───────────────────────────── 夜晚的零件

/** 🌙 弦月:用 mask 挖出來的,不是拿兩個圓硬拼(拼的那種在深色底上會露出接縫)。 */
function crescent(): string {
  return svg(
    '0 0 100 100',
    `<defs>
      <radialGradient id='mh'>
        <stop offset='.42' stop-color='#fff4c8' stop-opacity='.34'/>
        <stop offset='1' stop-color='#fff4c8' stop-opacity='0'/>
      </radialGradient>
      <mask id='mc'>
        <rect width='100' height='100' fill='#ffffff'/>
        <circle cx='66' cy='40' r='32' fill='#000000'/>
      </mask>
     </defs>
     <circle cx='50' cy='50' r='48' fill='url(#mh)'/>
     <circle cx='50' cy='50' r='33' fill='#fdf6d2' mask='url(#mc)'/>`
  );
}

/** 🌕 滿月:帶環形山與大光暈,給「月夜森林」用。 */
function fullMoon(): string {
  const craters = scatter(7, 0x4d21, (rnd) => {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 20;
    return `<circle cx='${r1(50 + Math.cos(a) * d)}' cy='${r1(50 + Math.sin(a) * d)}' r='${r1(2 + rnd() * 5)}' fill='#e2d8ae' opacity='.75'/>`;
  });
  return svg(
    '0 0 100 100',
    `<defs>
      <radialGradient id='fh'>
        <stop offset='.3' stop-color='#fdf6d2' stop-opacity='.42'/>
        <stop offset='1' stop-color='#fdf6d2' stop-opacity='0'/>
      </radialGradient>
     </defs>
     <circle cx='50' cy='50' r='50' fill='url(#fh)'/>
     <circle cx='50' cy='50' r='27' fill='#fdf6d2'/>
     ${craters}`
  );
}

/** ✨ 星空:兩層不同密度疊起來才有遠近,單層會看得出磁磚接縫。 */
function stars(seed: number, count: number, maxR: number, sparks: number): string {
  const dots = scatter(count, seed, (rnd) => {
    const x = r1(rnd() * 400);
    const y = r1(rnd() * 400);
    return `<circle cx='${x}' cy='${y}' r='${r1(0.7 + rnd() * maxR)}' opacity='${r1(0.35 + rnd() * 0.6)}'/>`;
  });
  const four = scatter(sparks, seed ^ 0x9e37, (rnd) => {
    const x = r1(24 + rnd() * 352);
    const y = r1(24 + rnd() * 352);
    const s = r1(6 + rnd() * 6);
    const i = r1(s * 0.26);
    return (
      `<path d='M${x} ${r1(y - s)} L${r1(x + i)} ${r1(y - i)} L${r1(x + s)} ${y} ` +
      `L${r1(x + i)} ${r1(y + i)} L${x} ${r1(y + s)} L${r1(x - i)} ${r1(y + i)} ` +
      `L${r1(x - s)} ${y} L${r1(x - i)} ${r1(y - i)} Z' opacity='.85'/>`
    );
  });
  return svg('0 0 400 400', `<g fill='#ffffff'>${dots}</g><g fill='#dbe8ff'>${four}</g>`);
}

/** ☄ 流星:尾巴要是漸層,實心線看起來像刮痕。 */
function meteor(): string {
  return svg(
    '0 0 160 90',
    `<defs>
      <linearGradient id='mt' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='#ffffff' stop-opacity='0'/>
        <stop offset='1' stop-color='#ffffff' stop-opacity='.9'/>
      </linearGradient>
     </defs>
     <path d='M8 8 L112 66' stroke='url(#mt)' stroke-width='3' stroke-linecap='round' fill='none'/>
     <circle cx='115' cy='68' r='3.6' fill='#ffffff'/>`
  );
}

/** ⛰ 遠山剪影:兩道稜線,前深後淺才有空氣感。 */
function ridges(back: string, front: string): string {
  return svg(
    '0 0 600 170',
    `<path d='M0 170 L0 98 L72 44 L132 94 L192 58 L262 120 L332 70 L402 122 L472 66 L542 114 L600 80 L600 170 Z' fill='${back}'/>
     <path d='M0 170 L0 132 L80 106 L162 140 L252 112 L342 144 L432 110 L522 140 L600 114 L600 170 Z' fill='${front}'/>`
  );
}

/** 🌲 針葉林剪影:月夜森林的前景。 */
function pines(color = '#08161d'): string {
  const row = scatter(9, 0x3f19, (rnd, i) => {
    const x = r1(20 + i * 42 + (rnd() - 0.5) * 14);
    const h = r1(64 + rnd() * 54);
    const w = r1(15 + rnd() * 9);
    const base = 170;
    return (
      `<path d='M${x} ${r1(base - h)} L${r1(x - w)} ${r1(base - h * 0.42)} L${r1(x - w * 0.6)} ${r1(base - h * 0.42)} ` +
      `L${r1(x - w * 1.35)} ${base} L${r1(x + w * 1.35)} ${base} L${r1(x + w * 0.6)} ${r1(base - h * 0.42)} ` +
      `L${r1(x + w)} ${r1(base - h * 0.42)} Z' fill='${color}'/>`
    );
  });
  return svg('0 0 400 170', `${row}<rect x='0' y='162' width='400' height='8' fill='${color}'/>`);
}

/** 🪰 螢火蟲:幾點帶光暈的黃,零動畫也看得出是夏夜。 */
function fireflies(): string {
  const dots = scatter(11, 0x77aa, (rnd) => {
    const x = r1(rnd() * 300);
    const y = r1(rnd() * 300);
    return (
      `<circle cx='${x}' cy='${y}' r='${r1(5 + rnd() * 5)}' fill='#ffe680' opacity='.13'/>` +
      `<circle cx='${x}' cy='${y}' r='1.7' fill='#fff6b0' opacity='${r1(0.5 + rnd() * 0.45)}'/>`
    );
  });
  return svg('0 0 300 300', dots);
}

// ───────────────────────────── 素面背景的紋理

/** Windows 98 那種 8×8 點陣抖動 —— 當年的桌面圖樣就長這樣。 */
function dither(): string {
  return svg(
    '0 0 8 8',
    `<g fill='#ffffff' opacity='.07'><rect x='0' y='0' width='1' height='1'/><rect x='4' y='4' width='1' height='1'/></g>
     <g fill='#000000' opacity='.07'><rect x='4' y='0' width='1' height='1'/><rect x='0' y='4' width='1' height='1'/></g>`
  );
}

/** 牛皮紙的纖維與斑點。 */
function paperFibre(): string {
  const fibres = scatter(26, 0x2c71, (rnd) => {
    const x = r1(rnd() * 160);
    const y = r1(rnd() * 160);
    const len = r1(6 + rnd() * 22);
    const a = rnd() * Math.PI;
    return `<line x1='${x}' y1='${y}' x2='${r1(x + Math.cos(a) * len)}' y2='${r1(y + Math.sin(a) * len)}'/>`;
  });
  const specks = scatter(18, 0x51d3, (rnd) => {
    return `<circle cx='${r1(rnd() * 160)}' cy='${r1(rnd() * 160)}' r='${r1(0.5 + rnd() * 1.2)}'/>`;
  });
  return svg(
    '0 0 160 160',
    `<g stroke='#a89065' stroke-width='.7' opacity='.3' stroke-linecap='round'>${fibres}</g>
     <g fill='#8f7748' opacity='.18'>${specks}</g>`
  );
}

/** 素灰底的極輕顆粒:純平面在投影機上會出現色帶,一點顆粒就壓掉了。 */
function grain(): string {
  const dots = scatter(40, 0x1188, (rnd) => {
    const w = rnd() > 0.5 ? 1 : 1.4;
    return `<rect x='${r1(rnd() * 120)}' y='${r1(rnd() * 120)}' width='${w}' height='${w}'/>`;
  });
  return svg(
    '0 0 120 120',
    `<g fill='#ffffff' opacity='.05'>${dots}</g>`
  );
}

// ───────────────────────────── 場景組裝(前面的層蓋在後面的層上)

const BLISS = [
  layer(svgUrl(flowers()), 'repeat-x', '0 100%', '38vmin 13vmin'),
  layer(svgUrl(trees()), 'repeat-x', '0 84%', '52vmin 24vmin'),
  layer(svgUrl(cloud()), 'no-repeat', '18% 26%', '30vmin 14vmin'),
  layer(svgUrl(cloud('#ffffff', '#cfe2f2', '.85')), 'no-repeat', '68% 12%', '22vmin 10vmin'),
  layer(svgUrl(cloud('#ffffff', '#d7e7f5', '.7')), 'no-repeat', '46% 6%', '16vmin 7vmin'),
  layer(svgUrl(birds()), 'no-repeat', '34% 17%', '14vmin 7vmin'),
  layer(svgUrl(sun()), 'no-repeat', '90% 9%', '22vmin 22vmin'),
  layer(svgUrl(rainbow()), 'no-repeat', '12% 46%', '46vmin 26vmin'),
  'linear-gradient(180deg, #3f95df 0%, #79bfee 34%, #bfe4f6 52%, #7db85a 52%, #55953c 70%, #2f6b26 100%) #7db85a'
].join(', ');

const NIGHT = [
  layer(svgUrl(ridges('#101c33', '#080f1d')), 'repeat-x', '0 100%', '150vmin 26vmin'),
  layer(svgUrl(meteor()), 'no-repeat', '26% 22%', '24vmin 13vmin'),
  layer(svgUrl(crescent()), 'no-repeat', '86% 12%', '20vmin 20vmin'),
  layer(svgUrl(stars(0x51ae, 34, 1.5, 3)), 'repeat', '0 0', '58vmin 58vmin'),
  layer(svgUrl(stars(0xbe12, 26, 1.1, 2)), 'repeat', '30% 40%', '39vmin 39vmin'),
  // 銀河:一道斜斜的薄霧,用漸層比用圖省得多
  'linear-gradient(103deg, rgba(255,255,255,0) 38%, rgba(190,210,255,.10) 47%, rgba(225,235,255,.16) 51%, rgba(190,210,255,.09) 56%, rgba(255,255,255,0) 66%)',
  'linear-gradient(180deg, #04080f 0%, #0a1226 42%, #142a4f 76%, #1e3a63 100%) #0b1020'
].join(', ');

const MOONLIT = [
  layer(svgUrl(pines()), 'repeat-x', '0 100%', '76vmin 30vmin'),
  layer(svgUrl(fireflies()), 'repeat', '0 72%', '44vmin 34vmin'),
  layer(svgUrl(fullMoon()), 'no-repeat', '78% 14%', '26vmin 26vmin'),
  layer(svgUrl(stars(0x2f70, 30, 1.3, 3)), 'repeat', '0 0', '54vmin 54vmin'),
  'radial-gradient(60% 40% at 78% 16%, rgba(255,244,200,.16), rgba(255,244,200,0) 70%)',
  'linear-gradient(180deg, #050d1a 0%, #0c2038 44%, #16405a 78%, #235f66 100%) #0c2038'
].join(', ');

const SUNSET = [
  layer(svgUrl(ridges('#4a2b46', '#2a1830')), 'repeat-x', '0 100%', '150vmin 24vmin'),
  layer(svgUrl(birds('#2a1830', '.75')), 'no-repeat', '72% 34%', '16vmin 8vmin'),
  layer(svgUrl(cloud('#ffb98a', '#e07a6e', '.85')), 'no-repeat', '16% 22%', '30vmin 14vmin'),
  layer(svgUrl(cloud('#ffd3a4', '#e8907c', '.7')), 'no-repeat', '80% 14%', '22vmin 10vmin'),
  // ★ 落日**不能**擺在畫面正中央:遊戲視窗就坐在那裡,擺中間等於白畫一顆太陽
  //   (2026-09-16 截圖驗收才看到 —— 圖層數、SVG 解碼全都是綠的)。
  layer(svgUrl(sun('#fff2c0', '#ffc25c', '#ff7a3c')), 'no-repeat', '17% 62%', '30vmin 30vmin'),
  'radial-gradient(52vmin 32vmin at 17% 66%, rgba(255,196,110,.5), rgba(255,196,110,0) 70%)',
  'linear-gradient(180deg, #2b2050 0%, #6d3a6d 26%, #c94f6c 48%, #ff8f5a 68%, #ffc98a 84%, #a8613c 100%) #d9536b'
].join(', ');

const TEAL = [
  'radial-gradient(130% 95% at 50% 38%, rgba(255,255,255,.10), rgba(0,0,0,.30) 100%)',
  layer(svgUrl(dither()), 'repeat', '0 0', '8px 8px'),
  '#008080'
].join(', ');

const PLAIN = [
  layer(svgUrl(grain()), 'repeat', '0 0', '120px 120px'),
  'radial-gradient(135% 105% at 50% 32%, #838383 0%, #5f5f5f 58%, #3d3d3d 100%) #6b6b6b'
].join(', ');

const PAPER = [
  layer(svgUrl(paperFibre()), 'repeat', '0 0', '160px 160px'),
  'radial-gradient(9vmin 3vmin at 22% 76%, rgba(120,88,40,.16), rgba(120,88,40,0) 70%)',
  'radial-gradient(7vmin 7vmin at 79% 24%, rgba(140,102,48,.14), rgba(140,102,48,0) 70%)',
  'radial-gradient(140% 110% at 50% 30%, #e3d4ae 0%, #d3c096 60%, #b8a377 100%) #d9c9a3'
].join(', ');

// ───────────────────────────── 名單

export const BACKDROPS: Backdrop[] = [
  { id: 'auto', name: '跟著主題', bg: null, note: '桌面用主題自己的顏色' },
  {
    id: 'bliss',
    name: '草原藍天',
    bg: BLISS,
    swatch: 'linear-gradient(180deg,#5aa7e8 0%,#a8d8f0 52%,#6aa84f 52%,#3f7a2e 100%)',
    note: '太陽・白雲・彩虹・樹林・野花'
  },
  {
    id: 'night',
    name: '星空夜色',
    bg: NIGHT,
    swatch: 'linear-gradient(180deg,#0b1020,#1a2a44)',
    note: '弦月・銀河・流星・遠山'
  },
  {
    id: 'moonlit',
    name: '月夜森林',
    bg: MOONLIT,
    swatch: 'linear-gradient(180deg,#0c2038,#235f66)',
    note: '滿月・星星・松林・螢火蟲'
  },
  {
    id: 'sunset',
    name: '夕陽',
    bg: SUNSET,
    swatch: 'linear-gradient(180deg,#ff9a5a,#d9536b 55%,#4a2a5a)',
    note: '落日・晚霞・歸鳥・山稜'
  },
  { id: 'teal', name: '98 青綠', bg: TEAL, swatch: '#008080', note: '當年的點陣桌布圖樣' },
  {
    id: 'plain',
    name: '素灰',
    bg: PLAIN,
    swatch: '#6b6b6b',
    // 這一張刻意保持乾淨:投影上課、或只想專心解題的時候,背景不該來搶戲。
    note: '最不干擾,投影上課用這張'
  },
  { id: 'paper', name: '牛皮紙', bg: PAPER, swatch: '#d9c9a3', note: '紙纖維與淡淡的茶漬' }
];
