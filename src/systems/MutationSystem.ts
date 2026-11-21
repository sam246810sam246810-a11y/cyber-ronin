import { CARD_RARITY, RARITY } from '../config';
import { MUTATIONS } from '../data';
import type { MutationDef, RarityIndex } from '../types';
import { shuffle } from '../utils';

export interface CardOffer {
  def: MutationDef;
  rarity: RarityIndex;
  /** 這張卡的實際數值（base × 稀有度倍率） */
  value: number;
}

export const formatCardValue = (def: MutationDef, value: number) =>
  `${Number.isInteger(value) ? value : value.toFixed(def.unit === '%' ? 1 : 2).replace(/\.?0+$/, '')}${def.unit}`;

export const cardDesc = (def: MutationDef, value: number) => def.desc.replace('{v}', formatCardValue(def, value));

/**
 * 本局拿到的突變卡。
 * 每張卡依稀有度給「層數」：普通 1、稀有 1.5、史詩 2、傳說 3；效果 = base × 層數。
 */
export class MutationSystem {
  private stackMap = new Map<string, number>();

  add(id: string, amount = 1): void {
    this.stackMap.set(id, this.stacks(id) + amount);
  }

  /** 累積層數（可能有小數） */
  stacks(id: string): number {
    return this.stackMap.get(id) ?? 0;
  }

  /** 效果數值：base × 層數，例如濃縮 2 層 = 50 */
  value(id: string): number {
    const def = MUTATIONS.find((m) => m.id === id);
    return def ? def.base * this.stacks(id) : 0;
  }

  /** 三選一，不重複，每張擲稀有度 */
  roll(wave: number, minRarity: RarityIndex = 0, n = 3): CardOffer[] {
    const w = CARD_RARITY.base.map((b, i) => Math.max(0.1, b + CARD_RARITY.perWave[i] * Math.max(0, wave - 1)));
    return shuffle([...MUTATIONS]).slice(0, n).map((def) => {
      const rarity = Math.max(minRarity, rollRarity(w)) as RarityIndex;
      return { def, rarity, value: def.base * RARITY[rarity].mult };
    });
  }

  owned(): { def: MutationDef; stacks: number; value: number }[] {
    return MUTATIONS.filter((m) => this.stacks(m.id) > 0)
      .map((def) => ({ def, stacks: this.stacks(def.id), value: def.base * this.stacks(def.id) }));
  }
}

export function rollRarity(weights: readonly number[]): RarityIndex {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i as RarityIndex;
  }
  return 0;
}
