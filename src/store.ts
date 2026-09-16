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
import { type DeathLesson, type Hint, analyzeDeath, nextHint } from './game/coach';
import { sfx } from './audio/sfx';
import { bgm, DEFAULT_TRACK, findTrack } from './audio/bgm';
import { DEFAULT_BACKDROP, DEFAULT_THEME, applyTheme, findBackdrop, findTheme } from './theme';

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
  /** 換皮:視窗面、斜角、標題列、數字八色 */
  theme: string;
  /** 換背景:視窗後面那片桌面(可獨立於主題) */
  backdrop: string;
  /** 背景音樂開關(和音效分開:有人要音效不要音樂) */
  music: boolean;
  musicTrack: string;
}

const DEFAULT_SETTINGS: Settings = {
  difficulty: 'beginner',
  custom: { width: 16, height: 16, mines: 40 },
  firstClickRule: 'opening',
  noGuess: true,
  marks: false,
  sound: true,
  flagMode: false,
  cellSize: 0,
  theme: DEFAULT_THEME,
  backdrop: DEFAULT_BACKDROP,
  // 音樂預設關:別人家的孩子在圖書館/教室打開,不該突然出聲
  music: false,
  musicTrack: DEFAULT_TRACK
};

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const o = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...o,
      custom: clampSpec({ ...DEFAULT_SETTINGS.custom, ...(o.custom ?? {}) }),
      // 舊存檔可能沒有這些鍵,或存了已經被刪掉的主題 id ⇒ 一律過一次「找不到就回預設」
      theme: findTheme(String(o.theme ?? DEFAULT_THEME)).id,
      backdrop: findBackdrop(String(o.backdrop ?? DEFAULT_BACKDROP)).id,
      musicTrack: findTrack(String(o.musicTrack ?? DEFAULT_TRACK)).id
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
        cellSize: s.cellSize,
        theme: s.theme,
        backdrop: s.backdrop,
        music: s.music,
        musicTrack: s.musicTrack
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
  /** 這局有沒有進紀錄(用過提示或悔一步就不進) */
  counted: boolean;
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

  // ── 輔助功能(提示 / 悔一步 / 鍵盤 / 教學)
  /** 鍵盤游標所在格。滑鼠點哪裡它就跟到哪裡,兩種操作方式接得起來 */
  cursor: number;
  /** 目前顯示的提示;做下一個動作就清掉 */
  hint: Hint | null;
  hintsUsed: number;
  /** 悔一步:這局還剩幾次 */
  undosLeft: number;
  /**
   * 這局用過輔助(提示或悔一步)⇒ **不進紀錄**。
   * ★ 不然最佳時間表會被「提示點到通關」灌爆,一般玩法的紀錄永遠破不了
   *   (同一條教訓:無猜盤與一般盤也是分開記的)。
   */
  assisted: boolean;
  /** 這局的成績已經記過帳了(復活後再結束不可以再記一次) */
  resultCounted: boolean;
  /** 踩雷當下的死因分析:推得出來?有別的安全格?還是真的只能猜? */
  deathLesson: DeathLesson | null;
  /** 這局第一次點的那一格 —— 教學回放要從這裡重演 */
  firstIndex: number | null;
  /** 內部:每一步的盤面快照(悔一步用) */
  history: HistoryEntry[];

  requestHint: () => void;
  clearHint: () => void;
  undo: () => void;
  moveCursor: (dx: number, dy: number) => void;
  setCursor: (i: number) => void;
  /** 中途放棄(按新局 / 換難度 / 回大廳):統計要知道,不然分母永遠只算得到玩完的人 */
  abandonGame: () => void;

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

/**
 * 統計打點(play-stats)。四個鍵構成一條漏斗,才回答得了「孩子為什麼放棄」:
 *
 *   minesweeper            開頁(index.html 送)
 *   minesweeper-start      **真的開局**(第一下點下去、盤面生出來)
 *   minesweeper-done       通關(帶秒數)
 *   minesweeper-lost-done  踩雷(帶存活秒數)
 *   minesweeper-quit-done  中途放棄(按新局/換難度/回大廳,帶存活秒數)
 *
 * ⇒ 放棄率 = quit ÷ start;平均存活 = 各自的 t 平均;
 *   而「直接關掉分頁走人」的那群人 = start −(done + lost + quit)的**殘差**。
 *
 * ★ 為什麼關分頁那種不另外送一發:index.html 的 -dwell 就在 pagehide 送,
 *   而**手機鎖屏時常常只送得出佇列裡的第一個 beacon** —— 同一刻連發兩發會被丟掉一發。
 *   與其兩個數字都不可信,不如讓它當殘差算出來。
 * ★ 鍵名尾巴都用 `-done`:Worker 只有在 g 以 `-done` 結尾時才收 t(3~1800 秒)。
 */
