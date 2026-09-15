import { type Board, neighbors } from './types';

/**
 * 踩地雷推理引擎(無猜盤面的核心)。
 *
 * 輸入:玩家「畫面上看得到的東西」—— 哪些格開了、開出來是幾、哪些格已確定是雷。
 * 輸出:哪些格**必定安全**、哪些格**必定是雷**。
 *
 * 三層推理,由便宜到昂貴,找到就回傳(不必每次都跑到最貴那層):
 *   ① 單格規則   某格數字 3、周圍已知 3 顆雷 ⇒ 其餘鄰格全安全(人腦也會)
 *   ② 子集規則   A=1 管 {a,b},B=2 管 {a,b,c},{a,b}⊂{a,b,c} 且雷數差 1 ⇒ c 必是雷(1-2-1 直覺)
 *   ③ 窮舉 + 全域雷數   把邊界所有合法擺法列出來;某格在每一種擺法裡都一樣 ⇒ 確定
 *
 * ★ 鐵則:這支只能「少推」,絕不能「推錯」。第 ③ 層有節點上限,一旦超限就放棄那個
 *   連通塊 —— 放棄時把它的雷數範圍放寬成 [0, 格數](超集),這樣全域推論仍然成立,
 *   只是會少推出一些東西。寧可生不出無猜盤,也不可以生出「宣稱無猜、其實要賭」的盤。
 */

export interface SolveView {
  width: number;
  height: number;
  mines: number;
  /** 玩家已經開啟的格子 */
  revealed: boolean[];
  /** 開出來的數字(只有 revealed 為真時有意義) */
  adj: number[];
  /** 推理已確定是雷的格子(等同插旗) */
  mineKnown: boolean[];
}

export interface Deduction {
  safe: number[];
  mines: number[];
}

const EMPTY: Deduction = { safe: [], mines: [] };

function isEmpty(d: Deduction): boolean {
  return d.safe.length === 0 && d.mines.length === 0;
}

export function createView(b: Pick<Board, 'width' | 'height' | 'mines'>): SolveView {
  const total = b.width * b.height;
  return {
    width: b.width,
    height: b.height,
    mines: b.mines,
    revealed: new Array<boolean>(total).fill(false),
    adj: new Array<number>(total).fill(0),
    mineKnown: new Array<boolean>(total).fill(false)
  };
}

interface Constraint {
  vars: number[];
  need: number;
}

interface Built {
  list: Constraint[];
  /** 所有還沒開、也還沒確定是雷的格子 */
  hidden: number[];
  /** 還沒被確定的雷數 */
  remaining: number;
}

function build(v: SolveView): Built {
  const total = v.width * v.height;
  const hidden: number[] = [];
  let knownMines = 0;
  for (let i = 0; i < total; i++) {
    if (v.mineKnown[i]) knownMines++;
    else if (!v.revealed[i]) hidden.push(i);
  }

  const list: Constraint[] = [];
  for (let i = 0; i < total; i++) {
    if (!v.revealed[i]) continue;
    if (v.adj[i] === 0) continue;
    const vars: number[] = [];
    let known = 0;
    for (const n of neighbors(v, i)) {
      if (v.mineKnown[n]) known++;
      else if (!v.revealed[n]) vars.push(n);
    }
    if (vars.length === 0) continue;
    list.push({ vars, need: v.adj[i] - known });
  }

  return { list, hidden, remaining: v.mines - knownMines };
}

// ───────────────────────────── ① 單格規則

function simpleRules(built: Built): Deduction {
  const safe = new Set<number>();
  const mines = new Set<number>();
  for (const c of built.list) {
    if (c.need === 0) for (const x of c.vars) safe.add(x);
    else if (c.need === c.vars.length) for (const x of c.vars) mines.add(x);
  }
  // 全域:剩餘雷數為 0 / 剛好等於剩餘格數
  if (built.remaining === 0) for (const x of built.hidden) safe.add(x);
  else if (built.remaining === built.hidden.length) for (const x of built.hidden) mines.add(x);

  return { safe: [...safe], mines: [...mines] };
}

