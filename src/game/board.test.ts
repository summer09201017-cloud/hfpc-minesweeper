import { describe, it, expect } from 'vitest';
import {
  chord,
  clampSpec,
  createBoard,
  cycleMark,
  minesLeft,
  placeMines,
  reveal,
  safeCellCount
} from './board';
import { type BoardSpec, PRESETS, neighbors } from './types';
import { mulberry32 } from './rng';
import { at, boardFrom } from './testkit';

describe('盤面規格', () => {
  it('XP 三檔的長寬雷數完全照原版(高級是 30 寬 × 16 高,不是 16×30)', () => {
    const dims = (s: BoardSpec) => [s.width, s.height, s.mines];
    expect(dims(PRESETS.beginner)).toEqual([9, 9, 10]);
    expect(dims(PRESETS.intermediate)).toEqual([16, 16, 40]);
    expect(dims(PRESETS.expert)).toEqual([30, 16, 99]);
  });

  it('自訂盤會夾到合法範圍,雷數一定留得下首點保護要的空格', () => {
    const big = clampSpec({ width: 999, height: 999, mines: 99999 });
    expect([big.width, big.height, big.mines]).toEqual([30, 24, 30 * 24 - 9]);
    const small = clampSpec({ width: 1, height: 1, mines: 0 });
    expect([small.width, small.height, small.mines]).toEqual([5, 5, 1]);
  });
});

describe('佈雷與首點保護', () => {
  it('雷數剛好等於指定數量', () => {
    const b = placeMines(createBoard(PRESETS.expert), 0, 'safe', mulberry32(1));
    expect(b.cells.filter((c) => c.mine).length).toBe(99);
    expect(b.placed).toBe(true);
  });

  it('safe 規則:跑 500 個種子,首點永遠不是雷', () => {
    for (let s = 0; s < 500; s++) {
      const spec = PRESETS.beginner;
      const first = s % (spec.width * spec.height);
      const b = placeMines(createBoard(spec), first, 'safe', mulberry32(s + 1));
      expect(b.cells[first].mine).toBe(false);
    }
  });

  it('opening 規則:跑 500 個種子,首點一定是零格(整片展開)', () => {
    for (let s = 0; s < 500; s++) {
      const spec = PRESETS.intermediate;
      const first = s % (spec.width * spec.height);
      const b = placeMines(createBoard(spec), first, 'opening', mulberry32(s + 1));
      expect(b.cells[first].mine).toBe(false);
      expect(b.cells[first].adj).toBe(0);
    }
  });

  it('自訂盤雷太多塞不下 opening 保護時,自動退回 safe(不可以生不出盤面)', () => {
    const spec = { width: 5, height: 5, mines: 16 };
    const b = placeMines(createBoard(spec), 12, 'opening', mulberry32(7));
    expect(b.cells.filter((c) => c.mine).length).toBe(16);
    expect(b.cells[12].mine).toBe(false);
  });

  it('鄰雷數算對', () => {
    const b = boardFrom(['*..', '...', '..*']);
    expect(b.cells[at(b, 1, 1)].adj).toBe(2);
    expect(b.cells[at(b, 1, 0)].adj).toBe(1);
    expect(b.cells[at(b, 2, 0)].adj).toBe(0);
  });
});

describe('開格子', () => {
  it('零格會連鎖展開一整片', () => {
    const b = boardFrom(['....', '....', '...*']);
    const r = reveal(b, at(b, 0, 0));
    // 12 格裡只有 1 顆雷,而且全盤只有一片連鎖 ⇒ 一點開 11 格 = 直接贏
    expect(r.revealedCount).toBe(11);
    expect(r.status).toBe('won');
  });

  it('數字格只開自己', () => {
    const b = boardFrom(['*...', '....', '....']);
    const r = reveal(b, at(b, 1, 0));
    expect(r.revealedCount).toBe(1);
    expect(r.status).toBe('playing');
  });

  it('踩雷 → 整局結束、記下踩到哪一顆、其餘雷全掀開', () => {
    const b = boardFrom(['*..', '...', '..*']);
    const r = reveal(b, at(b, 0, 0));
    expect(r.status).toBe('lost');
    expect(r.hitIndex).toBe(at(b, 0, 0));
    expect(r.cells[at(b, 2, 2)].state).toBe('revealed');
  });

  it('左鍵點在旗子上沒有作用(XP 行為)', () => {
    const b = boardFrom(['*..', '...', '...']);
    const flagged = cycleMark(b, at(b, 0, 0), false);
    const r = reveal(flagged, at(b, 0, 0));
    expect(r.status).not.toBe('lost');
    expect(r.cells[at(b, 0, 0)].state).toBe('flag');
  });

  it('連鎖展開不會穿過旗子', () => {
    const b = boardFrom(['....', '....', '....', '...*']);
    const flagged = cycleMark(b, at(b, 0, 0), false);
    const r = reveal(flagged, at(b, 3, 0));
    expect(r.cells[at(b, 0, 0)].state).toBe('flag');
  });

  it('局末:開完所有非雷格就贏,剩下的雷自動插旗、剩餘雷數歸零', () => {
    const b = boardFrom(['*...', '....', '....']);
    const r = reveal(b, at(b, 3, 2));
    expect(r.status).toBe('won');
    expect(r.revealedCount).toBe(safeCellCount(b));
    expect(r.cells[at(b, 0, 0)].state).toBe('flag');
    expect(minesLeft(r)).toBe(0);
  });
});