function psPing(key: string, seconds?: number): void {
  try {
    const ping = (window as unknown as { psPing?: (k: string, t?: number) => void }).psPing;
    if (!ping) return;
    ping(key, seconds != null && seconds >= 3 && seconds <= 1800 ? seconds : undefined);
  } catch {
    // 統計壞掉絕不可以影響遊戲
  }
}

/** 悔一步:一局三次。夠救幾次手滑,又不會變成「按到通關」。 */
export const UNDO_LIMIT = 3;
/** 快照上限:高級盤一局幾百步,留最近這些就夠悔三次了,不必扛整局的記憶體。 */
const HISTORY_CAP = 40;

interface HistoryEntry {
  board: Board;
  clicks: number;
}

/** 游標開場放在正中間 —— 純鍵盤玩家第一下就有東西可按。 */
function centerOf(spec: BoardSpec): number {
  return Math.floor(spec.height / 2) * spec.width + Math.floor(spec.width / 2);
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
  cursor: centerOf(initialSpec),
  hint: null,
  hintsUsed: 0,
  undosLeft: UNDO_LIMIT,
  assisted: false,
  resultCounted: false,
  deathLesson: null,
  firstIndex: null,
  history: [],

  newGame: () => {
    const s = get();
    // 上一局還在進行中就按新局 = 放棄它,統計要算到(不然分母只剩玩完的人)
    get().abandonGame();
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
      lastResult: null,
      cursor: centerOf(spec),
      hint: null,
      hintsUsed: 0,
      undosLeft: UNDO_LIMIT,
      assisted: false,
      resultCounted: false,
      deathLesson: null,
      firstIndex: null,
      history: []
    });

    // 每日挑戰 / 題號:盤面與開場第一格都由種子決定,全世界同一天拿到同一盤。
    if (s.challenge.kind !== 'free') void get().openCell(dailyFirstIndex(s.challenge.seed, spec));
  },

  openCell: (i: number) => {
    const s = get();
    if (s.generating) return;
    const b = s.board;
    if (b.status === 'won' || b.status === 'lost') return;
    set({ cursor: i, hint: null });

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
    set({ cursor: i, hint: null });
    if (s.sound) sfx.flag();
    applyBoard(cycleMark(b, i, s.marks), set, get, { countClick: false });
  },

  chordCell: (i: number) => {
    const s = get();
    if (s.generating) return;
    const b = s.board;
    if (b.status !== 'playing') return;
    set({ cursor: i, hint: null });
    applyBoard(chordBoard(b, i), set, get, { countClick: true });
  },

  // ── 💡 提示:直接問那支「保證只少推不推錯」的推理引擎
  requestHint: () => {
    const s = get();
    if (s.generating) return;
    const h = nextHint(s.board);
    // 只有真的指出一格才算用掉一次輔助 ——「這步只能猜」是資訊,不是幫忙
    const helped = h.kind === 'safe' || h.kind === 'mine';
    set({
      hint: h,
      hintsUsed: s.hintsUsed + (helped ? 1 : 0),
      assisted: s.assisted || helped,
      ...(h.cells.length > 0 ? { cursor: h.cells[0] } : {})
    });
  },

  clearHint: () => {
    if (get().hint) set({ hint: null });
  },

  // ── ↩ 悔一步:board 是純資料,存快照就好
  undo: () => {
    const s = get();
    if (s.undosLeft <= 0) return;
    const prev = s.history[s.history.length - 1];
    if (!prev) return;
    const wasOver = s.board.status === 'won' || s.board.status === 'lost';
    set({
      board: prev.board,
      clicks: prev.clicks,
      history: s.history.slice(0, -1),
      undosLeft: s.undosLeft - 1,
      // ★ 一旦悔過,這局就不進紀錄了(踩雷那一筆**已經記過帳**,見 finishGame)
      assisted: true,
      hint: null,
      ...(wasOver ? { lastResult: null, deathLesson: null } : {})
    });
    if (s.sound) sfx.flag();
  },

  moveCursor: (dx: number, dy: number) => {
    const s = get();
    const b = s.board;
    const x = Math.min(b.width - 1, Math.max(0, (s.cursor % b.width) + dx));
    const y = Math.min(b.height - 1, Math.max(0, Math.floor(s.cursor / b.width) + dy));
    set({ cursor: y * b.width + x });
  },

  setCursor: (i: number) => set({ cursor: i }),

  abandonGame: () => {
    const s = get();
    if (s.board.status !== 'playing' || s.startedAt == null) return;
    if (s.resultCounted) return;
    psPing('minesweeper-quit-done', Math.round((Date.now() - s.startedAt) / 1000));
    set({ resultCounted: true });
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
      cellSize: p.cellSize ?? s.cellSize,
      theme: p.theme ?? s.theme,
      backdrop: p.backdrop ?? s.backdrop,
      music: p.music ?? s.music,
      musicTrack: p.musicTrack ?? s.musicTrack
    };
    saveSettings(next);
    set(next);

    if (p.theme !== undefined || p.backdrop !== undefined) {
      applyTheme(next.theme, next.backdrop);
    }
    // 音樂:開關或換曲都走同一條路,狀態只有一個來源
    if (p.music !== undefined || p.musicTrack !== undefined) {
      if (next.music) bgm.play(next.musicTrack);
      else bgm.stop();
    }
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

  set({ generating: false, bbbv: calc3BV(board), noGuessActual, firstIndex: i });
  // 「真的開了一局」的打點:開頁的人很多、真的按下去的才是玩家
  psPing('minesweeper-start');
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
  // 悔一步用的快照:存「動作之前」那一份。Board 每次操作都回傳新物件,
  // 所以這裡放的是舊參照,不必深拷貝。
  const history = [...s.history, { board: s.board, clicks: s.clicks }].slice(-HISTORY_CAP);
  set({ board: next, startedAt, clicks, history });

  if (s.sound && next.status === 'playing' && next.revealedCount > s.board.revealedCount) {
    sfx.open();
  }

  if (next.status === 'won' || next.status === 'lost') {
    finishGame(next, startedAt, clicks, set, get, s.board);
  }
}

