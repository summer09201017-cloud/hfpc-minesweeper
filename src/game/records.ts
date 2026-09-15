import { type BoardSpec, type Difficulty } from './types';

/**
 * 個人紀錄(本機,零上傳)。
 *
 * ★ 分組鍵含「無猜與否」:無猜盤明顯好過,把兩種混在同一張最佳時間表裡,
 *   一般盤的紀錄會永遠被無猜盤壓著、再也破不了 ⇒ 回訪動機直接歸零。
 *   (這條是從 dragtetris「7/8/12 欄不可混排」學來的同一個教訓。)
 * ★ 自訂盤的鍵含長寬雷數:9×9/10 和 9×9/35 完全是兩回事。
 */

const KEY = 'ms.records.v1';

export interface BestEntry {
  seconds: number;
  /** YYYY-MM-DD */
  date: string;
  bbbv: number;
  /** 3BV ÷ 左鍵次數 */
  efficiency: number;
}

export interface StatEntry {
  games: number;
  wins: number;
  best: BestEntry | null;
  /** 最佳 3BV/秒(速度指標,和最短時間不一定是同一局) */
  bestBps: number;
}

export type RecordBook = Record<string, StatEntry>;

export const EMPTY_STAT: StatEntry = { games: 0, wins: 0, best: null, bestBps: 0 };

export function recordKey(
  difficulty: Difficulty,
  spec: BoardSpec,
  noGuess: boolean
): string {
  const mode = noGuess ? 'ng' : 'plain';
  if (difficulty === 'custom') return `custom:${spec.width}x${spec.height}x${spec.mines}|${mode}`;
  return `${difficulty}|${mode}`;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sanitizeBest(raw: unknown): BestEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<BestEntry>;
  const seconds = num(o.seconds);
  if (seconds <= 0) return null;
  return {
    seconds: Math.floor(seconds),
    date: typeof o.date === 'string' ? o.date : '',
    bbbv: Math.floor(num(o.bbbv)),
    efficiency: num(o.efficiency)
  };
}

function sanitizeStat(raw: unknown): StatEntry {
  const o = (raw ?? {}) as Partial<StatEntry>;
  return {
    games: Math.floor(num(o.games)),
    wins: Math.floor(num(o.wins)),
    best: sanitizeBest(o.best),
    bestBps: num(o.bestBps)
  };
}

export function loadRecords(): RecordBook {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const book: RecordBook = {};
    for (const k of Object.keys(parsed)) book[k] = sanitizeStat(parsed[k]);
    return book;
  } catch {
    // localStorage 可能不可用(Safari 私密模式 / 硬化瀏覽器),或 JSON 壞掉。
    return {};
  }
}

export function getStat(book: RecordBook, key: string): StatEntry {
  return book[key] ?? EMPTY_STAT;
}

function save(book: RecordBook): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    // 寫不進去就算了,不能因此弄壞遊戲。
  }
}

export interface GameOutcome {
  key: string;
  won: boolean;
  seconds: number;
  bbbv: number;
  clicks: number;
  date: string;
}

export interface SubmitResult {
  book: RecordBook;
  /** 破了最佳時間嗎 */
  beatenTime: boolean;
  /** 破了最佳 3BV/秒嗎 */
  beatenBps: boolean;
}

/** 一局結束時提交。讀 → 算 → 寫 → 回傳,呼叫端不必自己再讀一次。 */
export function submitGame(o: GameOutcome): SubmitResult {
  const book = loadRecords();
  const prev = book[o.key] ?? EMPTY_STAT;

  const bps = o.won && o.seconds > 0 ? o.bbbv / o.seconds : 0;
  const beatenTime = o.won && o.seconds > 0 && (prev.best == null || o.seconds < prev.best.seconds);
  const beatenBps = o.won && bps > prev.bestBps;

  book[o.key] = {
    games: prev.games + 1,
    wins: prev.wins + (o.won ? 1 : 0),
    best: beatenTime
      ? {
          seconds: o.seconds,
          date: o.date,
          bbbv: o.bbbv,
          efficiency: o.clicks > 0 ? o.bbbv / o.clicks : 0
        }
      : prev.best,
    bestBps: beatenBps ? bps : prev.bestBps
  };

  save(book);
  return { book: { ...book }, beatenTime, beatenBps };
}

/** 清空紀錄(設定面板的「重設紀錄」)。 */
export function clearRecords(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 無所謂
  }
}
