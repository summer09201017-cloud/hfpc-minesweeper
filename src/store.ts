import { create } from 'zustand';
import {
  type Board,
  type BoardSpec,
  type Difficulty,
  type FirstClickRule,
  PRESETS
} from './game/types';
import {
  chord as chordBoard,
  clampSpec,
  createBoard,
  cycleMark,
  minesLeft,
  reveal as revealBoard
} from './game/board';
import { generateNoGuessAsync, generatePlain } from './game/generator';
import { calc3BV } from './game/metrics';
import { randomSeed } from './game/rng';
import {
  type Challenge,
  DAILY_SPEC,
  challengeFromLocation,
  dailyFirstIndex,
  seedOf,
  submitDaily,
  todayKey
} from './game/daily';
import { type RecordBook, loadRecords, recordKey, submitGame } from './game/records';
import { sfx } from './audio/sfx';

const SETTINGS_KEY = 'ms.settings.v1';

export interface Settings {
  difficulty: Difficulty;
  custom: BoardSpec;
  firstClickRule: FirstClickRule;
  /** 無猜盤面:保證整局不用賭 */
  noGuess: boolean;
  /** XP 的「標記(?)」選項 */
  marks: boolean;
  sound: boolean;
  /** 手機:旗子模式(點一下就是插旗) */
  flagMode: boolean;
  /** 格子邊長 px;0 = 自動依畫面寬度算 */
  cellSize: number;
}

const DEFAULT_SETTINGS: Settings = {
  difficulty: 'beginner',
  custom: { width: 16, height: 16, mines: 40 },
  firstClickRule: 'opening',
  noGuess: true,
  marks: false,
  sound: true,
  flagMode: false,
  cellSize: 0
};

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const o = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...o,
      custom: clampSpec({ ...DEFAULT_SETTINGS.custom, ...(o.custom ?? {}) })
    };
  } catch {
    // localStorage 不可用(Safari 私密模式)或 JSON 壞掉 ⇒ 用預設值,不可以因此開不起來
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        difficulty: s.difficulty,
        custom: s.custom,
        firstClickRule: s.firstClickRule,
        noGuess: s.noGuess,
        marks: s.marks,
        sound: s.sound,
        flagMode: s.flagMode,
        cellSize: s.cellSize
      })
    );
  } catch {
    // 寫不進去不影響遊戲
  }
}

export function specOf(s: Pick<Settings, 'difficulty' | 'custom'>): BoardSpec {
  return s.difficulty === 'custom' ? clampSpec(s.custom) : PRESETS[s.difficulty];
}

export type Face = 'smile' | 'oh' | 'cool' | 'dead';

export interface LastResult {
  won: boolean;
  seconds: number;
  bbbv: number;
  clicks: number;
  efficiency: number;
  noGuess: boolean;
  beatenTime: boolean;
  beatenBps: boolean;
}

export interface GameStore extends Settings {
  board: Board;
  spec: BoardSpec;
  seconds: number;
  startedAt: number | null;
  /** 左鍵次數(含和弦),用來算效率 */
  clicks: number;
  bbbv: number;
  /** 正在生成無猜盤面 */
  generating: boolean;
  /**
   * 這一盤實際上是不是無猜盤。null = 還沒佈雷。
   * ★ 這個旗標就是誠實的來源:預算內生不出無猜盤時它是 false,
   *   畫面必須照它講話,不可以因為「設定開了無猜」就宣稱這盤不用猜。
   */
  noGuessActual: boolean | null;
  /** 按著左鍵時笑臉會變 😮 */
  pressing: boolean;
  challenge: Challenge;
  records: RecordBook;
  lastResult: LastResult | null;

  newGame: () => void;
  openCell: (i: number) => void;
  markCell: (i: number) => void;
  chordCell: (i: number) => void;
  setPressing: (v: boolean) => void;
  tick: () => void;
  setDifficulty: (d: Difficulty) => void;
  setCustom: (spec: BoardSpec) => void;
  patchSettings: (p: Partial<Settings>) => void;
  refreshRecords: () => void;
}

