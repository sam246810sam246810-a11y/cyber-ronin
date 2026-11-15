// 鍛冶屋（PRD 7.4）：打造、強化（最多 +5，每級主要數值 +8%）、合成（3 件同稀有度 → 1 件高一級）。純函式。
import recipes from '../data/recipes.json';
import { BASES, generateEquip, type BaseId, type Equip } from './equipment';
import { canAddGear, equippedUids } from './inventory';
import type { Rng } from './combat';
import type { GameState } from './gameState';

export interface Recipe { name: string; out: string | Record<string, string>; rarity: number; money: number; mats: Record<string, number> }
export const RECIPES = recipes as Record<string, Recipe>;
export const MAX_PLUS = 5;
export const PLUS_RATE = 0.08;
export const SYNTH_COST = 100;

export function recipeOutput(r: Recipe, classId: string): BaseId { return (typeof r.out === 'string' ? r.out : r.out[classId]) as BaseId; }

export function missingFor(s: GameState, r: Recipe): string[] {
  const miss = Object.entries(r.mats).filter(([n, c]) => (s.items[n] ?? 0) < c).map(([n, c]) => `${n} ${s.items[n] ?? 0}/${c}`);
  if (s.money < r.money) miss.push(`文 ${s.money}/${r.money}`);
  return miss;
}

function pay(s: GameState, mats: Record<string, number>, money: number): void {
  for (const [n, c] of Object.entries(mats)) { s.items[n] -= c; if (s.items[n] <= 0) delete s.items[n]; }
  s.money -= money;
}

export function craft(s: GameState, id: string): { ok: boolean; message: string; item?: Equip } {
  const r = RECIPES[id];
  if (!r) return { ok: false, message: '沒有這張配方' };
  const miss = missingFor(s, r);
  if (miss.length) return { ok: false, message: `材料不夠：${miss.join('、')}` };
  if (!canAddGear(s)) return { ok: false, message: '背包滿了' };
  pay(s, r.mats, r.money);
  const item: Equip = { uid: s.nextUid++, base: recipeOutput(r, s.classId), rarity: r.rarity, affixes: [] };
  s.gear.push(item);
  return { ok: true, message: `打造完成：${BASES[item.base].name}`, item };
}

/** 強化到下一級的花費：玉鋼 ×（下一級），文 50 ×（下一級） */
export function enhanceCost(plus: number): { mats: Record<string, number>; money: number } {
  const n = plus + 1;
  return { mats: { 玉鋼: n }, money: 50 * n };
}

export function enhance(s: GameState, uid: number): { ok: boolean; message: string } {
  const g = s.gear.find((x) => x.uid === uid);
  if (!g) return { ok: false, message: '找不到這件裝備' };
  const plus = g.plus ?? 0;
  if (plus >= MAX_PLUS) return { ok: false, message: `已經強化到 +${MAX_PLUS} 了` };
  const c = enhanceCost(plus);
  if ((s.items['玉鋼'] ?? 0) < c.mats['玉鋼'] || s.money < c.money) return { ok: false, message: `需要玉鋼 ×${c.mats['玉鋼']}、${c.money} 文` };
  pay(s, c.mats, c.money);
  g.plus = plus + 1;
  return { ok: true, message: `${BASES[g.base].name} 強化到 +${g.plus}！` };
}

/** 合成用的候選：沒穿在身上、稀有度相同、不是傳說 */
export function synthCandidates(s: GameState, rarity: number): Equip[] {
  const worn = equippedUids(s);
  return s.gear.filter((g) => !worn.has(g.uid) && g.rarity === rarity && rarity < 4);
}

export function synthesize(s: GameState, uids: number[], rng: Rng = Math.random): { ok: boolean; message: string; item?: Equip } {
  if (new Set(uids).size !== 3) return { ok: false, message: '要選 3 件不同的裝備' };
  const items = uids.map((u) => s.gear.find((g) => g.uid === u));
  if (items.some((g) => !g)) return { ok: false, message: '找不到裝備' };
  const worn = equippedUids(s);
  if (uids.some((u) => worn.has(u))) return { ok: false, message: '穿在身上的不能合成' };
  const r = items[0]!.rarity;
  if (items.some((g) => g!.rarity !== r) || r >= 4) return { ok: false, message: '要 3 件同樣稀有度的（傳說不能合成）' };
  if (s.money < SYNTH_COST) return { ok: false, message: `需要 ${SYNTH_COST} 文` };
  s.money -= SYNTH_COST;
  s.gear = s.gear.filter((g) => !uids.includes(g.uid));
  const tier = items.every((g) => BASES[g!.base].tier >= 2) ? 2 : 1;
  const item = generateEquip(rng, s.nextUid++, { tier, classId: s.classId, minRarity: r + 1, maxRarity: r + 1 });
  s.gear.push(item);
  return { ok: true, message: `合成完成：${BASES[item.base].name}`, item };
}
