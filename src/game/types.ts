/** 難度檔位。XP 原版三檔 + 自訂。 */
export type Difficulty = 'beginner' | 'intermediate' | 'expert' | 'custom';

export interface BoardSpec {
  width: number;
  height: number;
  mines: number;
}

/**
 * XP 三檔的真實規格(winmine.exe)。
 * ★ 高級是 30 寬 × 16 高,不是 16×30 —— 很多仿作抄反,老玩家一眼看得出來。
 */
export const PRESETS: Record<Exclude<Difficulty, 'custom'>, BoardSpec> = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 }
};

/** 自訂盤的上下限(XP 上限是 30×24;雷數至少 1,且要留一格給首點)。 */
export const CUSTOM_LIMITS = {
  minWidth: 5,
  maxWidth: 30,
  minHeight: 5,
  maxHeight: 24
} as const;

/**
 * 首點保護(使用者 0916 拍板:做成選項,預設 opening)。
 *
 * - `safe`    XP 原味:只保證第一次點的不是雷,可能一點就開出一個「5」,還是要慢慢磨。
 * - `opening` 現代友善:保證首點是零格,一點展開一整片。Win7 之後的官方版與手機 App 都這樣。
 *
 * ★ 無猜模式下兩種都能用,但 `safe` 的可解盤面稀少得多、生成常常要退回一般盤面 ——
 *   這一點在設定面板要對使用者講明,不能讓他以為自己開了無猜卻一直拿到普通盤。
 */
export type FirstClickRule = 'safe' | 'opening';

/** 格子狀態。question 只有在「標記(?)」開啟時才進得去。 */
export type CellState = 'hidden' | 'revealed' | 'flag' | 'question';

export interface Cell {
  mine: boolean;
  /** 周圍八格的雷數 0..8。未佈雷前一律 0。 */
  adj: number;
  state: CellState;
}

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

export interface Board {
  width: number;
  height: number;
  mines: number;
  cells: Cell[];
  /** 雷佈了沒 —— XP 是第一次點擊才佈,首點保護才做得到。 */
  placed: boolean;
  status: GameStatus;
  /** 已開啟的格數(不含插旗),用來判定勝利。 */
  revealedCount: number;
  /** 插旗數(不含問號),七段顯示器的「剩餘雷數」= mines - flagCount。 */
  flagCount: number;
  /** 踩到的那一顆(畫紅底);沒踩到就是 null。 */
  hitIndex: number | null;
}

export function idx(b: Pick<Board, 'width'>, x: number, y: number): number {
  return y * b.width + x;
}

export function xOf(b: Pick<Board, 'width'>, i: number): number {
  return i % b.width;
}

export function yOf(b: Pick<Board, 'width'>, i: number): number {
  return Math.floor(i / b.width);
}

/**
 * 八方鄰居的索引。
 * ★ 刻意不快取:盤面最大 30×24=720 格,每次現算的成本遠低於維護一份快取的風險
 *   (換難度忘了清快取 = 讀到別的盤面的鄰居,而且測試不會紅)。
 */
export function neighbors(b: Pick<Board, 'width' | 'height'>, i: number): number[] {
  const x = i % b.width;
  const y = Math.floor(i / b.width);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= b.width || ny >= b.height) continue;
      out.push(ny * b.width + nx);
    }
  }
  return out;
}
