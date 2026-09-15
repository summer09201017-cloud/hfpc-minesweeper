import { getCtx, tone } from './ctx';

/**
 * 零音檔音效(Web Audio 即時合成)。
 *
 * 守本系列慣例:
 *  - 沒有 Web Audio、或被瀏覽器擋住 ⇒ **靜默 fallback**,不報錯、不卡關
 *  - 自動播放政策:第一個使用者手勢才 resume(見 ctx.ts 的 unlockAudio)
 *  - 可以被設定關掉(呼叫端自己判斷 settings.sound)
 *
 * XP 原版有 tick / win / lose 三種音,這裡照那個精神做。
 * 背景音樂是另一回事,在 bgm.ts —— 兩者音量分開,音效永遠蓋得過音樂。
 */

export { unlockAudio } from './ctx';

function blip(freq: number, durationMs: number, type: OscillatorType, gain: number, delayMs = 0): void {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  tone(freq, durationMs / 1000, c.currentTime + delayMs / 1000, gain, type, c.destination);
}

function noise(durationMs: number, gain = 0.12): void {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
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
    // 音效失敗絕不可以影響遊戲
  }
}

export const sfx = {
  /** 開格子:短促的 tick */
  open(): void {
    blip(880, 35, 'square', 0.025);
  },
  /** 插旗 / 拔旗 */
  flag(): void {
    blip(1320, 45, 'triangle', 0.035);
  },
  /** 踩雷 */
  boom(): void {
    noise(420, 0.14);
    blip(90, 300, 'sawtooth', 0.06);
  },
  /** 通關:上行小三和弦 */
  win(): void {
    blip(523, 120, 'square', 0.05, 0);
    blip(659, 120, 'square', 0.05, 110);
    blip(784, 120, 'square', 0.05, 220);
    blip(1047, 220, 'square', 0.05, 330);
  }
};