// ───────────────────────────── ② 子集規則

function subsetRules(built: Built): Deduction {
  const safe = new Set<number>();
  const mines = new Set<number>();

  // 全域約束也放進來比 —— 它是所有約束的超集,能推出「剩下的雷全在這一區」這類殘局結論
  const all: Constraint[] = built.list.concat([{ vars: built.hidden, need: built.remaining }]);

  // 只比「有共用格子」的約束對,否則 O(n²) 會白跑很多
  const byVar = new Map<number, number[]>();
  all.forEach((c, ci) => {
    for (const x of c.vars) {
      const arr = byVar.get(x);
      if (arr) arr.push(ci);
      else byVar.set(x, [ci]);
    }
  });

  const sets = all.map((c) => new Set(c.vars));

  for (let ai = 0; ai < all.length; ai++) {
    const a = all[ai];
    const partners = new Set<number>();
    for (const x of a.vars) for (const ci of byVar.get(x) ?? []) if (ci !== ai) partners.add(ci);

    for (const bi of partners) {
      const b = all[bi];
      if (b.vars.length <= a.vars.length) continue;
      const bs = sets[bi];
      let subset = true;
      for (const x of a.vars) {
        if (!bs.has(x)) {
          subset = false;
          break;
        }
      }
      if (!subset) continue;

      const as = sets[ai];
      const diff = b.vars.filter((x) => !as.has(x));
      const dneed = b.need - a.need;
      if (dneed === 0) for (const x of diff) safe.add(x);
      else if (dneed === diff.length) for (const x of diff) mines.add(x);
    }
  }

  return { safe: [...safe], mines: [...mines] };
}

// ───────────────────────────── ③ 窮舉 + 全域雷數

interface CountStat {
  /** 這個雷數之下,第 j 個變數「是雷」的解存在嗎 */
  mine: Uint8Array;
  /** 這個雷數之下,第 j 個變數「是空的」的解存在嗎 */
  safe: Uint8Array;
}

interface Component {
  vars: number[];
  /** 可能的雷數 → 每個變數在該雷數下的可能性 */
  byCount: Map<number, CountStat>;
  /** 有沒有跑完(超過節點上限就是 false,這時不可以用它推任何東西) */
  resolved: boolean;
  /** 給全域 DP 用的雷數集合;未跑完時放寬成 0..vars.length(超集,保證推論仍然成立) */
  counts: number[];
}

/** 節點上限:超過就放棄這個連通塊。30×16 高級盤的邊界連通塊極少超過這個量。 */
const NODE_CAP = 400000;

