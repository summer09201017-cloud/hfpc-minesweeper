/**
 * 「這個盤面塞不塞得進這個螢幕」——純計算,沒有 DOM。
 *
 * ★ 為什麼要有這支:格子大小是 CSS 算的(見 xp.css 的 `--cell`),那是對的 ——
 *   用 JS 量容器會自己追自己(`.window` 的寬度本來就是被棋盤撐出來的)。
 *   但「要不要提醒使用者轉個方向 / 換個難度」需要**先知道結果**,
 *   所以這裡用和 CSS 完全一樣的公式算一次,兩邊的常數必須同步(有測試釘著)。
 *
 * ★★ 2026-09-16 量出來的事實(iPhone 尺寸、線上版):
 *   舊公式**只看寬度**,所以手機橫向時格子被放到 34px 上限,棋盤反而比螢幕還高 ——
 *   初級要上下捲 1.6 個螢幕、中級 2.2 個、高級 1.9 個。
 *   而踩地雷的核心動作是「一眼掃全盤、前後數字互相參照」,**要捲就等於玩不下去**;
 *   更糟的是捲動和長按插旗互相打架(手指按住不動 400ms 才算長按,而你正想捲)。
 *   ⇒ 公式改成「寬度算出來的」與「高度算出來的」取小。
 */

/** 觸控下限:寧可捲動也不要小到點不中。 */
export const CELL_MIN = 22;
/**
 * 上限:桌機再大只是浪費螢幕(XP 原版格子才 16px)。
 * ★ 但**手機要放寬**:初級盤 9 欄在 390 寬的手機上,34px 只用掉 306px、右邊空著 84px ——
 *   使用者按了 ⛶ 會說「跟放大前差不多」,因為棋盤本來就沒吃滿。
 *   手機(短邊 < 600px)放寬到 44px,棋盤才真的撐滿。
 */
export const CELL_MAX = 34;
export const CELL_MAX_TOUCH = 44;
export const PHONE_SHORT_EDGE = 600;

/**
 * 棋盤左右的框線與內距合計(xp.css 的 --board-chrome)。
 * ★ 38 是**量出來的**(#root 內距 + 視窗框 + game-outer 內距 + 凹陷框)。
 *   第一版寫 40,害中級直向(棋盤 352 + 殼 38 = 390 = 剛好滿版)被判成「放不下」,
 *   跳出一句「16×16 是給電腦螢幕的盤面」——而那個畫面根本不用捲。**差 2px 的誤報**。
 */
export const BOARD_CHROME_W = 38;

/**
 * 棋盤上下的殼合計。實測值(390×844 iPhone,2026-09-16):
 *   一般:topbar 40 + 標題列 25 + 選單列 37 + 七段面板 56 + 狀態列 28 + 底部列 100 = 286
 *   沉浸:七段面板 56 + 精簡底部列 44 + 各層內距 40 ≈ 140
 * 留一點餘裕免得剛好差幾像素就開始捲。
 */
export const UI_CHROME = { normal: 300, immersive: 150 } as const;

export interface FitInput {
  cols: number;
  rows: number;
  viewportW: number;
  viewportH: number;
  immersive?: boolean;
}

export interface FitResult {
  /** 實際會用的格子邊長(px) */
  cell: number;
  /** 寬度放得下(不必左右捲) */
  fitsWidth: boolean;
  /** 高度放得下(不必上下捲) */
  fitsHeight: boolean;
  /** 兩個方向都放得下 */
  fits: boolean;
}

function clamp(lo: number, v: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function computeFit(i: FitInput): FitResult {
  const chromeH = i.immersive ? UI_CHROME.immersive : UI_CHROME.normal;
  const byW = (i.viewportW - BOARD_CHROME_W) / i.cols;
  const byH = (i.viewportH - chromeH) / i.rows;

  /**
   * ★★ 高度放不下時,格子縮到**觸控下限**為止(而不是放到寬度允許的最大)。
   *
   * 這條改過兩次,兩次都是量出來才知道錯的(2026-09-16,390×844 / 844×390 實測):
   *   · 第一版 `min(byW, byH)` 無條件受高度限制 ⇒ 橫向格子縮到 22px **卻還是要捲 1.39 螢幕**
   *     ⇒ 我當時推論「縮了換不到放得下就是純虧」,改成放不下時用 byW。
   *   · 第二版(用 byW)⇒ 橫向寬度很寬,格子直接放到上限 44px,棋盤 704px,
   *     **要捲 2.69 個螢幕** —— 比第一版還慘一倍。那個「純虧」的推論在數字面前是錯的:
   *     捲動才是主要痛點,而 22px 仍在觸控下限之上。
   * ⇒ 定案 `min(byW, max(byH, CELL_MIN))`:高度夠就照高度,高度不夠就縮到下限(捲最少),
   *   然後**誠實提示轉方向或按 ⛶**,不要假裝這個方向能玩。
   */
  const maxCell =
    Math.min(i.viewportW, i.viewportH) < PHONE_SHORT_EDGE ? CELL_MAX_TOUCH : CELL_MAX;
  const cell = clamp(CELL_MIN, Math.min(byW, Math.max(byH, CELL_MIN)), maxCell);
  const fitsWidth = cell * i.cols <= i.viewportW - BOARD_CHROME_W;
  const fitsHeight = cell * i.rows <= i.viewportH - chromeH;
  return { cell, fitsWidth, fitsHeight, fits: fitsWidth && fitsHeight };
}

export type FitAdvice =
  | { kind: 'ok' }
  /** 這個螢幕放不下,但轉個方向就放得下 */
  | { kind: 'rotate'; to: 'landscape' | 'portrait' }
  /** 轉哪個方向都放不下 —— 誠實說「這個盤面不適合這台裝置」 */
  | { kind: 'too-big' };

/**
 * 該給什麼建議。
 *
 * ★ 舊版寫死「高級盤請轉橫向」,而**量出來那句話是錯的**:轉過去要捲更多
 *   (橫向 1.9 個螢幕 vs 直向 1.4 個)。⇒ 建議一律用算的,不要用猜的。
 * ★ 放不下時**不假裝有解**:30×16 是桌機盤面,手機上沒有能同時滿足
 *   「格子點得到」與「一眼看得完」的解,就直說。
 */
export function adviceFor(i: FitInput): FitAdvice {
  if (computeFit(i).fits) return { kind: 'ok' };
  const rotated = computeFit({ ...i, viewportW: i.viewportH, viewportH: i.viewportW });
  if (rotated.fits) {
    return { kind: 'rotate', to: i.viewportW >= i.viewportH ? 'portrait' : 'landscape' };
  }
  return { kind: 'too-big' };
}
