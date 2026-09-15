import { type Board, neighbors } from './types';

/**
 * 3BV 與效率 —— 踩地雷玩家圈的標準指標。
 *
 * 3BV(Bechtel's Board Benchmark Value)= 「用最少幾次左鍵可以開完這一盤」。
 * 它衡量的是**盤面本身的份量**,不是玩家技術:
 *   - 每一片零格連鎖(opening)算 1 下(點裡面任一格就整片開了)
 *   - 每一個「不靠著任何零格」的數字格各算 1 下(非得自己點不可)
 *
 * 效率 = 3BV ÷ 實際左鍵次數。100% 代表一下都沒浪費;高手用和弦常常破 100%。
 * 有了它,「30 秒過初級」才有比較的基準 —— 有些盤天生就比較好開。
 */

/** 這一盤的 3BV。需要盤面已佈雷。 */
export function calc3BV(b: Board): number {
  const total = b.width * b.height;
  const inOpening = new Array<boolean>(total).fill(false);
  let value = 0;

  // ① 每一片零格連鎖算 1
  const seen = new Array<boolean>(total).fill(false);
  for (let i = 0; i < total; i++) {
    if (seen[i] || b.cells[i].mine || b.cells[i].adj !== 0) continue;
    value++;
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const c = stack.pop() as number;
      inOpening[c] = true;
      if (b.cells[c].adj !== 0) continue; // 連鎖只從零格往外長
      for (const n of neighbors(b, c)) {
        if (b.cells[n].mine) continue;
        inOpening[n] = true; // 零格的鄰居會被順便開出來
        if (!seen[n] && b.cells[n].adj === 0) {
          seen[n] = true;
          stack.push(n);
        }
      }
    }
  }

  // ② 沒被任何零格帶到的數字格,每一格各算 1
  for (let i = 0; i < total; i++) {
    if (b.cells[i].mine) continue;
    if (b.cells[i].adj === 0) continue;
    if (!inOpening[i]) value++;
  }

  return value;
}

/** 效率(0~1 以上)。點擊數為 0 時回 0,不做除以零。 */
export function efficiency(bbbv: number, clicks: number): number {
  if (clicks <= 0) return 0;
  return bbbv / clicks;
}

/** 每秒開出的 3BV —— 速度指標,老玩家看這個。 */
export function bbbvPerSecond(bbbv: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return bbbv / seconds;
}

export function formatPercent(x: number): string {
  return `${Math.round(x * 100)}%`;
}
