/**
 * 換皮 / 換顏色 / 換背景。
 *
 * 三個獨立旋鈕,刻意不綁在一起:
 *   ① 主題(皮)—— 視窗面、斜角、標題列、七段顯示器、數字八色
 *   ② 背景    —— 視窗後面那片「桌面」,可以獨立於主題自己選
 *   ③ 音樂    —— 見 audio/bgm.ts
 *
 * ★ 全部靠 CSS 變數:套用 = 把變數寫到 <html> 上,一行也不用改元件。
 * ★ 數字八色是踩地雷的肌肉記憶,所以每個主題都要**自己定義全部八色**,
 *   不可以只換底色讓數字沿用 —— 深色皮配 #0000ff 的「1」根本看不見。
 *   這條有測試守著(themes.test.ts:每個主題逐色算 WCAG 對比)。
 */

export interface Theme {
  id: string;
  name: string;
  /** 選單裡的小預覽色(面色 / 標題色 / 數字 1 的顏色) */
  swatch: [string, string, string];
  vars: Record<string, string>;
}

/** 每個主題都必須定義的變數 —— 少一個,畫面就會沿用上一個主題的殘留值。 */
export const REQUIRED_VARS = [
  '--face',
  '--light',
  '--shadow',
  '--ink',
  '--ink-dim',
  '--desk-bg',
  '--title-1',
  '--title-2',
  '--title-ink',
  '--seg-bg',
  '--seg-on',
  '--seg-off',
  '--n1',
  '--n2',
  '--n3',
  '--n4',
  '--n5',
  '--n6',
  '--n7',
  '--n8'
] as const;

const XP_NUMBERS = {
  '--n1': '#0000ff',
  '--n2': '#008000',
  '--n3': '#ff0000',
  '--n4': '#000080',
  '--n5': '#800000',
  '--n6': '#008080',
  '--n7': '#000000',
  '--n8': '#808080'
};

export const THEMES: Theme[] = [
  {
    id: 'xp',
    name: '經典 XP',
    swatch: ['#c0c0c0', '#0a5bd3', '#0000ff'],
    vars: {
      '--face': '#c0c0c0',
      '--light': '#ffffff',
      '--shadow': '#808080',
      '--ink': '#000000',
      '--ink-dim': '#444444',
      '--desk-bg': 'linear-gradient(160deg, #4a8ad4, #23528f)',
      '--title-1': '#0a5bd3',
      '--title-2': '#3f8ef5',
      '--title-ink': '#ffffff',
      '--seg-bg': '#000000',
      '--seg-on': '#ff0000',
      '--seg-off': '#3b0000',
      ...XP_NUMBERS
    }
  },
  {
    id: 'win98',
    name: '懷舊 98',
    swatch: ['#c0c0c0', '#000080', '#0000ff'],
    vars: {
      '--face': '#c0c0c0',
      '--light': '#ffffff',
      '--shadow': '#808080',
      '--ink': '#000000',
      '--ink-dim': '#444444',
      '--desk-bg': '#008080',
      '--title-1': '#000080',
      '--title-2': '#1084d0',
      '--title-ink': '#ffffff',
      '--seg-bg': '#000000',
      '--seg-on': '#ff0000',
      '--seg-off': '#3b0000',
      ...XP_NUMBERS
    }
  },
  {
    id: 'dark',
    name: '夜間深色',
    swatch: ['#3c4046', '#20242b', '#7aa2ff'],
    vars: {
      '--face': '#3c4046',
      '--light': '#5c626c',
      '--shadow': '#1c1f24',
      '--ink': '#e8ecf3',
      '--ink-dim': '#aab3c0',
      '--desk-bg': 'linear-gradient(160deg, #1b2330, #0a0d12)',
      '--title-1': '#20242b',
      '--title-2': '#39404c',
      '--title-ink': '#e8ecf3',
      '--seg-bg': '#0b0c0e',
      '--seg-on': '#ff5a5a',
      '--seg-off': '#3a1212',
      // 深底要亮字 —— XP 原色在這裡幾乎全看不見
      '--n1': '#7aa2ff',
      '--n2': '#6ddf8e',
      '--n3': '#ff7b7b',
      '--n4': '#b3a5ff',
      '--n5': '#ffb066',
      '--n6': '#5fd9d9',
      '--n7': '#ffffff',
      '--n8': '#c8cdd6'
    }
  },
  {
    id: 'forest',
    name: '森林木紋',
    swatch: ['#d8cbab', '#4a6b32', '#1a3f8f'],
    vars: {
      '--face': '#d8cbab',
      '--light': '#f2e9d2',
      '--shadow': '#8a7a58',
      '--ink': '#231d10',
      '--ink-dim': '#5b5236',
      '--desk-bg': 'linear-gradient(160deg, #3f6b34, #1f3a1c)',
      '--title-1': '#4a6b32',
      '--title-2': '#74a054',
      '--title-ink': '#ffffff',
      '--seg-bg': '#231d10',
      '--seg-on': '#ffb300',
      '--seg-off': '#4a3505',
      '--n1': '#1a3f8f',
      '--n2': '#14671f',
      '--n3': '#b81414',
      '--n4': '#3a1d7a',
      '--n5': '#7a3a08',
      '--n6': '#0d5f5f',
      '--n7': '#231d10',
      '--n8': '#5e5540'
    }
  },
  {
    id: 'ocean',
    name: '海洋藍',
    swatch: ['#cfe3f0', '#1b5e86', '#0b2f8f'],
    vars: {
      '--face': '#cfe3f0',
      '--light': '#eef7fd',
      '--shadow': '#7ba0b8',
      '--ink': '#04161f',
      '--ink-dim': '#3f5f6e',
      '--desk-bg': 'linear-gradient(160deg, #2b7fb8, #0b2d4a)',
      '--title-1': '#1b5e86',
      '--title-2': '#3d9bcc',
      '--title-ink': '#ffffff',
      '--seg-bg': '#04161f',
      '--seg-on': '#37e0ff',
      '--seg-off': '#05404f',
      '--n1': '#0b2f8f',
      '--n2': '#0f6b2e',
      '--n3': '#c21818',
      '--n4': '#4a1f86',
      '--n5': '#8a3b0b',
      '--n6': '#0a5f66',
      '--n7': '#04161f',
      '--n8': '#4e6a78'
    }
  },
  {
    id: 'sakura',
    name: '櫻花粉',
    swatch: ['#f5dde6', '#a8486f', '#1f3fa8'],
    vars: {
      '--face': '#f5dde6',
      '--light': '#fff2f6',
      '--shadow': '#c095a6',
      '--ink': '#2a0e1a',
      '--ink-dim': '#6b5460',
      '--desk-bg': 'linear-gradient(160deg, #e59ab8, #8a4a74)',
      '--title-1': '#a8486f',
      '--title-2': '#e08bad',
      '--title-ink': '#ffffff',
      '--seg-bg': '#2a0e1a',
      '--seg-on': '#ff5a93',
      '--seg-off': '#59152f',
      '--n1': '#1f3fa8',
      '--n2': '#12662c',
      '--n3': '#c41a3f',
      '--n4': '#54207e',
      '--n5': '#8a3a12',
      '--n6': '#0d5f63',
      '--n7': '#2a0e1a',
      '--n8': '#6b5460'
    }
  },
  {
    id: 'contrast',
    name: '高對比(投影用)',
    swatch: ['#ffffff', '#000000', '#0000cc'],
    vars: {
      // 教室投影 + 後排孩子 + 長輩:白底黑框、粗線條、每一色都拉到最高對比
      '--face': '#ffffff',
      '--light': '#ffffff',
      '--shadow': '#000000',
      '--ink': '#000000',
      '--ink-dim': '#333333',
      '--desk-bg': '#101010',
      '--title-1': '#000000',
      '--title-2': '#333333',
      '--title-ink': '#ffffff',
      '--seg-bg': '#000000',
      '--seg-on': '#ff2b2b',
      '--seg-off': '#2b0000',
      '--n1': '#0000cc',
      '--n2': '#006600',
      '--n3': '#cc0000',
      '--n4': '#000066',
      '--n5': '#660000',
      '--n6': '#006666',
      '--n7': '#000000',
      '--n8': '#444444'
    }
  }
];

