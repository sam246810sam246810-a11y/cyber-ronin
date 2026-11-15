// 料理：用魚和素材做食物。食物可以回復，也可以給一段時間的加成。純函式。
import type { GameState } from './gameState';

export type BuffKind = 'atk' | 'def' | 'crit' | 'all';
export const BUFF_INFO: Record<BuffKind, { name: string; desc: string }> = {
  atk: { name: '力量', desc: '攻擊 +20%' },
  def: { name: '堅固', desc: '防禦 +20%' },
  crit: { name: '專注', desc: '爆擊率 +10%' },
  all: { name: '御膳', desc: '攻擊、防禦 +15%，爆擊率 +5%' },
};

export interface Food { name: string; mats: Record<string, number>; hp?: number; mp?: number; buff?: BuffKind; seconds?: number; desc: string }
export const FOODS: Food[] = [
  { name: '烤鯽魚', mats: { 鯽魚: 1 }, hp: 80, desc: 'HP 回復 80' },
  { name: '香魚鹽燒', mats: { 香魚: 1 }, hp: 120, mp: 20, desc: 'HP 回復 120、MP 回復 20' },
  { name: '鯉魚味噌湯', mats: { 鯉魚: 1, 解毒草: 1 }, hp: 60, buff: 'def', seconds: 180, desc: 'HP 回復 60，3 分鐘內防禦 +20%' },
  { name: '鯛魚飯', mats: { 鯛魚: 1, 回復丸: 1 }, hp: 60, buff: 'atk', seconds: 180, desc: 'HP 回復 60，3 分鐘內攻擊 +20%' },
  { name: '狐火烤串', mats: { 鯽魚: 1, 狐火的殘焰: 2 }, hp: 40, buff: 'crit', seconds: 180, desc: 'HP 回復 40，3 分鐘內爆擊率 +10%' },
  { name: '金鯉御膳', mats: { 金鯉: 1, 鯛魚: 1 }, hp: 9999, mp: 999, buff: 'all', seconds: 300, desc: 'HP、MP 全滿，5 分鐘內攻擊、防禦 +15%、爆擊率 +5%' },
  { name: '龍宮珍味', mats: { 龍宮魚: 1, 鯛魚: 1 }, hp: 9999, mp: 999, buff: 'all', seconds: 600, desc: 'HP、MP 全滿，10 分鐘內攻擊、防禦 +15%、爆擊率 +5%' },
];
export const FOOD_BY_NAME: Record<string, Food> = Object.fromEntries(FOODS.map((f) => [f.name, f]));

export function canCook(s: GameState, f: Food): boolean { return Object.entries(f.mats).every(([n, c]) => (s.items[n] ?? 0) >= c); }

export function cook(s: GameState, name: string): string | null {
  const f = FOOD_BY_NAME[name];
  if (!f || !canCook(s, f)) return null;
  for (const [n, c] of Object.entries(f.mats)) { s.items[n] -= c; if (s.items[n] <= 0) delete s.items[n]; }
  s.items[f.name] = (s.items[f.name] ?? 0) + 1;
  return `做好了「${f.name}」`;
}

/** 加成的倍率（給 statsOf 用） */
export function buffMultipliers(buffs: Partial<Record<BuffKind, number>>): { atk: number; def: number; crit: number } {
  const on = (k: BuffKind) => (buffs[k] ?? 0) > 0;
  return {
    atk: (on('atk') ? 1.2 : 1) * (on('all') ? 1.15 : 1),
    def: (on('def') ? 1.2 : 1) * (on('all') ? 1.15 : 1),
    crit: (on('crit') ? 10 : 0) + (on('all') ? 5 : 0),
  };
}

export function tickBuffs(buffs: Partial<Record<BuffKind, number>>, sec: number): void {
  for (const k of Object.keys(buffs) as BuffKind[]) { buffs[k] = (buffs[k] ?? 0) - sec; if ((buffs[k] ?? 0) <= 0) delete buffs[k]; }
}
