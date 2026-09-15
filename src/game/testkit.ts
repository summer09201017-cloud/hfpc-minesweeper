import { type Board } from './types';
import { createBoard, placeMinesAt } from './board';
import { createView, type SolveView } from './solver';

/**
 * 測試用:從 ASCII 圖建盤面。`*` 是雷,其他字元是空格。
 *
 *   boardFrom(['..*', '...', '*..'])
 *
 * ★ 只給測試用。手寫盤面才能把「1-2-1」「50/50」這種特定局面精準重現 ——
 *   靠亂數抽到那個局面再斷言,是測試不穩定的頭號來源。
 */
export function boardFrom(rows: string[]): Board {
  const height = rows.length;
  const width = rows[0].length;
  for (const r of rows) {
    if (r.length !== width) throw new Error(`每一列長度要一樣:${JSON.stringify(rows)}`);
  }
  const mines: number[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) if (row[x] === '*') mines.push(y * width + x);
  });
  const b = createBoard({ width, height, mines: mines.length });
  return placeMinesAt(b, mines);
}

/** 測試用:把指定格子當成「玩家已經開了」,做出一個 solver 看得懂的畫面。 */
export function viewFrom(board: Board, revealed: number[], knownMines: number[] = []): SolveView {
  const v = createView(board);
  for (const i of revealed) {
    v.revealed[i] = true;
    v.adj[i] = board.cells[i].adj;
  }
  for (const i of knownMines) v.mineKnown[i] = true;
  return v;
}

/** 把 x,y 轉成索引,測試裡寫座標比寫索引好讀。 */
export function at(board: Board, x: number, y: number): number {
  return y * board.width + x;
}
