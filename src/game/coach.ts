import { type Board, type Cell } from './types';
import {
  type Deduction,
  type SolveView,
  createView,
  deduceSimple,
  deduceSubset,
  deduceTank
} from './solver';
import { revealInView } from './generator';

/**
 * 教練層 —— 把既有的推理引擎(solver.ts)轉成「給人看的東西」。
 *
 * 同一顆腦供三個功能用,不另外寫第二套規則:
 *   ① 💡 提示鈕     這一步有沒有推得出來的格子
 *   ② 💥 死因分析   剛剛踩的那一顆,當時推得出來嗎?還是真的只能猜?
 *   ③ 🤖 教學回放   這盤從頭到尾「本來可以怎麼推」,一步一步演給你看
 *
 * ★★ 鐵則沿用 solver 的:**只能少推,絕不能推錯**。
 *   所以這裡建畫面時**刻意不讀玩家插的旗** —— 旗子可能插錯,把錯的「已知雷」餵進去,
 *   推出來的「一定安全」就會是假的,而玩家會照著點下去然後炸掉。
 *   寧可少推一點,也不可以讓提示害人踩雷。
 */

export type RuleId = 'simple' | 'subset' | 'tank';

export const RULE_LABEL: Record<RuleId, string> = {
  simple: '① 單格規則',
  subset: '② 子集規則',
  tank: '③ 窮舉 + 全域雷數'
};

export const RULE_HOW: Record<RuleId, string> = {
  simple: '看一個數字就夠:周圍的雷已經找齊了,其餘鄰格一定安全;反過來,數字剛好等於還沒開的格數,那幾格就全是雷。',
  subset: '兩個數字比一比:一個 1 管的格子全被一個 2 包住,多出來的那一格就一定是雷 —— 老玩家的 1-2-1 直覺就是這條。',
  tank: '把邊界所有合法的擺法都列出來,再用剩下的雷數去篩:某一格在每一種可能裡都一樣,那就確定了。人腦能做,只是慢。'
};

/** 由盤面產生「玩家畫面上看得到的東西」。★ 不讀旗子(見檔頭鐵則)。 */
export function viewFromBoard(b: Board): SolveView {
  const v = createView(b);
  for (let i = 0; i < b.cells.length; i++) {
    const c: Cell = b.cells[i];
    if (c.state === 'revealed' && !c.mine) {
      v.revealed[i] = true;
      v.adj[i] = c.adj;
    }
  }
  return v;
}

function isEmpty(d: Deduction): boolean {
  return d.safe.length === 0 && d.mines.length === 0;
}

/**
 * 推一步,並回報「是靠哪一條規則推出來的」。
 * 由便宜到昂貴依序試,第一個推得動的就回傳 —— 順便得到「這一步有多難」的分級,
 * 正好是教學回放要講的話。
 */
export function deduceWithRule(v: SolveView): { rule: RuleId; deduction: Deduction } | null {
  const simple = deduceSimple(v);
  if (!isEmpty(simple)) return { rule: 'simple', deduction: simple };
  const subset = deduceSubset(v);
  if (!isEmpty(subset)) return { rule: 'subset', deduction: subset };
  const tank = deduceTank(v);
  if (!isEmpty(tank)) return { rule: 'tank', deduction: tank };
  return null;
}

// ───────────────────────────── ① 提示

export type Hint =
  | { kind: 'safe'; cells: number[]; rule: RuleId; text: string }
  | { kind: 'mine'; cells: number[]; rule: RuleId; text: string }
  | { kind: 'guess'; cells: []; rule: null; text: string }
  | { kind: 'idle'; cells: []; rule: null; text: string };

/**
 * 給一格提示。
 *
 * ★ 優先給「一定安全」而不是「一定是雷」:孩子卡住的時候要的是**下一步能動**,
 *   給他一顆雷他還是不知道要點哪裡。
 * ★ 只指一格,不把整排答案攤開 —— 提示是推一把,不是代打。
 */
export function nextHint(board: Board): Hint {
  if (!board.placed) {
    return { kind: 'idle', cells: [], rule: null, text: '先點第一下,盤面才會生出來。' };
  }
  if (board.status !== 'playing') {
    return { kind: 'idle', cells: [], rule: null, text: '這局已經結束了。' };
  }

  const v = viewFromBoard(board);
  const got = deduceWithRule(v);
  if (!got) {
    return {
      kind: 'guess',
      cells: [],
      rule: null,
      text: '這一步真的推不出來 —— 只能猜。(不是你的錯;開「無猜盤面」就不會遇到)'
    };
  }

  // 只挑還沒被玩家處理過的格子:已經插旗的雷、已經開掉的安全格,提了等於沒提
  const freshSafe = got.deduction.safe.filter((i) => board.cells[i].state !== 'revealed');
  const freshMine = got.deduction.mines.filter((i) => board.cells[i].state !== 'flag');

  if (freshSafe.length > 0) {
    return {
      kind: 'safe',
      cells: [freshSafe[0]],
      rule: got.rule,
      text: `這一格一定安全,放心點下去。(${RULE_LABEL[got.rule]})`
    };
  }
  if (freshMine.length > 0) {
    return {
      kind: 'mine',
      cells: [freshMine[0]],
      rule: got.rule,
      text: `這一格一定是雷,插旗吧。(${RULE_LABEL[got.rule]})`
    };
  }
  return {
    kind: 'idle',
    cells: [],
    rule: null,
    text: '推得出來的都已經處理掉了 —— 換個角落看看。'
  };
}