function finishGame(
  board: Board,
  startedAt: number,
  clicks: number,
  set: SetFn,
  get: GetFn,
  before: Board
): void {
  const s = get();
  const seconds = Math.min(999, Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
  const won = board.status === 'won';

  if (s.sound) {
    if (won) sfx.win();
    else sfx.boom();
  }

  // 💥 死因分析:用**踩下去之前**那一份盤面問推理引擎「這顆當時推得出來嗎」
  const deathLesson =
    !won && board.hitIndex != null ? analyzeDeath(before, board.hitIndex) : null;

  // ★ 記帳與打點只做一次,而且用過輔助就完全不記:
  //   ① assisted(提示/悔一步)⇒ 這局不算成績
  //   ② resultCounted ⇒ 踩雷記過帳之後又悔一步復活,不可以再記第二次
  const countIt = !s.assisted && !s.resultCounted;
  let book = s.records;
  let beatenTime = false;
  let beatenBps = false;

  if (countIt) {
    const key = recordKey(s.difficulty, s.spec, s.noGuessActual === true);
    const r = submitGame({ key, won, seconds, bbbv: s.bbbv, clicks, date: todayKey() });
    book = r.book;
    beatenTime = r.beatenTime;
    beatenBps = r.beatenBps;
    if (s.challenge.kind === 'daily') submitDaily(s.challenge.day, won, seconds);
    psPing(won ? 'minesweeper-done' : 'minesweeper-lost-done', seconds);
  }

  set({
    seconds,
    records: book,
    resultCounted: s.resultCounted || countIt,
    deathLesson,
    hint: null,
    lastResult: {
      won,
      seconds,
      bbbv: s.bbbv,
      clicks,
      efficiency: clicks > 0 ? s.bbbv / clicks : 0,
      noGuess: s.noGuessActual === true,
      beatenTime,
      beatenBps,
      counted: countIt
    }
  });
}

// ───────────────────────────── 給畫面用的小選擇器

export const selectMinesLeft = (s: GameStore): number => minesLeft(s.board);
export const selectFace = (s: GameStore): Face => faceOf(s.board, s.pressing);
