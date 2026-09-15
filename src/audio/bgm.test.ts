import { describe, it, expect } from 'vitest';
import { DEFAULT_TRACK, TRACKS, findTrack, isAligned, loopBeats } from './bgm';

/**
 * 背景音樂的資料層測試(發不發得出聲要真瀏覽器驗,這裡驗的是譜對不對)。
 *
 * ★ 最重要的一條是「對齊」:旋律總拍數必須等於 bass.length × 4。
 *   不對齊的話旋律與和聲每一圈都會錯開一點,聽起來像越走越歪 ——
 *   而且是**慢慢**歪,開發時聽個十秒完全聽不出來,要循環好幾圈才明顯。
 */

describe('曲目', () => {
  it('旋律與低音對齊(總拍數 = 根音數 × 4)', () => {
    for (const t of TRACKS) {
      expect(isAligned(t), `${t.id}:旋律 ${loopBeats(t)} 拍、低音 ${t.bass.length * 4} 拍`).toBe(
        true
      );
    }
  });

  it('id 不重複、名稱不空', () => {
    const ids = TRACKS.map((t) => t.id);
    expect(ids.length).toBe(new Set(ids).size);
    for (const t of TRACKS) expect(t.name.trim().length).toBeGreaterThan(0);
  });

  it('每首都有旋律與低音,拍速在合理範圍', () => {
    for (const t of TRACKS) {
      expect(t.melody.length, t.id).toBeGreaterThan(0);
      expect(t.bass.length, t.id).toBeGreaterThan(0);
      // 太快像警報、太慢像當掉
      expect(t.beat, t.id).toBeGreaterThanOrEqual(0.15);
      expect(t.beat, t.id).toBeLessThanOrEqual(1.2);
    }
  });

  it('所有音高都在人耳舒適範圍(不會有刺耳高音或聽不到的低頻)', () => {
    for (const t of TRACKS) {
      for (const [f] of t.melody) {
        if (f === 0) continue; // 休止
        expect(f, `${t.id} 旋律 ${f}Hz`).toBeGreaterThan(60);
        expect(f, `${t.id} 旋律 ${f}Hz`).toBeLessThan(2100);
      }
      for (const f of t.bass) {
        expect(f, `${t.id} 低音 ${f}Hz`).toBeGreaterThan(40);
        expect(f, `${t.id} 低音 ${f}Hz`).toBeLessThan(400);
      }
    }
  });

  it('一圈長度合理(太短會像壞掉的鈴聲一直重複)', () => {
    for (const t of TRACKS) {
      const sec = loopBeats(t) * t.beat;
      expect(sec, `${t.id} 一圈 ${sec.toFixed(1)} 秒`).toBeGreaterThanOrEqual(4);
      expect(sec, `${t.id} 一圈 ${sec.toFixed(1)} 秒`).toBeLessThanOrEqual(60);
    }
  });

  it('預設曲目存在;找不到的 id 回退到第一首,不會炸', () => {
    expect(findTrack(DEFAULT_TRACK).id).toBe(DEFAULT_TRACK);
    expect(findTrack('這首不存在').id).toBe(TRACKS[0].id);
  });
});
