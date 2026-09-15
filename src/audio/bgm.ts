import { getCtx, onUnlock, tone } from './ctx';

/**
 * 程序化背景音樂(skill procedural-bgm 的結構:MELODY + BASS + scheduleLoop + pump)。
 *
 * 零音檔、Web Audio 即時合成、可離線 —— 不塞 MP3、不破壞 PWA、build 不變大。
 *
 * ★ 版權鐵則:三首全部原創。不重現任何商業歌曲的旋律 ——
 *   這是會公開部署、給主日學孩子玩的站,錄音與「曲子本身」都受著作權保護。
 * ★ 音樂走獨立的 musicGain(很小聲),不可以蓋過音效 ——
 *   踩地雷的音效是回饋(開格/插旗/踩雷),蓋掉就等於把手感拿掉了。
 */

export interface Track {
  id: string;
  name: string;
  /** 一拍幾秒(調大 = 更慢更悠閒) */
  beat: number;
  /** [頻率Hz, 拍數];0 = 休止 */
  melody: Array<[number, number]>;
  /** 每 4 拍一個低音根音 */
  bass: number[];
  melodyType: OscillatorType;
}

// 音名對照(只列用得到的)
const C4 = 261.63,
  D4 = 293.66,
  E4 = 329.63,
  F4 = 349.23,
  G4 = 392.0,
  A4 = 440.0,
  B4 = 493.88,
  C5 = 523.25,
  D5 = 587.33;
const C3 = 130.81,
  D3 = 146.83;
const C2 = 65.41,
  D2 = 73.42,
  E2 = 82.41,
  F2 = 87.31,
  G2 = 98.0,
  A2 = 110.0;

export const TRACKS: Track[] = [
  {
    id: 'stroll',
    name: '悠閒散步',
    // C 大調、慢、上行再收束 —— 適合慢慢推理,不催人
    beat: 0.5,
    melodyType: 'triangle',
    melody: [
      [E4, 1],
      [G4, 1],
      [C5, 2],
      [A4, 1],
      [G4, 1],
      [E4, 2],
      [F4, 1],
      [A4, 1],
      [G4, 2],
      [E4, 1],
      [D4, 1],
      [C4, 2]
    ],
    bass: [C2, A2, F2, G2]
  },
  {
    id: 'focus',
    name: '專注',
    // A 小調、音符少、長音多 —— 高級盤想安靜想事情的時候用
    beat: 0.6,
    melodyType: 'sine',
    melody: [
      [A4, 2],
      [C5, 1],
      [B4, 1],
      [A4, 2],
      [E4, 2],
      [F4, 2],
      [E4, 1],
      [D4, 1],
      [E4, 4]
    ],
    bass: [A2, F2, D2, E2]
  },
  {
    id: 'retro',
    name: '復古電玩',
    // G 大調、快、方波 —— 給想要 8-bit 味道的人
    beat: 0.32,
    melodyType: 'square',
    melody: [
      [G4, 1],
      [B4, 1],
      [D5, 1],
      [B4, 1],
      [G4, 1],
      [A4, 1],
      [B4, 2],
      [C5, 1],
      [B4, 1],
      [A4, 1],
      [G4, 1],
      [D4, 2],
      [G4, 2]
    ],
    bass: [G2, E2, C3, D3]
  }
];

export const DEFAULT_TRACK = 'stroll';

export function findTrack(id: string): Track {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

/** 旋律總拍數必須等於 bass.length × 4,否則旋律與和聲會越跑越歪。 */
export function loopBeats(track: Track): number {
  return track.melody.reduce((s, [, b]) => s + b, 0);
}

export function isAligned(track: Track): boolean {
  return loopBeats(track) === track.bass.length * 4;
}

// ───────────────────────────── 播放器

const MUSIC_GAIN = 0.075; // 很小聲:音效才是回饋,音樂只是底
const LOOKAHEAD_SEC = 1.2;

let gainNode: GainNode | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextStart = 0;
let current: Track | null = null;
let wantPlaying = false;
let offUnlock: (() => void) | null = null;

function ensureGain(): GainNode | null {
  const c = getCtx();
  if (!c) return null;
  if (!gainNode) {
    gainNode = c.createGain();
    gainNode.gain.value = MUSIC_GAIN;
    gainNode.connect(c.destination);
  }
  return gainNode;
}

function scheduleLoop(track: Track, start: number, dest: GainNode): void {
  const { beat } = track;
  let t = start;
  for (const [f, b] of track.melody) {
    // 音符之間留一點縫(0.92),不然會糊成一條線
    if (f > 0) tone(f, b * beat * 0.92, t, 0.5, track.melodyType, dest);
    t += b * beat;
  }
  for (let i = 0; i < track.bass.length; i++) {
    tone(track.bass[i], beat * 3.6, start + i * 4 * beat, 0.42, 'sine', dest);
  }
}

/**
 * 提前把下一段排進去,確保無縫循環。
 * ★ 用 setTimeout 輪詢而不是 setInterval:分頁切到背景時瀏覽器會節流,
 *   setInterval 累積的落後會一次爆發、把好幾段音樂同時排進去(聽起來像走音)。
 *   每次重新算「還差多久」就不會有這個問題。
 */
function pump(): void {
  if (!wantPlaying || !current) return;
  const c = getCtx();
  const dest = ensureGain();
  if (!c || !dest || c.state !== 'running') {
    timer = setTimeout(pump, 500);
    return;
  }
  const loopSec = loopBeats(current) * current.beat;
  if (nextStart < c.currentTime + 0.05) nextStart = c.currentTime + 0.1;
  while (nextStart < c.currentTime + LOOKAHEAD_SEC) {
    scheduleLoop(current, nextStart, dest);
    nextStart += loopSec;
  }
  timer = setTimeout(pump, Math.max(200, (LOOKAHEAD_SEC * 1000) / 2));
}

export const bgm = {
  /** 開始播(或換曲)。音訊還沒解鎖時會排隊,等第一個使用者手勢自動開始。 */
  play(trackId: string): void {
    const track = findTrack(trackId);
    const changed = current?.id !== track.id;
    current = track;
    wantPlaying = true;

    const c = getCtx();
    if (changed) nextStart = c ? c.currentTime + 0.1 : 0;

    if (!offUnlock) {
      offUnlock = onUnlock(() => {
        if (wantPlaying) {
          const cc = getCtx();
          nextStart = cc ? cc.currentTime + 0.1 : 0;
          pump();
        }
      });
    }
    if (timer) clearTimeout(timer);
    pump();
  },

  stop(): void {
    wantPlaying = false;
    current = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // 已經排進去的音符停不掉,把音量拉掉最乾淨
    const g = gainNode;
    const c = getCtx();
    if (g && c) {
      try {
        g.gain.cancelScheduledValues(c.currentTime);
        g.gain.setValueAtTime(g.gain.value, c.currentTime);
        g.gain.linearRampToValueAtTime(0, c.currentTime + 0.25);
        setTimeout(() => {
          if (!wantPlaying) g.gain.value = MUSIC_GAIN;
        }, 400);
      } catch {
        // 停不掉也不能炸
      }
    }
  },

  isPlaying(): boolean {
    return wantPlaying;
  },

  currentId(): string | null {
    return current?.id ?? null;
  }
};
