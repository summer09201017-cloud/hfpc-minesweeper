/**
 * 零音檔音效(Web Audio 即時合成)。
 *
 * 守本系列慣例:
 *  - 沒有 Web Audio、或被瀏覽器擋住 ⇒ **靜默 fallback**,不報錯、不卡關
 *  - 自動播放政策:第一個使用者手勢才 resume(unlock)
 *  - 可以被設定關掉(呼叫端自己判斷 settings.sound)
 *
 * XP 原版其實有 tick / win / lose 三種音,這裡照那個精神做,不加背景音樂。
 */

type Ctx = AudioContext | null;

let ctx: Ctx = null;
let unlocked = false;

function getCtx(): Ctx {
  if (ctx) return ctx;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

/** 接在第一個使用者手勢上。重複呼叫沒有副作用。 */
export function unlockAudio(): void {
  if (unlocked) return;
  const c = getCtx();
  if (!c) return;
  unlocked = true;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
}

function tone(
  freq: number,
  durationMs: number,
  type: OscillatorType = 'square',
  gain = 0.05,
  delayMs = 0
): void {
  const c = getCtx();
  if (!c || c.state === 'suspended') return;
  try {
    const t0 = c.currentTime + delayMs / 1000;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.02);
  } catch {
    // 音效失敗絕不可以影響遊戲
  }
}

function noise(durationMs: number, gain = 0.12): void {
  const c = getCtx();
  if (!c || c.state === 'suspended') return;
  try {
    const frames = Math.floor((c.sampleRate * durationMs) / 1000);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // 尾巴衰減,不然像白噪音而不像爆炸
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
    }
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(g).connect(c.destination);
    src.start();
  } catch {
    // 同上
  }
}

export const sfx = {
  /** 開格子:短促的 tick */
  open(): void {
    tone(880, 35, 'square', 0.025);
  },
  /** 插旗 / 拔旗 */
  flag(): void {
    tone(1320, 45, 'triangle', 0.035);
  },
  /** 踩雷 */
  boom(): void {
    noise(420, 0.14);
    tone(90, 300, 'sawtooth', 0.06);
  },
  /** 通關:上行小三和弦 */
  win(): void {
    tone(523, 120, 'square', 0.05, 0);
    tone(659, 120, 'square', 0.05, 110);
    tone(784, 120, 'square', 0.05, 220);
    tone(1047, 220, 'square', 0.05, 330);
  }
};