function enumerateComponent(vars: number[], cons: Constraint[]): Component {
  const n = vars.length;
  const pos = new Map<number, number>();
  vars.forEach((v, i) => pos.set(v, i));

  // 每個約束改用「區域索引」表示,並記下每個變數影響到哪些約束
  const cVars = cons.map((c) => c.vars.map((v) => pos.get(v) as number));
  const cNeed = cons.map((c) => c.need);
  const affects: number[][] = Array.from({ length: n }, () => []);
  cVars.forEach((vs, ci) => {
    for (const j of vs) affects[j].push(ci);
  });

  const sum = new Int32Array(cons.length); // 已指派的雷數
  const left = new Int32Array(cons.length); // 還沒指派的變數數
  cVars.forEach((vs, ci) => {
    left[ci] = vs.length;
  });

  const byCount = new Map<number, CountStat>();
  const assign = new Uint8Array(n);
  let nodes = 0;
  let overflow = false;

  function record(total: number): void {
    let st = byCount.get(total);
    if (!st) {
      st = { mine: new Uint8Array(n), safe: new Uint8Array(n) };
      byCount.set(total, st);
    }
    for (let j = 0; j < n; j++) {
      if (assign[j]) st.mine[j] = 1;
      else st.safe[j] = 1;
    }
  }

  function dfs(j: number, total: number): void {
    if (overflow) return;
    if (++nodes > NODE_CAP) {
      overflow = true;
      return;
    }
    if (j === n) {
      record(total);
      return;
    }
    for (let val = 0; val <= 1; val++) {
      assign[j] = val as 0 | 1;
      const touched = affects[j];
      for (const ci of touched) {
        sum[ci] += val;
        left[ci]--;
      }
      let ok = true;
      for (const ci of touched) {
        // 已經超過需求,或就算剩下全是雷也湊不滿 ⇒ 這條路死了
        if (sum[ci] > cNeed[ci] || sum[ci] + left[ci] < cNeed[ci]) {
          ok = false;
          break;
        }
      }
      if (ok) dfs(j + 1, total + val);
      for (const ci of touched) {
        sum[ci] -= val;
        left[ci]++;
      }
      if (overflow) return;
    }
    assign[j] = 0;
  }

  dfs(0, 0);

  if (overflow || byCount.size === 0) {
    const counts: number[] = [];
    for (let k = 0; k <= n; k++) counts.push(k);
    return { vars, byCount: new Map(), resolved: false, counts };
  }
  return { vars, byCount, resolved: true, counts: [...byCount.keys()].sort((a, b) => a - b) };
}

/** 把一組雷數集合疊加成「可能的總和」布林表。 */
function convolve(base: Uint8Array, counts: number[], cap: number): Uint8Array {
  const out = new Uint8Array(cap + 1);
  for (let s = 0; s <= cap; s++) {
    if (!base[s]) continue;
    for (const k of counts) {
      const t = s + k;
      if (t <= cap) out[t] = 1;
    }
  }
  return out;
}