function faceOf(board: Board, pressing: boolean): Face {
  if (board.status === 'won') return 'cool';
  if (board.status === 'lost') return 'dead';
  return pressing ? 'oh' : 'smile';
}

/** 完賽打點(play-stats)。沒有它,牧者/老師只看得到「有人開」、看不到「有人破」。 */
function pingDone(seconds: number): void {
  try {
    const ping = (window as unknown as { psPing?: (k: string, t?: number) => void }).psPing;
    if (!ping) return;
    // Worker 只在 g 以 -done 結尾時收 t,且只收 3~1800 秒
    ping('minesweeper-done', seconds >= 3 && seconds <= 1800 ? seconds : undefined);
  } catch {
    // 統計壞掉絕不可以影響遊戲
  }
}

const initialSettings = loadSettings();
const initialChallenge: Challenge = challengeFromLocation();
const initialSpec =
  initialChallenge.kind === 'free' ? specOf(initialSettings) : DAILY_SPEC;

export const useGame = create<GameStore>((set, get) => ({
  ...initialSettings,
  board: createBoard(initialSpec),
  spec: initialSpec,
  seconds: 0,
  startedAt: null,
  clicks: 0,
  bbbv: 0,
  generating: false,
  noGuessActual: null,
  pressing: false,
  challenge: initialChallenge,
  records: loadRecords(),
  lastResult: null,

  newGame: () => {
    const s = get();
    const spec = s.challenge.kind === 'free' ? specOf(s) : DAILY_SPEC;
    set({
      board: createBoard(spec),
      spec,
      seconds: 0,
      startedAt: null,
      clicks: 0,
      bbbv: 0,
      generating: false,
      noGuessActual: null,
      pressing: false,
      lastResult: null
    });

    // 每日挑戰 / 題號:盤面與開場第一格都由種子決定,全世界同一天拿到同一盤。
    if (s.challenge.kind !== 'free') void get().openCell(dailyFirstIndex(s.challenge.seed, spec));
  },

  openCell: (i: number) => {
    const s = get();
    if (s.generating) return;
    const b = s.board;
    if (b.status === 'won' || b.status === 'lost') return;

    if (!b.placed) {
      void placeThenOpen(i, set, get);
      return;
    }
    applyBoard(revealBoard(b, i), set, get, { countClick: true });
  },

  markCell: (i: number) => {
    const s = get();
    if (s.generating) return;
    const b = s.board;
    if (b.status === 'won' || b.status === 'lost') return;
    if (!b.placed) return; // 還沒佈雷不給插旗:第一下一定要是開格子
    if (s.sound) sfx.flag();
    applyBoard(cycleMark(b, i, s.marks), set, get, { countClick: false });
  },

  chordCell: (i: number) => {
    const s = get();
    if (s.generating) return;
    const b = s.board;
    if (b.status !== 'playing') return;
    applyBoard(chordBoard(b, i), set, get, { countClick: true });
  },

  setPressing: (v: boolean) => set({ pressing: v }),

  tick: () => {
    const s = get();
    if (s.startedAt == null) return;
    if (s.board.status !== 'playing') return;
    const sec = Math.min(999, Math.floor((Date.now() - s.startedAt) / 1000));
    if (sec !== s.seconds) set({ seconds: sec });
  },

  setDifficulty: (d: Difficulty) => {
    const s = get();
    const next = { ...s, difficulty: d };
    saveSettings(next);
    set({ difficulty: d });
    get().newGame();
  },

  setCustom: (spec: BoardSpec) => {
    const s = get();
    const clamped = clampSpec(spec);
    saveSettings({ ...s, custom: clamped, difficulty: 'custom' });
    set({ custom: clamped, difficulty: 'custom' });
    get().newGame();
  },

  patchSettings: (p: Partial<Settings>) => {
    const s = get();
    const next: Settings = {
      difficulty: p.difficulty ?? s.difficulty,
      custom: p.custom ? clampSpec(p.custom) : s.custom,
      firstClickRule: p.firstClickRule ?? s.firstClickRule,
      noGuess: p.noGuess ?? s.noGuess,
      marks: p.marks ?? s.marks,
      sound: p.sound ?? s.sound,
      flagMode: p.flagMode ?? s.flagMode,
      cellSize: p.cellSize ?? s.cellSize
    };
    saveSettings(next);
    set(next);
    // 改到會影響盤面生成的設定 ⇒ 重開一局,免得「設定說無猜、手上這盤不是」
    if (p.noGuess !== undefined || p.firstClickRule !== undefined) get().newGame();
  },

  refreshRecords: () => set({ records: loadRecords() })
}));

