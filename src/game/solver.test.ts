import { describe, it, expect } from 'vitest';
import {
  createView,
  deduce,
  deduceSimple,
  deduceSubset,
  deduceTank,
  type SolveView
} from './solver';
import { at, boardFrom, viewFrom } from './testkit';
import { createBoard, placeMines } from './board';
import { PRESETS } from './types';
import { mulberry32 } from './rng';
import { revealInView, simulateSolve } from './generator';

/** 這一輪推出東西了嗎 —— 迴圈的中止條件,不是斷言。 */
function found(d: { safe: number[]; mines: number[] }): boolean {
  return d.safe.length > 0 || d.mines.length > 0;
}

/** 把整排 / 整片格子標成「已開」,測試裡好寫。 */
function rowIndices(width: number, y: number): number[] {
  return Array.from({ length: width }, (_, x) => y * width + x);
}

describe('① 單格規則', () => {
  it('數字等於未開鄰格數 ⇒ 那些鄰格全是雷', () => {
    // 右上角 (2,0) 只有三個鄰居,三個都是雷 ⇒ 它開出來是 3,三格全部確定
    const b = boardFrom(['.*.', '.**', '...']);
    const v = viewFrom(b, [at(b, 2, 0)]);
    expect(b.cells[at(b, 2, 0)].adj).toBe(3);

    const d = deduceSimple(v);
    expect(d.mines).toContain(at(b, 1, 0));
    expect(d.mines).toContain(at(b, 1, 1));
    expect(d.mines).toContain(at(b, 2, 1));
  });

  it('旗數已滿 ⇒ 其餘鄰格全安全', () => {
    const b = boardFrom(['*..', '...', '...']);
    const v = viewFrom(b, [at(b, 1, 1)], [at(b, 0, 0)]);
    const d = deduceSimple(v);
    expect(d.safe).toContain(at(b, 2, 2));
    expect(d.safe.length).toBeGreaterThan(0);
  });

  it('剩餘雷數歸零 ⇒ 全盤剩下的格子都安全', () => {
    const b = boardFrom(['*..', '...', '...']);
    const v = viewFrom(b, [at(b, 1, 1)], [at(b, 0, 0)]);
    const d = deduceSimple(v);
    // 唯一的雷已知 ⇒ 其他七格全安全
    expect(d.safe.length).toBe(7);
  });
});

describe('② 子集規則(1-2-1 那個直覺)', () => {
  it('A⊂B 且雷數差等於多出來的格數 ⇒ 多出來的必定是雷', () => {
    // 第 0 列藏雷,第 1、2 列全開。雷在 x=0,2,4
    const b = boardFrom(['*.*.*', '.....', '.....']);
    const revealed = [...rowIndices(5, 1), ...rowIndices(5, 2)];
    const v = viewFrom(b, revealed);

    // 先確認單格規則推不出東西(不然就測不到子集規則)
    const simple = deduceSimple(v);
    expect(simple.safe.length).toBe(0);
    expect(simple.mines.length).toBe(0);

    const d = deduceSubset(v);
    // (0,1)管{c0,c1}=1、(1,1)管{c0,c1,c2}=2 ⇒ 差出來的 c2 必是雷
    expect(d.mines).toContain(at(b, 2, 0));
    expect(b.cells[at(b, 2, 0)].mine).toBe(true);
  });
});

describe('③ 窮舉層真的有在做事', () => {
  it('隨機盤面裡找得到「前兩層推不動、窮舉層推得動」的局面,且推的都對', () => {
    let tankWins = 0;
    let checked = 0;

    for (let seed = 1; seed <= 60 && tankWins < 3; seed++) {
      const spec = PRESETS.intermediate;
      const first = 8 * spec.width + 8;
      const board = placeMines(createBoard(spec), first, 'opening', mulberry32(seed));
      const v = createView(board);
      revealInView(v, board, first);

      // 只用前兩層一路推到卡住
      for (let step = 0; step < 400; step++) {
        const a = deduceSimple(v);
        const bb = found(a) ? a : deduceSubset(v);
        if (!found(bb)) break;
        for (const m of bb.mines) v.mineKnown[m] = true;
        for (const s of bb.safe) revealInView(v, board, s);
      }

      const t = deduceTank(v);
      if (!found(t)) continue;
      tankWins++;

      // 窮舉層推出來的每一格都必須和真實盤面一致
      for (const s of t.safe) {
        expect(board.cells[s].mine).toBe(false);
        checked++;
      }
      for (const m of t.mines) {
        expect(board.cells[m].mine).toBe(true);
        checked++;
      }
    }

    expect(tankWins).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(0);
  });
});

describe('50/50:推不出來的時候必須誠實地推不出來', () => {
  it('兩格在牆邊、所有線索都看到同樣兩格 ⇒ 三層全部放棄', () => {
    // 2 格寬:上面兩格藏著唯一一顆雷,下面四格全開。
    // 兩個線索都在說「這兩格剛好一顆雷」,哪一格是雷永遠推不出來。
    const b = boardFrom(['*.', '..', '..']);
    const v = viewFrom(b, [at(b, 0, 1), at(b, 1, 1), at(b, 0, 2), at(b, 1, 2)]);

    const d = deduce(v);
    expect(d.safe.length).toBe(0);
    expect(d.mines.length).toBe(0);
  });

  it('這種盤 simulateSolve 會回報 solved:false(不會假裝解開)', () => {
    const b = boardFrom(['*.', '..', '..']);
    const r = simulateSolve(b, at(b, 0, 2));
    expect(r.solved).toBe(false);
    expect(r.unsound).toBe(false);
  });
});

describe('健全性:只能少推,絕不能推錯', () => {
  it('300 個隨機初級盤全程模擬,推出來的每一格都和真實盤面一致', () => {
    let totalDeduced = 0;

    for (let seed = 1; seed <= 300; seed++) {
      const spec = PRESETS.beginner;
      const first = seed % (spec.width * spec.height);
      const board = placeMines(createBoard(spec), first, 'opening', mulberry32(seed));
      const v: SolveView = createView(board);
      revealInView(v, board, first);

      for (let step = 0; step < 300; step++) {
        const d = deduce(v);
        if (!found(d)) break;
        for (const s of d.safe) {
          expect(board.cells[s].mine).toBe(false);
          totalDeduced++;
        }
        for (const m of d.mines) {
          expect(board.cells[m].mine).toBe(true);
          totalDeduced++;
        }
        for (const m of d.mines) v.mineKnown[m] = true;
        for (const s of d.safe) revealInView(v, board, s);
      }
    }

    expect(totalDeduced).toBeGreaterThan(1000);
  });

  it('120 個隨機高級盤(30×16/99)也不會推錯', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const spec = PRESETS.expert;
      const first = 8 * spec.width + 15;
      const board = placeMines(createBoard(spec), first, 'opening', mulberry32(seed * 31));
      const r = simulateSolve(board, first);
      expect(r.unsound).toBe(false);
    }
  });
});
