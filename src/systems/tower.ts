// 百鬼塔（破關後的挑戰）：10 層，每層的妖怪與強度。純函式。
import type { EnemyKind } from '../entities/Enemy';

export const TOWER_FLOORS = 10;

const POOLS: EnemyKind[][] = [
  ['kitsunebi', 'karakasa', 'nogitsune', 'bonespider'],
  ['kappa', 'dorotabou', 'aokitsunebi', 'bonespider'],
  ['karasu', 'yamawaro', 'kamaitachi', 'kappa'],
  ['gaki', 'aka_oni', 'ao_oni', 'onibi'],
];

export interface FloorPlan { enemies: EnemyKind[]; boss?: 'kappaking' | 'daitengu' | 'shuten' | 'hyakki'; power: number; name: string }

/** 第 floor 層（1～10）要出什麼。power 是血量與攻擊的倍率。 */
export function floorPlan(floor: number, rng: () => number = Math.random): FloorPlan {
  const power = 1 + 0.12 * (floor - 1);
  if (floor === 5) return { enemies: ['karasu', 'karasu'], boss: 'kappaking', power, name: '第 5 層・河童王重戰' };
  if (floor === 8) return { enemies: ['gaki', 'gaki'], boss: 'daitengu', power, name: '第 8 層・大天狗重戰' };
  if (floor === TOWER_FLOORS) return { enemies: [], boss: 'hyakki', power, name: '第 10 層・百鬼之主' };
  const pool = POOLS[Math.min(POOLS.length - 1, Math.floor((floor - 1) / 2.5))];
  const count = 4 + Math.floor(floor / 2);
  const enemies: EnemyKind[] = Array.from({ length: count }, () => pool[Math.floor(rng() * pool.length)]);
  if (floor === 4 || floor === 9) enemies.push(floor === 4 ? 'suiko' : 'ibaraki');
  return { enemies, power, name: `第 ${floor} 層` };
}

/** 第一次通過某層的獎勵稀有度下限：越高層越好，第 10 層保證傳說 */
export function floorRewardRarity(floor: number): number {
  return floor >= TOWER_FLOORS ? 4 : floor >= 7 ? 3 : floor >= 4 ? 2 : 1;
}
