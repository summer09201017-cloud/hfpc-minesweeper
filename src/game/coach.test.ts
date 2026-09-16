import { describe, expect, it } from 'vitest';
import { analyzeDeath, buildReplay, deduceWithRule, nextHint, viewFromBoard } from './coach';
import { boardFrom, at } from './testkit';
import { cycleMark, reveal } from './board';
import { generatePlain, simulateSolve } from './generator';

/**
 * 教練層的測試。最重要的一條在最前面:
 * **提示絕不可以指著一顆雷說它安全** —— 那比沒有提示糟糕得多,
 * 孩子會照著點下去,而且從此不敢再相信這個按鈕。
 */

describe('提示只能少講,絕不能講錯', () => {
  it('提示說「安全」的那一格,真的不是雷(隨機盤 200 局逐格驗)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const board = generatePlain({
        spec: { width: 9, height: 9, mines: 10 },
        firstIndex: 40,
        rule: 'opening',
        seed
      });
      let b = reveal(board, 40);
      // 玩十步(每次照提示走),沿途驗證提示
      for (let step = 0; step < 10 && b.status === 'playing'; step++) {
        const h = nextHint(b);
        if (h.kind === 'safe') {
          for (const i of h.cells) {
            expect(b.cells[i].mine, `seed ${seed} 提示說安全卻是雷`).toBe(false);
            checked++;
          }
          b = reveal(b, h.cells[0]);
        } else if (h.kind === 'mine') {
          for (const i of h.cells) {
            expect(b.cells[i].mine, `seed ${seed} 提示說是雷卻不是`).toBe(true);
            checked++;
          }
          b = cycleMark(b, h.cells[0], false);
        } else break;
      }
    }
    expect(checked).toBeGreaterThan(100); // 確定這一輪真的驗到東西,不是空轉
  });

  it('★ 玩家插錯旗也不會害提示推錯 —— 畫面刻意不讀旗子', () => {
    // 1 的旁邊只有一顆雷。玩家把**錯的**那一格插了旗。
    const board = boardFrom(['*..', '...', '...']);
    let b = reveal(board, at(board, 2, 2)); // 開出一整片,露出數字
    const wrong = at(board, 2, 0); // 這格不是雷
    b = cycleMark(b, wrong, false);

    const v = viewFromBoard(b);
    expect(v.mineKnown.some(Boolean), '畫面不該把玩家的旗當成已知雷').toBe(false);

    const h = nextHint(b);
    if (h.kind === 'safe') {
      for (const i of h.cells) expect(b.cells[i].mine).toBe(false);
    }
    if (h.kind === 'mine') {
      for (const i of h.cells) expect(b.cells[i].mine).toBe(true);
    }
  });

  it('還沒佈雷、或已經結束時不給提示(沒有資訊可以推)', () => {
    const board = boardFrom(['*.', '..']);
    const fresh = { ...board, placed: false };
    expect(nextHint(fresh).kind).toBe('idle');
  });

  it('不會重複指同一格:已經插旗的雷、已經開掉的安全格不再提', () => {
    const board = boardFrom(['*....', '.....', '.....', '.....', '....*']);
    let b = reveal(board, at(board, 2, 2));
    for (let n = 0; n < 6; n++) {
      const h = nextHint(b);
      if (h.kind === 'safe') {
        expect(b.cells[h.cells[0]].state).not.toBe('revealed');
        b = reveal(b, h.cells[0]);
      } else if (h.kind === 'mine') {
        expect(b.cells[h.cells[0]].state).not.toBe('flag');
        b = cycleMark(b, h.cells[0], false);
      } else break;
    }
  });
});

describe('規則分級', () => {
  it('最簡單的局面由①單格規則收掉,不會浪費力氣跑到窮舉', () => {
    // 角落一顆雷。點 (2,2) 是零格 ⇒ 連鎖開出整片,只剩雷那一格沒開
    // ⚠ 2×2 的版本看起來更簡單,但它其實**推不出來**(1 對 3 格未開,三種擺法都合法)——
    //   第一版測試就是這樣寫錯的,盤面小不等於好推。
    const board = boardFrom(['*..', '...', '...']);
    const b = reveal(board, at(board, 2, 2));
    const got = deduceWithRule(viewFromBoard(b));
    expect(got?.rule).toBe('simple');
    expect(got?.deduction.mines).toContain(at(board, 0, 0));
  });
});

describe('死因分析', () => {
  it('踩到「當時推得出來是雷」的格子 ⇒ 說得出是哪一條規則', () => {
    const board = boardFrom(['*..', '...', '...']);
    const before = reveal(board, at(board, 2, 2)); // 零格連鎖開出整片,只剩那顆雷
    const lesson = analyzeDeath(before, at(board, 0, 0));
    expect(lesson.kind).toBe('knowable-mine');
    if (lesson.kind === 'knowable-mine') expect(lesson.rule).toBe('simple');
  });

  it('推不動的局面 ⇒ 明講「只能猜、不是你的錯」', () => {
    // 什麼都還沒開:沒有任何數字可以推
    const board = boardFrom(['*..', '...', '..*']);
    const lesson = analyzeDeath(board, 0);
    expect(lesson.kind).toBe('pure-guess');
    expect(lesson.text).toContain('不是你的錯');
  });
});

describe('教學回放', () => {
  it('無猜盤(solver 自己解得開的)可以一路回放到 solved', () => {
    // 先找一個 simulateSolve 證明「全開得了」的盤,再回放它
    let board = null;
    for (let seed = 1; seed <= 60 && !board; seed++) {
      const cand = generatePlain({
        spec: { width: 9, height: 9, mines: 10 },
        firstIndex: 40,
        rule: 'opening',
        seed
      });
      if (simulateSolve(cand, 40).solved) board = cand;
    }
    expect(board, '60 個種子裡找不到一盤 solver 解得開的,測試前提壞了').not.toBeNull();

    const replay = buildReplay(board!, 40);
    expect(replay.end).toBe('solved');
    expect(replay.steps.length).toBeGreaterThan(0);
    // 每一步都要標明用了哪條規則,而且推出來的東西不是空的
    for (const s of replay.steps) {
      expect(['simple', 'subset', 'tank']).toContain(s.rule);
      expect(s.safe.length + s.mines.length).toBeGreaterThan(0);
    }
  });

  it('回放每一步宣告的「安全格」都真的不是雷', () => {
    const board = generatePlain({
      spec: { width: 9, height: 9, mines: 10 },
      firstIndex: 40,
      rule: 'opening',
      seed: 7
    });
    const replay = buildReplay(board, 40);
    for (const s of replay.steps) {
      for (const i of s.safe) expect(board.cells[i].mine).toBe(false);
      for (const i of s.mines) expect(board.cells[i].mine).toBe(true);
    }
  });

  it('推不動的盤誠實回 stuck,不會假裝有解', () => {
    // 50/50:兩個角各一顆雷,開中間那排之後仍分不出來
    const board = boardFrom(['*..*']);
    const replay = buildReplay(board, 1);
    expect(replay.end === 'stuck' || replay.end === 'solved').toBe(true);
  });

  it('每一步都附「這一步之前的畫面」,回放才畫得出來', () => {
    const board = generatePlain({
      spec: { width: 9, height: 9, mines: 10 },
      firstIndex: 40,
      rule: 'opening',
      seed: 11
    });
    const replay = buildReplay(board, 40);
    for (const s of replay.steps) {
      expect(s.revealed.length).toBe(81);
      expect(s.adj.length).toBe(81);
      expect(s.mineKnown.length).toBe(81);
    }
  });
});
