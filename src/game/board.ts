import {
  type Board,
  type BoardSpec,
  type Cell,
  type FirstClickRule,
  neighbors
} from './types';
import { type Rng, shuffle } from './rng';

/** 每次改動都回傳新的 Board(cells 也整份複製)—— React 靠參考變動重繪。
 *  720 格 × 一個小物件的複製成本在 0.1ms 以下,拿來換「絕不誤改到舊 state」很划算。 */
export function cloneBoard(b: Board): Board {
  return { ...b, cells: b.cells.map((c) => ({ ...c })) };
}

export function emptyCell(): Cell {
  return { mine: false, adj: 0, state: 'hidden' };
}

export function createBoard(spec: BoardSpec): Board {
  const total = spec.width * spec.height;
  return {
    width: spec.width,
    height: spec.height,
    mines: spec.mines,
    cells: Array.from({ length: total }, emptyCell),
    placed: false,
    status: 'ready',
    revealedCount: 0,
    flagCount: 0,
    hitIndex: null
  };
}

/** 把使用者輸入的自訂盤夾到合法範圍,並保證雷數留得下首點保護要的空格。 */
export function clampSpec(spec: BoardSpec): BoardSpec {
  const width = Math.max(5, Math.min(30, Math.floor(spec.width) || 5));
  const height = Math.max(5, Math.min(24, Math.floor(spec.height) || 5));
  const total = width * height;
  // opening 規則最多要空出 9 格(首點 + 八鄰)。兩種首點規則刻意共用同一個上限 ——
  // 不然玩家在自訂盤把雷塞滿之後切成 opening,就會生不出盤面。
  const maxMines = Math.max(1, total - 9);
  const mines = Math.max(1, Math.min(maxMines, Math.floor(spec.mines) || 1));
  return { width, height, mines };
}

/**
 * 首點保護要空出來的格子。
 *
 * ★ XP 原版的做法是「首點若是雷,就把那顆雷搬到左上角第一個空位」。本作改成
 *   「佈雷時直接排除首點」—— 玩家看到的保證完全一樣(首點絕不是雷),但雷的分布
 *   比較均勻,不會像原版那樣讓左上角長期偏多。這是刻意的偏離,記在這裡免得被當成 bug。
 */
export function forbiddenFor(
  b: Pick<Board, 'width' | 'height'>,
  safeIndex: number,
  rule: FirstClickRule
): Set<number> {
  const out = new Set<number>([safeIndex]);
  if (rule === 'opening') for (const n of neighbors(b, safeIndex)) out.add(n);
  return out;
}

/** 依索引清單佈雷並重算鄰雷數。生成器要注入指定盤面時也走這裡。 */
export function placeMinesAt(b: Board, mineIndices: Iterable<number>): Board {
  const nb = cloneBoard(b);
  for (const c of nb.cells) {
    c.mine = false;
    c.adj = 0;
  }
  let count = 0;
  for (const i of mineIndices) {
    if (!nb.cells[i] || nb.cells[i].mine) continue;
    nb.cells[i].mine = true;
    count++;
  }
  for (let i = 0; i < nb.cells.length; i++) {
    if (!nb.cells[i].mine) continue;
    for (const n of neighbors(nb, i)) nb.cells[n].adj++;
  }
  nb.mines = count;
  nb.placed = true;
  return nb;
}

/**
 * 隨機佈雷,避開首點保護區。
 * 若空格不夠(自訂盤雷太多),自動退回 `safe` 規則 —— 寧可少保護,也不要生不出盤面。
 */
export function placeMines(
  b: Board,
  safeIndex: number,
  rule: FirstClickRule,
  rnd: Rng
): Board {
  const total = b.width * b.height;
  let forbidden = forbiddenFor(b, safeIndex, rule);
  if (total - forbidden.size < b.mines) forbidden = forbiddenFor(b, safeIndex, 'safe');

  const pool: number[] = [];
  for (let i = 0; i < total; i++) if (!forbidden.has(i)) pool.push(i);
  shuffle(pool, rnd);
  return placeMinesAt(b, pool.slice(0, b.mines));
}

/** 非雷格總數 —— 全開就是勝利。 */
export function safeCellCount(b: Pick<Board, 'width' | 'height' | 'mines'>): number {
  return b.width * b.height - b.mines;
}

/**
 * 勝利收尾:XP 會把剩下沒插的雷自動插上旗、剩餘雷數歸零。
 * 直接改傳進來的 board(呼叫端已經是複製品)。
 */