type SetFn = (partial: Partial<GameStore>) => void;
type GetFn = () => GameStore;

/** 第一次點擊:這時候才生盤面(首點保護與無猜盤面都靠這個時機)。 */
async function placeThenOpen(i: number, set: SetFn, get: GetFn): Promise<void> {
  const s = get();
  const seed = seedOf(s.challenge) ?? randomSeed();
  set({ generating: true });

  let board: Board;
  let noGuessActual = false;
  if (s.noGuess) {
    const r = await generateNoGuessAsync({
      spec: s.spec,
      firstIndex: i,
      rule: s.firstClickRule,
      seed
    });
    board = r.board;
    noGuessActual = r.noGuess;
  } else {
    board = generatePlain({ spec: s.spec, firstIndex: i, rule: s.firstClickRule, seed });
  }

  set({ generating: false, bbbv: calc3BV(board), noGuessActual });
  applyBoard(revealBoard(board, i), set, get, { countClick: true });
}

/** 套用新盤面 + 處理計時、音效、勝負收尾。所有動作都走這裡,收尾邏輯只有一份。 */
function applyBoard(
  next: Board,
  set: SetFn,
  get: GetFn,
  opts: { countClick: boolean }
): void {
  const s = get();
  if (next === s.board) return;

  const startedAt = s.startedAt ?? Date.now();
  const clicks = s.clicks + (opts.countClick ? 1 : 0);
  set({ board: next, startedAt, clicks });

  if (s.sound && next.status === 'playing' && next.revealedCount > s.board.revealedCount) {
    sfx.open();
  }

  if (next.status === 'won' || next.status === 'lost') {
    finishGame(next, startedAt, clicks, set, get);
  }
}

function finishGame(
  board: Board,
  startedAt: number,
  clicks: number,
  set: SetFn,
  get: GetFn
): void {
  const s = get();
  const seconds = Math.min(999, Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
  const won = board.status === 'won';

  if (s.sound) {
    if (won) sfx.win();
    else sfx.boom();
  }

  const key = recordKey(s.difficulty, s.spec, s.noGuessActual === true);
  const { book, beatenTime, beatenBps } = submitGame({
    key,
    won,
    seconds,
    bbbv: s.bbbv,
    clicks,
    date: todayKey()
  });

  if (s.challenge.kind === 'daily') submitDaily(s.challenge.day, won, seconds);
  if (won) pingDone(seconds);

  set({
    seconds,
    records: book,
    lastResult: {
      won,
      seconds,
      bbbv: s.bbbv,
      clicks,
      efficiency: clicks > 0 ? s.bbbv / clicks : 0,
      noGuess: s.noGuessActual === true,
      beatenTime,
      beatenBps
    }
  });
}

// ───────────────────────────── 給畫面用的小選擇器

export const selectMinesLeft = (s: GameStore): number => minesLeft(s.board);
export const selectFace = (s: GameStore): Face => faceOf(s.board, s.pressing);