describe('標記', () => {
  it('關閉問號時:空白 ↔ 旗', () => {
    const b = boardFrom(['...', '...', '..*']);
    const a = cycleMark(b, 0, false);
    expect(a.cells[0].state).toBe('flag');
    expect(minesLeft(a)).toBe(0);
    const c = cycleMark(a, 0, false);
    expect(c.cells[0].state).toBe('hidden');
    expect(minesLeft(c)).toBe(1);
  });

  it('開啟問號時:空白 → 旗 → ? → 空白', () => {
    const b = boardFrom(['...', '...', '..*']);
    const a = cycleMark(b, 0, true);
    const c = cycleMark(a, 0, true);
    const d = cycleMark(c, 0, true);
    expect(a.cells[0].state).toBe('flag');
    expect(c.cells[0].state).toBe('question');
    expect(d.cells[0].state).toBe('hidden');
    // 問號不算旗,剩餘雷數要還原
    expect(minesLeft(c)).toBe(1);
  });

  it('剩餘雷數可以變成負數(旗插超過雷數,XP 就是這樣)', () => {
    const b = boardFrom(['...', '...', '..*']);
    let x = b;
    x = cycleMark(x, 0, false);
    x = cycleMark(x, 1, false);
    expect(minesLeft(x)).toBe(-1);
  });

  it('已開的格子不能插旗', () => {
    const b = boardFrom(['*..', '...', '...']);
    const opened = reveal(b, at(b, 1, 0));
    const marked = cycleMark(opened, at(b, 1, 0), false);
    expect(marked.cells[at(b, 1, 0)].state).toBe('revealed');
  });
});

describe('和弦展開(左右鍵同按)', () => {
  it('旗數等於數字 → 展開其餘鄰格', () => {
    const b = boardFrom(['*....', '.....', '.....']);
    let x = reveal(b, at(b, 1, 1)); // 這格是 1
    x = cycleMark(x, at(b, 0, 0), false);
    const before = x.revealedCount;
    x = chord(x, at(b, 1, 1));
    expect(x.revealedCount).toBeGreaterThan(before);
    expect(x.status).not.toBe('lost');
  });

  it('旗數不等於數字 → 什麼都不做', () => {
    const b = boardFrom(['*....', '.....', '.....']);
    const x = reveal(b, at(b, 1, 1));
    const y = chord(x, at(b, 1, 1));
    expect(y.revealedCount).toBe(x.revealedCount);
  });

  it('旗插錯了 → 會炸(這是 chord 的風險,不可以幫玩家擋)', () => {
    const b = boardFrom(['*....', '.....', '.....']);
    let x = reveal(b, at(b, 1, 1));
    x = cycleMark(x, at(b, 2, 0), false); // 插在沒有雷的地方
    x = chord(x, at(b, 1, 1));
    expect(x.status).toBe('lost');
    expect(x.hitIndex).toBe(at(b, 0, 0));
  });

  it('零格與未開的格子上和弦沒有作用', () => {
    const b = boardFrom(['*....', '.....', '.....']);
    const x = reveal(b, at(b, 4, 2));
    expect(chord(x, at(b, 4, 2))).toBe(x);
    expect(chord(x, at(b, 0, 1))).toBe(x);
  });
});

describe('鄰居', () => {
  it('角落三個、邊緣五個、中間八個', () => {
    const b = createBoard({ width: 5, height: 5, mines: 1 });
    expect(neighbors(b, 0).length).toBe(3);
    expect(neighbors(b, 2).length).toBe(5);
    expect(neighbors(b, 12).length).toBe(8);
  });
});
