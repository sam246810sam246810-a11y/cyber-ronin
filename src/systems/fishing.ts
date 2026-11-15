// 釣魚：每個釣點有自己的魚種；上鉤後要在綠色區域按 3 次（PRD 外的新玩法）。純函式。
import type { Rng } from './combat';

export interface Fish { name: string; weight: number; zone: number; desc: string }
/** 釣點類型 → 可能的魚（weight 越大越常見；zone 是綠色區域的寬度，越小越難） */
export const FISH: Record<string, Fish[]> = {
  pond: [
    { name: '鯽魚', weight: 60, zone: 0.32, desc: '池塘裡最常見的魚。' },
    { name: '鯉魚', weight: 30, zone: 0.24, desc: '肥美的鯉魚，適合煮湯。' },
    { name: '金鯉', weight: 4, zone: 0.12, desc: '傳說中會帶來好運的金色鯉魚。' },
  ],
  swamp: [
    { name: '鯽魚', weight: 40, zone: 0.32, desc: '池塘裡最常見的魚。' },
    { name: '香魚', weight: 45, zone: 0.26, desc: '清甜的香魚，鹽烤最好吃。' },
    { name: '金鯉', weight: 5, zone: 0.12, desc: '傳說中會帶來好運的金色鯉魚。' },
  ],
  sea: [
    { name: '鯛魚', weight: 50, zone: 0.24, desc: '喜慶的時候吃的魚。' },
    { name: '香魚', weight: 25, zone: 0.26, desc: '清甜的香魚，鹽烤最好吃。' },
    { name: '龍宮魚', weight: 6, zone: 0.1, desc: '只在龍宮附近出現的發光魚。' },
  ],
};

export function rollFish(spot: string, rng: Rng = Math.random): Fish {
  const pool = FISH[spot] ?? FISH.pond;
  let x = rng() * pool.reduce((s, f) => s + f.weight, 0);
  for (const f of pool) { x -= f.weight; if (x < 0) return f; }
  return pool[0];
}

/** 指針位置 0..1 是否落在綠色區域（區域置中） */
export const inZone = (pos: number, zone: number) => Math.abs(pos - 0.5) <= zone / 2;

/** 要成功按中幾次、可以失手幾次 */
export const FISH_HITS = 3;
export const FISH_MISSES = 2;