function settleWin(b: Board): void {
  b.status = 'won';
  let flags = 0;
  for (const c of b.cells) {
    if (c.mine) {
      c.state = 'flag';
      flags++;
    } else if (c.state === 'flag' || c.state === 'question') {
      // 非雷格上的旗在勝利時不可能存在(全部非雷格都開了),保險起見清掉
      c.state = 'revealed';
    }
  }
  b.flagCount = flags;
}

/** 失敗收尾:掀開所有沒被插旗的雷;插錯的旗留著讓畫面畫 ❌。 */
function settleLoss(b: Board, hitIndex: number): void {
  b.status = 'lost';
  b.hitIndex = hitIndex;
  for (const c of b.cells) {
    if (c.mine && c.state !== 'flag') c.state = 'revealed';
  }
}

function checkWin(b: Board): void {
  if (b.status === 'playing' && b.revealedCount >= safeCellCount(b)) settleWin(b);
}

/**
 * 開格子(含零格連鎖展開)。
 * - 旗子擋住不開(XP 行為;問號可以開)
 * - 踩雷 → 整局結束
 * - 連鎖展開不會穿過旗子
 */
export function reveal(b: Board, start: number): Board {
  if (b.status === 'won' || b.status === 'lost') return b;
  const cell = b.cells[start];
  if (!cell || cell.state === 'revealed' || cell.state === 'flag') return b;

  const nb = cloneBoard(b);
  if (nb.status === 'ready') nb.status = 'playing';

  if (nb.cells[start].mine) {
    settleLoss(nb, start);
    return nb;
  }

  const stack = [start];
  while (stack.length) {
    const i = stack.pop() as number;
    const c = nb.cells[i];
    if (c.state === 'revealed' || c.state === 'flag') continue;
    c.state = 'revealed';
    nb.revealedCount++;
    if (c.adj === 0) {
      for (const n of neighbors(nb, i)) {
        const nc = nb.cells[n];
        if (nc.state !== 'revealed' && nc.state !== 'flag') stack.push(n);
      }
    }
  }

  checkWin(nb);
  return nb;
}

/**
 * 右鍵循環標記。allowQuestion 關閉時只在 hidden ↔ flag 之間切(XP 的「標記(?)」選項)。
 */
export function cycleMark(b: Board, i: number, allowQuestion: boolean): Board {
  if (b.status === 'won' || b.status === 'lost') return b;
  const cell = b.cells[i];
  if (!cell || cell.state === 'revealed') return b;

  const nb = cloneBoard(b);
  if (nb.status === 'ready') nb.status = 'playing';
  const c = nb.cells[i];
  if (c.state === 'hidden') {
    c.state = 'flag';
    nb.flagCount++;
  } else if (c.state === 'flag') {
    nb.flagCount--;
    c.state = allowQuestion ? 'question' : 'hidden';
  } else {
    c.state = 'hidden';
  }
  return nb;
}

/**
 * 和弦展開(左右鍵同按 / 手機在數字上點一下)。
 * 條件:已開的數字格,周圍旗數 == 數字 ⇒ 展開其餘未插旗的鄰格。
 * ⚠ 旗插錯了就會炸 —— 這是 XP 的行為,也是 chord 的風險所在,不可以「幫玩家檢查」。
 */
export function chord(b: Board, i: number): Board {
  if (b.status !== 'playing') return b;
  const cell = b.cells[i];
  if (!cell || cell.state !== 'revealed' || cell.adj === 0) return b;

  const ns = neighbors(b, i);
  let flags = 0;
  for (const n of ns) if (b.cells[n].state === 'flag') flags++;
  if (flags !== cell.adj) return b;

  const targets = ns.filter((n) => {
    const s = b.cells[n].state;
    return s === 'hidden' || s === 'question';
  });
  if (targets.length === 0) return b;

  // 先看會不會炸:炸的話要一次把所有雷掀開,不能開一半
  const boom = targets.find((n) => b.cells[n].mine);
  if (boom != null) {
    const nb = cloneBoard(b);
    settleLoss(nb, boom);
    return nb;
  }

  let out = b;
  for (const n of targets) out = reveal(out, n);
  return out;
}

/** 目前該顯示的「剩餘雷數」。XP 允許變成負數(旗插超過雷數)。 */
export function minesLeft(b: Board): number {
  return b.mines - b.flagCount;
}
