import { type BoardSpec, type Difficulty, PRESETS } from './types';
import { mulberry32 } from './rng';

/**
 * 每日挑戰 / 題號連結。零後端 —— 日期字串 → FNV-1a → 種子。
 *
 * ★ 踩地雷和俄羅斯方塊不一樣的地方:盤面是「第一次點哪裡」才生出來的,
 *   所以光有種子還不夠 —— 兩個人點不同的格子就會拿到不同的盤。
 *   ⇒ 每日挑戰把**第一格也由種子決定**,開局直接幫你點掉那一格。
 *   這樣全世界同一天拿到的是**同一盤、同一個開場**,比較才有意義。
 * ★ 用本地日期不用 UTC:孩子晚上九點玩,UTC 已經是隔天,會在一天當中換題。
 *   代價是跨時區的人不同題 —— 本專案使用者同一個時區,接受。
 */

export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** FNV-1a 32-bit。純函式、無狀態,同一個字串永遠得到同一個數。 */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function dailySeed(day: string): number {
  return seedFromString(`hfpc-minesweeper:${day}`) & 0x7fffffff;
}

/** 給人念的題號:六位數比十位數的種子好報。 */
export function seedLabel(seed: number): string {
  return String(seed % 1000000).padStart(6, '0');
}

/** 每日挑戰固定用中級盤 —— 初級太短、高級對多數人太長,中級是「一杯茶」的長度。 */
export const DAILY_DIFFICULTY: Difficulty = 'intermediate';
export const DAILY_SPEC: BoardSpec = PRESETS.intermediate;

/**
 * 由種子決定的開場第一格。
 * 刻意避開最外圈:邊角的零格連鎖通常很小,開場一片太小會讓每日挑戰的開頭很難受。
 */
export function dailyFirstIndex(seed: number, spec: BoardSpec = DAILY_SPEC): number {
  const rnd = mulberry32(seed ^ 0x5bf03635);
  const w = spec.width;
  const h = spec.height;
  if (w < 3 || h < 3) return 0;
  const x = 1 + Math.floor(rnd() * (w - 2));
  const y = 1 + Math.floor(rnd() * (h - 2));
  return y * w + x;
}

export type Challenge =
  | { kind: 'free' }
  | { kind: 'daily'; day: string; seed: number }
  | { kind: 'seed'; seed: number };

/**
 * 解析網址:`?daily` = 今天的題,`?seed=123456` = 指定題號(練功房 / 老師報號)。
 * ⚠ 讀不到或格式不對一律退回 free,絕不讓一個壞參數擋住遊戲。
 */
export function challengeFromLocation(search: string = window.location.search): Challenge {
  try {
    const q = new URLSearchParams(search);
    if (q.has('daily')) {
      const day = todayKey();
      return { kind: 'daily', day, seed: dailySeed(day) };
    }
    const raw = q.get('seed');
    if (raw != null && raw.trim() !== '') {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return { kind: 'seed', seed: Math.floor(n) % 0x80000000 };
    }
  } catch {
    // URLSearchParams 在極舊瀏覽器可能不存在
  }
  return { kind: 'free' };
}

export function seedOf(c: Challenge): number | null {
  return c.kind === 'free' ? null : c.seed;
}

export function challengeLabel(c: Challenge): string | null {
  if (c.kind === 'daily') return `📅 今日挑戰 #${seedLabel(c.seed)}`;
  if (c.kind === 'seed') return `🎯 題號 #${seedLabel(c.seed)}`;
  return null;
}

// ───────────────────────────── 每日成績(本機,只留今天那一筆)

const DAILY_KEY = 'ms.daily.v1';

export interface DailyResult {
  day: string;
  /** 今天最快的通關秒數;還沒通關過是 null。 */
  bestSeconds: number | null;
  plays: number;
  wins: number;
}

function emptyDaily(day: string): DailyResult {
  return { day, bestSeconds: null, plays: 0, wins: 0 };
}

/**
 * 刻意不留歷史:留著只會無限長大,而且沒有任何畫面在讀它 ——
 * 那正是「寫了從不讀」的資料,除了佔空間什麼也不做。
 */
export function loadDaily(day: string): DailyResult {
  try {
    const raw = window.localStorage.getItem(DAILY_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<DailyResult>;
      if (o && o.day === day) {
        const best = Number(o.bestSeconds);
        return {
          day,
          bestSeconds: Number.isFinite(best) && best > 0 ? Math.floor(best) : null,
          plays: Number.isFinite(Number(o.plays)) ? Math.max(0, Math.floor(Number(o.plays))) : 0,
          wins: Number.isFinite(Number(o.wins)) ? Math.max(0, Math.floor(Number(o.wins))) : 0
        };
      }
    }
  } catch {
    // 讀不到就當今天還沒玩過
  }
  return emptyDaily(day);
}

export function submitDaily(
  day: string,
  won: boolean,
  seconds: number
): { result: DailyResult; beaten: boolean } {
  const prev = loadDaily(day);
  const beaten = won && (prev.bestSeconds == null || seconds < prev.bestSeconds);
  const result: DailyResult = {
    day,
    bestSeconds: beaten ? seconds : prev.bestSeconds,
    plays: prev.plays + 1,
    wins: prev.wins + (won ? 1 : 0)
  };
  try {
    window.localStorage.setItem(DAILY_KEY, JSON.stringify(result));
  } catch {
    // 寫不進去不影響遊戲
  }
  return { result, beaten };
}
