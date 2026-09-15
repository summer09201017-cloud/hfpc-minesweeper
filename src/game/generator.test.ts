import { describe, it, expect } from 'vitest';
import { generateNoGuess, generatePlain, simulateSolve } from './generator';
import { PRESETS, type BoardSpec } from './types';
import { safeCellCount } from './board';

function firstIndexCenter(spec: BoardSpec): number {
  return Math.floor(spec.height / 2) * spec.width + Math.floor(spec.width / 2);
}

describe('無猜盤面生成', () => {
  it('初級:生得出真正的無猜盤,且再驗一次確實全程可推', () => {
    const spec = PRESETS.beginner;
    const first = firstIndexCenter(spec);
    const r = generateNoGuess({ spec, firstIndex: first, rule: 'opening', seed: 12345 });

    expect(r.noGuess).toBe(true);
    // 生成器說「不用猜」,就要禁得起獨立重驗
    const check = simulateSolve(r.board, first);
    expect(check.solved).toBe(true);
    expect(check.unsound).toBe(false);
    expect(r.board.cells.filter((c) => c.mine).length).toBe(spec.mines);
    expect(r.board.cells[first].mine).toBe(false);
  });

  it('中級:生得出無猜盤', () => {
    const spec = PRESETS.intermediate;
    const first = firstIndexCenter(spec);
    const r = generateNoGuess({ spec, firstIndex: first, rule: 'opening', seed: 777 });
    expect(r.noGuess).toBe(true);
    expect(simulateSolve(r.board, first).solved).toBe(true);
  });

  it('高級 30×16/99:生得出無猜盤(這是最吃力的一檔)', () => {
    const spec = PRESETS.expert;
    const first = firstIndexCenter(spec);
    const r = generateNoGuess({
      spec,
      firstIndex: first,
      rule: 'opening',
      seed: 2026,
      budgetMs: 20000,
      maxAttempts: 20000
    });
    expect(r.noGuess).toBe(true);
    expect(simulateSolve(r.board, first).solved).toBe(true);
  });

  it('同一個種子 + 同一個首點 ⇒ 同一盤(每日挑戰與題號連結靠這個)', () => {
    const spec = PRESETS.beginner;
    const first = 40;
    const a = generateNoGuess({ spec, firstIndex: first, rule: 'opening', seed: 99 });
    const b = generateNoGuess({ spec, firstIndex: first, rule: 'opening', seed: 99 });
    const minesA = a.board.cells.map((c) => (c.mine ? 1 : 0)).join('');
    const minesB = b.board.cells.map((c) => (c.mine ? 1 : 0)).join('');
    expect(minesA).toBe(minesB);
  });

  it('不同種子會給不同盤(不然每一局都一樣)', () => {
    const spec = PRESETS.beginner;
    const a = generateNoGuess({ spec, firstIndex: 40, rule: 'opening', seed: 1 });
    const b = generateNoGuess({ spec, firstIndex: 40, rule: 'opening', seed: 2 });
    const minesA = a.board.cells.map((c) => (c.mine ? 1 : 0)).join('');
    const minesB = b.board.cells.map((c) => (c.mine ? 1 : 0)).join('');
    expect(minesA).not.toBe(minesB);
  });
});

describe('預算用完時要誠實', () => {
  it('預算 0 ⇒ noGuess 回報 false,但仍然給得出一盤合法、首點安全的盤面', () => {
    const spec = PRESETS.expert;
    const first = firstIndexCenter(spec);
    let t = 0;
    const r = generateNoGuess({
      spec,
      firstIndex: first,
      rule: 'opening',
      seed: 5,
      budgetMs: 0,
      now: () => (t += 10)
    });

    expect(r.noGuess).toBe(false);
    expect(r.board.cells.filter((c) => c.mine).length).toBe(spec.mines);
    expect(r.board.cells[first].mine).toBe(false);
    expect(r.board.cells.length).toBe(spec.width * spec.height);
  });

  it('嘗試次數上限也會讓它收手,不會無窮跑下去', () => {
    const spec = PRESETS.expert;
    const r = generateNoGuess({
      spec,
      firstIndex: firstIndexCenter(spec),
      rule: 'opening',
      seed: 5,
      maxAttempts: 1,
      budgetMs: 60000
    });
    expect(r.attempts).toBe(1);
  });
});

describe('一般盤面(XP 原版)', () => {
  it('只做首點保護,可能需要猜 —— 這正是經典的樣子', () => {
    const spec = PRESETS.beginner;
    const first = 40;
    const b = generatePlain({ spec, firstIndex: first, rule: 'safe', seed: 3 });
    expect(b.cells[first].mine).toBe(false);
    expect(b.cells.filter((c) => c.mine).length).toBe(spec.mines);
  });

  it('safe 規則下首點可能不是零格(XP 原味,不保證開一片)', () => {
    const spec = PRESETS.beginner;
    let sawNonZero = false;
    for (let seed = 1; seed <= 60; seed++) {
      const b = generatePlain({ spec, firstIndex: 40, rule: 'safe', seed });
      if (b.cells[40].adj > 0) sawNonZero = true;
    }
    expect(sawNonZero).toBe(true);
  });
});

describe('模擬求解', () => {
  it('解開的盤面,開出來的格數等於非雷格總數', () => {
    const spec = PRESETS.beginner;
    const first = 40;
    const r = generateNoGuess({ spec, firstIndex: first, rule: 'opening', seed: 31 });
    const sim = simulateSolve(r.board, first);
    expect(sim.revealed).toBe(safeCellCount(r.board));
  });
});