function tankRules(built: Built): Deduction {
  if (built.list.length === 0 && built.hidden.length === 0) return EMPTY;

  // 邊界變數 = 出現在任何一條(非全域)約束裡的格子
  const frontier: number[] = [];
  const seen = new Set<number>();
  for (const c of built.list) {
    for (const x of c.vars) {
      if (!seen.has(x)) {
        seen.add(x);
        frontier.push(x);
      }
    }
  }
  const outside = built.hidden.filter((x) => !seen.has(x));

  // 用 union-find 把「共用格子的約束」串成連通塊
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r) as number;
    let c = a;
    while (parent.get(c) !== c) {
      const next = parent.get(c) as number;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const x of frontier) parent.set(x, x);
  for (const c of built.list) {
    for (let i = 1; i < c.vars.length; i++) {
      const a = find(c.vars[0]);
      const b = find(c.vars[i]);
      if (a !== b) parent.set(b, a);
    }
  }

  const groups = new Map<number, number[]>();
  for (const x of frontier) {
    const r = find(x);
    const g = groups.get(r);
    if (g) g.push(x);
    else groups.set(r, [x]);
  }

  const comps: Component[] = [];
  for (const [root, vars] of groups) {
    const cons = built.list.filter((c) => find(c.vars[0]) === root);
    comps.push(enumerateComponent(vars, cons));
  }

  const cap = Math.max(0, built.remaining);
  // prefix[j] = 用 comps[0..j-1] 能湊出的雷數;suffix[j] = comps[j+1..] 能湊出的
  const prefix: Uint8Array[] = [];
  let acc: ReturnType<typeof convolve> = new Uint8Array(cap + 1);
  acc[0] = 1;
  prefix.push(acc);
  for (let j = 0; j < comps.length; j++) {
    acc = convolve(acc, comps[j].counts, cap);
    prefix.push(acc);
  }
  const suffix: Uint8Array[] = new Array(comps.length + 1);
  let sacc: ReturnType<typeof convolve> = new Uint8Array(cap + 1);
  sacc[0] = 1;
  suffix[comps.length] = sacc;
  for (let j = comps.length - 1; j >= 0; j--) {
    sacc = convolve(sacc, comps[j].counts, cap);
    suffix[j] = sacc;
  }

  const safe = new Set<number>();
  const mines = new Set<number>();
  const outsideCount = outside.length;

  /** 扣掉第 j 塊之後,其餘各塊能湊出的雷數 */
  function sumsWithout(j: number): Uint8Array {
    const out = new Uint8Array(cap + 1);
    const a = prefix[j];
    const b = suffix[j + 1];
    for (let s = 0; s <= cap; s++) {
      if (!a[s]) continue;
      for (let t = 0; s + t <= cap; t++) if (b[t]) out[s + t] = 1;
    }
    return out;
  }

  for (let j = 0; j < comps.length; j++) {
    const comp = comps[j];
    if (!comp.resolved) continue; // 沒跑完 ⇒ 這塊不推任何東西
    const others = sumsWithout(j);

    // 這一塊哪些雷數在全域上真的擺得出來
    const feasible = comp.counts.filter((k) => {
      for (let s = 0; s <= cap; s++) {
        if (!others[s]) continue;
        const o = built.remaining - k - s;
        if (o >= 0 && o <= outsideCount) return true;
      }
      return false;
    });
    if (feasible.length === 0) continue;

    for (let vi = 0; vi < comp.vars.length; vi++) {
      let canBeMine = false;
      let canBeSafe = false;
      for (const k of feasible) {
        const st = comp.byCount.get(k);
        if (!st) continue;
        if (st.mine[vi]) canBeMine = true;
        if (st.safe[vi]) canBeSafe = true;
      }
      if (canBeMine && !canBeSafe) mines.add(comp.vars[vi]);
      else if (canBeSafe && !canBeMine) safe.add(comp.vars[vi]);
    }
  }

  // 邊界以外的格子:看全域雷數逼不逼得出「外面一顆都沒有」或「外面全是雷」
  if (outsideCount > 0) {
    const allSums = prefix[comps.length];
    let minO = Infinity;
    let maxO = -Infinity;
    for (let s = 0; s <= cap; s++) {
      if (!allSums[s]) continue;
      const o = built.remaining - s;
      if (o < 0 || o > outsideCount) continue;
      if (o < minO) minO = o;
      if (o > maxO) maxO = o;
    }
    if (minO === 0 && maxO === 0) for (const x of outside) safe.add(x);
    else if (minO === outsideCount && maxO === outsideCount) for (const x of outside) mines.add(x);
  }

  return { safe: [...safe], mines: [...mines] };
}

// ───────────────────────────── 對外入口

/** 依「畫面上看得到的東西」推出必定安全 / 必定是雷的格子。找到就回傳,不會多跑昂貴的那層。 */
export function deduce(v: SolveView): Deduction {
  const built = build(v);

  const a = simpleRules(built);
  if (!isEmpty(a)) return a;

  const b = subsetRules(built);
  if (!isEmpty(b)) return b;

  return tankRules(built);
}

/** 只想知道「這一步用不用猜」時的便利函式。 */
export function hasDeduction(v: SolveView): boolean {
  return !isEmpty(deduce(v));
}

/**
 * 三層各自的入口 —— 只給測試用。
 *
 * ★ 為什麼要露出來:不然沒辦法證明「第 ③ 層真的有在做事」。
 *   只測 deduce() 的話,窮舉層整個壞掉、退化成永遠回空,測試依然全綠
 *   (因為前兩層還在工作,大部分盤面照樣解得開)—— 那種綠燈是假的。
 */
export function deduceSimple(v: SolveView): Deduction {
  return simpleRules(build(v));
}

export function deduceSubset(v: SolveView): Deduction {
  return subsetRules(build(v));
}

export function deduceTank(v: SolveView): Deduction {
  return tankRules(build(v));
}