export interface Backdrop {
  id: string;
  name: string;
  /** null = 跟著主題走 */
  bg: string | null;
}

/**
 * 背景獨立於主題 —— 有人就是想要經典灰視窗配夜空,或高對比棋盤配素色底。
 * 綁在一起的話這些組合全做不到。
 */
export const BACKDROPS: Backdrop[] = [
  { id: 'auto', name: '跟著主題', bg: null },
  { id: 'bliss', name: '草原藍天', bg: 'linear-gradient(180deg, #5aa7e8 0%, #a8d8f0 55%, #6aa84f 55%, #3f7a2e 100%)' },
  { id: 'night', name: '夜空', bg: 'linear-gradient(180deg, #0b1020, #1a2a44)' },
  { id: 'sunset', name: '夕陽', bg: 'linear-gradient(180deg, #ff9a5a, #d9536b 55%, #4a2a5a)' },
  { id: 'teal', name: '98 青綠', bg: '#008080' },
  { id: 'plain', name: '素灰', bg: '#6b6b6b' },
  { id: 'paper', name: '牛皮紙', bg: '#d9c9a3' }
];

export const DEFAULT_THEME = 'xp';
export const DEFAULT_BACKDROP = 'auto';

export function findTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function findBackdrop(id: string): Backdrop {
  return BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0];
}

/**
 * 把主題與背景寫到 <html> 的行內樣式上。
 * ★ 用 setProperty 而不是換 class:主題可以自由增減,不必同步維護一份 CSS。
 */
export function applyTheme(themeId: string, backdropId: string, root?: HTMLElement): void {
  const el = root ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (!el) return;
  const theme = findTheme(themeId);
  for (const [k, v] of Object.entries(theme.vars)) el.style.setProperty(k, v);

  const backdrop = findBackdrop(backdropId);
  // auto ⇒ 用主題自己的桌面色;其餘 ⇒ 背景蓋過主題
  el.style.setProperty('--desk-bg', backdrop.bg ?? theme.vars['--desk-bg']);

  el.dataset.theme = theme.id;
  el.dataset.backdrop = backdrop.id;

  // 讓瀏覽器分頁色 / Android 狀態列跟著走
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.vars['--face']);
  }
}