// ───────────────────────────── ② 死因分析

export type DeathLesson =
  /** 那一格當時就推得出來是雷 */
  | { kind: 'knowable-mine'; rule: RuleId; text: string }
  /** 那一格推不出來,但當時還有別的格子是「一定安全」的 ⇒ 不必冒險 */
  | { kind: 'had-safe'; rule: RuleId; cells: number[]; text: string }
  /** 當時整個盤面都推不動 ⇒ 真的只能猜 */
  | { kind: 'pure-guess'; text: string };

/**
 * 分析「剛剛那一下」。
 *
 * @param before 踩下去**之前**的盤面(store 在套用新盤面前留了一份)
 * @param hit    踩到的那一格
 *
 * ★ 語氣刻意分三種,因為三種情況要講的話完全不同:
 *   推得出來 → 告訴他用哪條規則看得出來(可以學)
 *   有別的安全格 → 告訴他「不必賭」(習慣問題)
 *   真的只能猜 → **明講不是他的錯**。把運氣講成技術問題,孩子只會覺得自己笨。
 */
export function analyzeDeath(before: Board, hit: number): DeathLesson {
  const v = viewFromBoard(before);
  const got = deduceWithRule(v);
  if (!got) {
    return {
      kind: 'pure-guess',
      text: '當時整個盤面都推不動,這一步只能猜 —— 不是你的錯。(想完全避開的話,把「無猜盤面」打開)'
    };
  }
  if (got.deduction.mines.includes(hit)) {
    return {
      kind: 'knowable-mine',
      rule: got.rule,
      text: `這一顆當時就推得出來是雷 —— 用${RULE_LABEL[got.rule]}看得出來。下次先找這種確定的。`
    };
  }
  const safe = got.deduction.safe.filter((i) => before.cells[i].state !== 'revealed');
  if (safe.length > 0) {
    return {
      kind: 'had-safe',
      rule: got.rule,
      cells: safe,
      text: `這一格推不出來,但當時還有 ${safe.length} 格是**一定安全**的(${RULE_LABEL[got.rule]})—— 先點那些就不用賭。`
    };
  }
  return {
    kind: 'pure-guess',
    text: '當時推得出來的都已經處理完了,剩下的只能猜 —— 不是你的錯。'
  };
}

// ───────────────────────────── ③ 教學回放

export interface ReplayStep {
  rule: RuleId;
  safe: number[];
  mines: number[];
  /** 這一步**之前**的畫面,直接拿來畫 */
  revealed: boolean[];
  adj: number[];
  mineKnown: boolean[];
}

export interface Replay {
  steps: ReplayStep[];
  /** solved = 全部推完;stuck = 推不下去(這盤真的要猜);capped = 步數上限,不代表推不動 */
  end: 'solved' | 'stuck' | 'capped';
  width: number;
  height: number;
}

/**
 * 從第一格開始,把「這盤本來可以怎麼推」整個走一遍。
 *
 * ★ 用的是**同一支** solver:所以回放演出來的每一步,都是遊戲當初拿來保證
 *   「這盤不用猜」的那套推理 —— 不是另外寫一套漂亮的示範。
 * ★ maxSteps 是保險絲:高級盤最多幾百步,爆掉就回 'capped' 誠實說「沒演完」,
 *   不可以無上限迴圈把使用者的分頁凍住。
 */
export function buildReplay(board: Board, firstIndex: number, maxSteps = 400): Replay {
  const v = createView(board);
  revealInView(v, board, firstIndex);

  const steps: ReplayStep[] = [];
  const total = board.width * board.height;
  let end: Replay['end'] = 'stuck';

  for (let n = 0; n < maxSteps; n++) {
    let done = 0;
    for (let i = 0; i < total; i++) if (v.revealed[i] || v.mineKnown[i]) done++;
    if (done >= total) {
      end = 'solved';
      break;
    }

    const got = deduceWithRule(v);
    if (!got) {
      end = 'stuck';
      break;
    }

    steps.push({
      rule: got.rule,
      safe: got.deduction.safe.filter((i) => !v.revealed[i]),
      mines: got.deduction.mines.filter((i) => !v.mineKnown[i]),
      revealed: v.revealed.slice(),
      adj: v.adj.slice(),
      mineKnown: v.mineKnown.slice()
    });

    for (const i of got.deduction.mines) v.mineKnown[i] = true;
    for (const i of got.deduction.safe) if (!v.revealed[i]) revealInView(v, board, i);

    if (n === maxSteps - 1) end = 'capped';
  }

  return { steps, end, width: board.width, height: board.height };
}
