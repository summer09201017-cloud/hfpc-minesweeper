import { type Board, type BoardSpec, type FirstClickRule, neighbors } from './types';
import { createBoard, placeMines, safeCellCount } from './board';
import { createView, deduce, type SolveView } from './solver';
import { mulberry32 } from './rng';

/**
 * 無猜盤面生成器。
 *
 * 流程:玩家按下第一格 → ① 隨機佈雷(避開首點)→ ② 讓 solver 從首點自己玩一遍
 * → ③ 全開得了就採用,卡住就丟掉重抽。
 *
 * ★ 盤面是在「第一格按下去之後」才生成的,所以生成器知道玩家從哪裡開始,
 *   能一直重抽到抽出一盤保證不用猜的為止。
 * ★ 有時間預算上限。預算內生不出來就**退回一般盤面,並如實回報 noGuess: false** ——
 *   畫面必須照這個旗標講實話,絕不可以把普通盤當成無猜盤端給玩家。
 */

export interface SimResult {
  /** 全部非雷格都被推出來了嗎(= 整局不用猜) */
  solved: boolean;
  /** 推到卡住時開出來的格數 */
  revealed: number;
  /**
   * solver 說「安全」但實際上是雷 —— 永遠應該是 false。
   * 真的出現代表推理引擎有 bug,測試要把它當紅燈,不可以默默吞掉。
   */
  unsound: boolean;
}

/** 照真實盤面把一格(含零格連鎖)開進 view。回傳新開出的格數。 */
export function revealInView(view: SolveView, board: Board, start: number): number {
  if (view.revealed[start] || board.cells[start].mine) return 0;
  let count = 0;
  const stack = [start];
  while (stack.length) {
    const i = stack.pop() as number;
    if (view.revealed[i] || view.mineKnown[i]) continue;
    view.revealed[i] = true;
    view.adj[i] = board.cells[i].adj;
    count++;
    if (board.cells[i].adj === 0) {
      for (const n of neighbors(board, i)) {
        if (!view.revealed[n] && !board.cells[n].mine) stack.push(n);
      }
    }
  }
  return count;
}

/** 讓推理引擎從首點自己玩一遍,看能不能不靠猜就全開。 */
export function simulateSolve(board: Board, firstIndex: number, maxSteps = 5000): SimResult {
  const view = createView(board);
  let revealed = revealInView(view, board, firstIndex);
  const target = safeCellCount(board);
  let unsound = false;

  for (let step = 0; step < maxSteps; step++) {
    if (revealed >= target) return { solved: true, revealed, unsound };
    const d = deduce(view);
    if (d.safe.length === 0 && d.mines.length === 0) break; // 推不動了 ⇒ 這裡要猜
    for (const m of d.mines) view.mineKnown[m] = true;
    for (const s of d.safe) {
      if (board.cells[s].mine) {
        unsound = true;
        return { solved: false, revealed, unsound };
      }
      revealed += revealInView(view, board, s);
    }
  }

  return { solved: revealed >= target, revealed, unsound };
}

export interface GenOptions {
  spec: BoardSpec;
  firstIndex: number;
  rule: FirstClickRule;
  seed: number;
  /** 時間預算(毫秒)。到點就收手,退回一般盤面。 */
  budgetMs?: number;
  /** 嘗試次數上限。 */
  maxAttempts?: number;
  /** 注入時鐘,測試才用得到。 */
  now?: () => number;
}

export interface GenResult {
  board: Board;
  /** 這盤真的是「全程不用猜」嗎。false = 預算內沒生出來,已退回一般盤面。 */
  noGuess: boolean;
  attempts: number;
  ms: number;
}

const DEFAULT_BUDGET_MS = 2500;
const DEFAULT_MAX_ATTEMPTS = 4000;

/** 一般盤面(只有首點保護,可能需要猜)—— XP 原版就是這個。 */
export function generatePlain(opts: Pick<GenOptions, 'spec' | 'firstIndex' | 'rule' | 'seed'>): Board {
  const rnd = mulberry32(opts.seed);
  return placeMines(createBoard(opts.spec), opts.firstIndex, opts.rule, rnd);
}

/**
 * 同步版:一路抽到生出無猜盤或預算用完。小盤(初級/中級)夠快,測試也走這支。
 * 大盤請用 generateNoGuessAsync,不然主執行緒會卡住、畫面來不及畫「生成中…」。
 */
export function generateNoGuess(opts: GenOptions): GenResult {
  const now = opts.now ?? (() => Date.now());
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const rnd = mulberry32(opts.seed);
  const t0 = now();

  let attempts = 0;
  let last: Board | null = null;
  while (attempts < maxAttempts && now() - t0 < budgetMs) {
    attempts++;
    const board = placeMines(createBoard(opts.spec), opts.firstIndex, opts.rule, rnd);
    last = board;
    const sim = simulateSolve(board, opts.firstIndex);
    if (sim.solved) return { board, noGuess: true, attempts, ms: now() - t0 };
  }

  // 預算用完 —— 退回一般盤面,並如實標記
  const board = last ?? placeMines(createBoard(opts.spec), opts.firstIndex, opts.rule, rnd);
  return { board, noGuess: false, attempts, ms: now() - t0 };
}

/** 讓出主執行緒一次,讓瀏覽器有機會把「生成中…」畫出來。 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 非同步版:每抽 BATCH 次就讓出主執行緒一次,畫面不會凍住。
 * 高級盤(30×16/99)會抽比較多次,這支是實際遊戲用的那一支。
 */
export async function generateNoGuessAsync(opts: GenOptions): Promise<GenResult> {
  const now = opts.now ?? (() => Date.now());
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const rnd = mulberry32(opts.seed);
  const t0 = now();
  const BATCH = 8;

  let attempts = 0;
  let last: Board | null = null;
  while (attempts < maxAttempts && now() - t0 < budgetMs) {
    for (let k = 0; k < BATCH && attempts < maxAttempts; k++) {
      attempts++;
      const board = placeMines(createBoard(opts.spec), opts.firstIndex, opts.rule, rnd);
      last = board;
      const sim = simulateSolve(board, opts.firstIndex);
      if (sim.solved) return { board, noGuess: true, attempts, ms: now() - t0 };
    }
    await yieldToBrowser();
  }

  const board = last ?? placeMines(createBoard(opts.spec), opts.firstIndex, opts.rule, rnd);
  return { board, noGuess: false, attempts, ms: now() - t0 };
}
