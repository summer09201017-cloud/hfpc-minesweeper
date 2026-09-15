/**
 * 可重現的亂數(mulberry32)。
 *
 * ★ 為什麼不用 Math.random:每日挑戰 / 題號連結 / 單元測試都要「同一個種子 → 同一盤」。
 *   Math.random 沒有種子,那三件事全部做不成。
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 隨機整數 [0, n)。 */
export function randInt(rnd: Rng, n: number): number {
  return Math.floor(rnd() * n);
}

/** 原地 Fisher-Yates。回傳同一個陣列,方便串接。 */
export function shuffle<T>(arr: T[], rnd: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rnd, i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** 沒給種子時的隨機種子(31 位元正整數,和 daily 的種子同一個值域)。 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
