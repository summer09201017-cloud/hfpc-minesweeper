/**
 * 共用的 AudioContext。
 *
 * ★ 音效與音樂共用同一個 context:瀏覽器對同時存在的 AudioContext 數量有上限,
 *   而且兩個 context 各自 resume 會在 iOS 上打架(一個解鎖了、另一個還是 suspended,
 *   結果「有音效沒音樂」這種只在真手機上出現的怪症狀)。
 * ★ 沒有 Web Audio、或被瀏覽器擋住 ⇒ 一律靜默 fallback,不報錯、不卡關。
 */

let ctx: AudioContext | null = null;
let unlocked = false;

export function getCtx(): AudioContext | null {
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

/** 音訊能不能出聲(還沒解鎖 / 不支援時為 false)。 */
export function audioReady(): boolean {
  const c = getCtx();
  return Boolean(c && c.state === 'running');
}

/** 接在第一個使用者手勢上。重複呼叫沒有副作用。 */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume().catch(() => undefined);
  if (unlocked) return;
  unlocked = true;
  // 解鎖後通知等著開始播的音樂(自動播放政策擋掉的第一次)
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // 一個聽眾壞掉不可以拖垮其他人
    }
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onUnlock(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 帶柔和起音/收音包絡的單音。所有發聲都走這裡,音量與收尾只有一份。 */
export function tone(
  freq: number,
  durationSec: number,
  startAt: number,
  gainValue: number,
  type: OscillatorType,
  dest: AudioNode
): void {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startAt);
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(gainValue, startAt + Math.min(0.06, durationSec * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
    osc.connect(g).connect(dest);
    osc.start(startAt);
    osc.stop(startAt + durationSec + 0.03);
  } catch {
    // 發不出聲不可以影響遊戲
  }
}
