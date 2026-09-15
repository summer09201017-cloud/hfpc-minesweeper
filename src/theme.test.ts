import { describe, it, expect } from 'vitest';
import {
  BACKDROPS,
  DEFAULT_BACKDROP,
  DEFAULT_THEME,
  REQUIRED_VARS,
  THEMES,
  findBackdrop,
  findTheme
} from './theme';

/**
 * 換皮的兩個真風險,這裡各有一組測試守著:
 *   ① 新增主題時漏定義某個變數 ⇒ 畫面沿用上一個主題的殘留值(換皮換一半)
 *   ② 換了底色卻沒換數字色 ⇒ 數字在新底色上看不見(深色皮的「1」直接消失)
 * 第 ② 條用 WCAG 對比公式機器驗,不靠人眼「看起來還好」。
 */

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`不是六位十六進位色碼:${hex}`);
  const n = parseInt(m[1], 16);
  const r = srgbToLinear((n >> 16) & 255);
  const g = srgbToLinear((n >> 8) & 255);
  const b = srgbToLinear(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const NUMBER_VARS = ['--n1', '--n2', '--n3', '--n4', '--n5', '--n6', '--n7', '--n8'] as const;

/**
 * 刻意放行的低對比。
 *
 * ★ **量出來的事實**:WinXP 原版八色裡有四色對它自己的 #c0c0c0 灰底不到 WCAG 3:1 ——
 *      2 綠 #008000 = 2.82:1   3 紅 #ff0000 = 2.20:1
 *      6 青 #008080 = 2.62:1   8 灰 #808080 = 2.17:1
 *   (原本以為只有灰色的 8 不合格,寫了這組測試才發現是四色。)
 * ★ 這是**原版本身**的缺點,不是我們寫壞的。而這款的賣點就是原味復刻 ——
 *   把紅色的 3 改深就不是踩地雷了,老玩家第一眼就會發現。
 *   ⇒ 決定:保留原色,另外提供「高對比(投影用)」主題給教室投影與長輩,
 *     並在選項面板直接寫「投影上課建議用高對比」。
 * ★ 放行只給 xp / win98 這兩個「復刻」主題。其餘主題是我們自己設計的,**沒有藉口**,
 *   一律要過 3:1。
 */
const LOW_CONTRAST_ALLOWED: Record<string, string[]> = {
  xp: ['--n2', '--n3', '--n6', '--n8'],
  win98: ['--n2', '--n3', '--n6', '--n8']
};

describe('主題資料完整性', () => {
  it('每個主題都定義了全部必要變數(漏一個就會沿用上一個主題的殘留值)', () => {
    for (const t of THEMES) {
      const missing = REQUIRED_VARS.filter((v) => !(v in t.vars));
      expect(missing, `主題 ${t.id} 少了:${missing.join(', ')}`).toEqual([]);
    }
  });

  it('主題 id 不重複', () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('背景 id 不重複,且只有 auto 是「跟著主題」', () => {
    const ids = BACKDROPS.map((b) => b.id);
    expect(ids.length).toBe(new Set(ids).size);
    expect(BACKDROPS.filter((b) => b.bg === null).map((b) => b.id)).toEqual(['auto']);
  });

  it('每個主題都有三格預覽色(選單看得到自己要選什麼)', () => {
    for (const t of THEMES) expect(t.swatch.length, t.id).toBe(3);
  });

  it('預設值指得到真的存在的主題與背景', () => {
    expect(findTheme(DEFAULT_THEME).id).toBe(DEFAULT_THEME);
    expect(findBackdrop(DEFAULT_BACKDROP).id).toBe(DEFAULT_BACKDROP);
  });

  it('找不到的 id 回退到第一個,不會炸(舊存檔存了已刪除的主題)', () => {
    expect(findTheme('這個主題不存在').id).toBe(THEMES[0].id);
    expect(findBackdrop('nope').id).toBe(BACKDROPS[0].id);
  });
});

describe('數字看得見(WCAG 對比)', () => {
  it('每個主題的八色對自己的格子底色都有足夠對比', () => {
    const bad: string[] = [];
    for (const t of THEMES) {
      const face = t.vars['--face'];
      for (const v of NUMBER_VARS) {
        if (LOW_CONTRAST_ALLOWED[t.id]?.includes(v)) continue;
        const ratio = contrast(t.vars[v], face);
        // 3:1 = WCAG 大字/粗體的門檻;格子數字是粗體且字級大
        if (ratio < 3) bad.push(`${t.id} ${v} ${t.vars[v]} on ${face} = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(bad, bad.join(' / ')).toEqual([]);
  });

  it('放行清單裡的那幾個,確實是「原版就這樣」而不是我們寫壞的', () => {
    // 釘住 XP 原色本身:有人把它們「順手改好看一點」就會紅,提醒那是刻意保留的原味。
    const xp = findTheme('xp');
    expect(xp.vars['--face']).toBe('#c0c0c0');
    expect([xp.vars['--n2'], xp.vars['--n3'], xp.vars['--n6'], xp.vars['--n8']]).toEqual([
      '#008000',
      '#ff0000',
      '#008080',
      '#808080'
    ]);
    // 而且它們確實不到 3:1 —— 放行清單不是拿來掩蓋我們自己的失誤的
    for (const v of ['--n2', '--n3', '--n6', '--n8'] as const) {
      expect(contrast(xp.vars[v], xp.vars['--face']), v).toBeLessThan(3);
    }
  });

  it('放行清單只涵蓋復刻主題 —— 自己設計的主題不准列進去', () => {
    expect(Object.keys(LOW_CONTRAST_ALLOWED).sort()).toEqual(['win98', 'xp']);
  });

  it('「高對比」主題要嚴格得多:八色全部達到 AA 內文標準 4.5:1', () => {
    const t = findTheme('contrast');
    const bad: string[] = [];
    for (const v of NUMBER_VARS) {
      const ratio = contrast(t.vars[v], t.vars['--face']);
      if (ratio < 4.5) bad.push(`${v} = ${ratio.toFixed(2)}:1`);
    }
    expect(bad, bad.join(' / ')).toEqual([]);
  });

  it('一般文字(選單/狀態列/對話框)對視窗面色看得清楚', () => {
    // ★ 由來:深色皮做好之後,選單「遊戲/說明」與狀態列還是黑字 ——
    //   CSS 有七處寫死 #000 / #444,數字色測試完全抓不到(它只看格子裡的數字)。
    //   截圖才看出來 ⇒ 補這一條,連同 --ink-dim(說明小字)一起釘住。
    const bad: string[] = [];
    for (const t of THEMES) {
      const ink = contrast(t.vars['--ink'], t.vars['--face']);
      if (ink < 4.5) bad.push(`${t.id} --ink = ${ink.toFixed(2)}:1`);
      const dim = contrast(t.vars['--ink-dim'], t.vars['--face']);
      if (dim < 4.5) bad.push(`${t.id} --ink-dim = ${dim.toFixed(2)}:1`);
    }
    expect(bad, bad.join(' / ')).toEqual([]);
  });

  it('標題列文字對標題底色看得清楚', () => {
    const bad: string[] = [];
    for (const t of THEMES) {
      const ratio = contrast(t.vars['--title-ink'], t.vars['--title-1']);
      if (ratio < 4.5) bad.push(`${t.id} = ${ratio.toFixed(2)}:1`);
    }
    expect(bad, bad.join(' / ')).toEqual([]);
  });

  it('七段顯示器的亮段對它的黑底看得清楚', () => {
    const bad: string[] = [];
    for (const t of THEMES) {
      const ratio = contrast(t.vars['--seg-on'], t.vars['--seg-bg']);
      if (ratio < 3) bad.push(`${t.id} = ${ratio.toFixed(2)}:1`);
    }
    expect(bad, bad.join(' / ')).toEqual([]);
  });
});

describe('對比公式自我驗證', () => {
  it('黑白是 21:1、同色是 1:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#c0c0c0', '#c0c0c0')).toBeCloseTo(1, 5);
  });
});
