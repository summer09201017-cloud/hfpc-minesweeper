import { describe, expect, it } from 'vitest';
import {
  BOARD_CHROME_W,
  CELL_MAX,
  CELL_MAX_TOUCH,
  CELL_MIN,
  UI_CHROME,
  adviceFor,
  computeFit
} from './fit';

/**
 * 版面計算的測試。
 *
 * ★★ 這一支的價值不在「算得對」,在於**釘死兩條我自己推論錯、量了才知道的規則**:
 *   ① 無條件受高度限制 ⇒ 橫向格子縮到 22px 卻還是要捲(縮了沒換到東西)
 *   ② 放不下就用寬度 ⇒ 橫向格子放到 44px,要捲 2.69 個螢幕(比 ① 慘一倍)
 *   兩次都是「聽起來很合理」的推論。沒有這些測試,下一個人(或下一個我)會再推論一次。
 *
 * 所有 viewport 數字都是真機尺寸(iPhone 14/15 的 CSS 像素)。
 */

const PHONE_PORTRAIT = { viewportW: 390, viewportH: 844 };
const PHONE_LANDSCAPE = { viewportW: 844, viewportH: 390 };
const BEGINNER = { cols: 9, rows: 9 };
const INTERMEDIATE = { cols: 16, rows: 16 };
const EXPERT = { cols: 30, rows: 16 };

describe('格子大小', () => {
  it('手機直向初級:吃滿寬度(不要留一大塊空白在旁邊)', () => {
    const f = computeFit({ ...BEGINNER, ...PHONE_PORTRAIT });
    // (390 - 38) / 9 = 39.1
    expect(f.cell).toBeGreaterThan(38);
    expect(f.cell).toBeLessThanOrEqual(CELL_MAX_TOUCH);
    expect(f.fits).toBe(true);
  });

  it('★ 手機橫向高度放不下時,縮到觸控下限(捲最少),不是放到寬度允許的最大', () => {
    const f = computeFit({ ...BEGINNER, ...PHONE_LANDSCAPE });
    expect(f.cell).toBe(CELL_MIN);
    // 反例釘死:若改回「用寬度」,格子會變 44px、棋盤 396px、要捲將近兩個螢幕
    const byW = (PHONE_LANDSCAPE.viewportW - BOARD_CHROME_W) / BEGINNER.cols;
    expect(byW).toBeGreaterThan(CELL_MIN * 2);
  });

  it('★ 沉浸模式讓橫向初級真的放得下(這就是 ⛶ 該有的效果)', () => {
    const before = computeFit({ ...BEGINNER, ...PHONE_LANDSCAPE });
    const after = computeFit({ ...BEGINNER, ...PHONE_LANDSCAPE, immersive: true });
    expect(before.fitsHeight).toBe(false);
    expect(after.fitsHeight).toBe(true);
    expect(after.cell).toBeGreaterThan(before.cell); // 格子還變大了
  });

  it('桌機不放寬上限(XP 原味格子才 16px,放大會變成另一款遊戲)', () => {
    const f = computeFit({ ...BEGINNER, viewportW: 1280, viewportH: 860 });
    expect(f.cell).toBe(CELL_MAX);
  });

  it('格子永遠不低於觸控下限', () => {
    for (const spec of [BEGINNER, INTERMEDIATE, EXPERT]) {
      for (const vp of [PHONE_PORTRAIT, PHONE_LANDSCAPE, { viewportW: 320, viewportH: 480 }]) {
        expect(computeFit({ ...spec, ...vp }).cell).toBeGreaterThanOrEqual(CELL_MIN);
      }
    }
  });
});

describe('放不放得下', () => {
  it('中級直向放得下 —— 差 2px 也不可以誤報', () => {
    // 16 × 22 = 352,而 390 - 38 = 352 ⇒ 剛好。
    // ★ BOARD_CHROME_W 第一版寫 40(352 > 350)⇒ 誤判成放不下,
    //   跳出「16×16 是給電腦螢幕的盤面」,而那個畫面**根本不用捲**。
    const f = computeFit({ ...INTERMEDIATE, ...PHONE_PORTRAIT });
    expect(f.fitsWidth).toBe(true);
    expect(f.fits).toBe(true);
    expect(adviceFor({ ...INTERMEDIATE, ...PHONE_PORTRAIT })).toEqual({ kind: 'ok' });
  });

  it('初級直向、初級橫向+沉浸:都放得下', () => {
    expect(adviceFor({ ...BEGINNER, ...PHONE_PORTRAIT })).toEqual({ kind: 'ok' });
    expect(adviceFor({ ...BEGINNER, ...PHONE_LANDSCAPE, immersive: true })).toEqual({ kind: 'ok' });
  });

  it('初級橫向(沒收殼)放不下 ⇒ 建議轉直向', () => {
    expect(adviceFor({ ...BEGINNER, ...PHONE_LANDSCAPE })).toEqual({
      kind: 'rotate',
      to: 'portrait'
    });
  });

  it('★ 高級盤在手機上轉哪個方向都放不下 ⇒ 誠實說 too-big,不叫他轉來轉去', () => {
    // 舊版寫死「高級盤請轉橫向」,量出來那句話是錯的:橫向要捲 1.9 個螢幕、直向 1.4 個。
    expect(adviceFor({ ...EXPERT, ...PHONE_PORTRAIT }).kind).toBe('too-big');
    expect(adviceFor({ ...EXPERT, ...PHONE_LANDSCAPE }).kind).toBe('too-big');
    expect(adviceFor({ ...EXPERT, ...PHONE_PORTRAIT, immersive: true }).kind).toBe('too-big');
  });

  it('桌機上三種難度都放得下(不可以對著電腦跳手機提示)', () => {
    for (const spec of [BEGINNER, INTERMEDIATE, EXPERT]) {
      expect(adviceFor({ ...spec, viewportW: 1280, viewportH: 860 })).toEqual({ kind: 'ok' });
    }
  });
});

describe('常數要和 CSS 同步', () => {
  it('殼的估計值有大有小才有意義(沉浸一定比一般小很多)', () => {
    expect(UI_CHROME.immersive).toBeLessThan(UI_CHROME.normal);
    // 收掉的量要夠大才有感:至少要多出一整排格子的高度
    expect(UI_CHROME.normal - UI_CHROME.immersive).toBeGreaterThanOrEqual(CELL_MIN * 4);
  });

  it('上限下限沒有寫反', () => {
    expect(CELL_MIN).toBeLessThan(CELL_MAX);
    expect(CELL_MAX).toBeLessThan(CELL_MAX_TOUCH);
  });
});
