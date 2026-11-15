// 背包（PRD 7.5）：消耗品可疊 99，裝備每件 1 格，穿在身上的不佔格。純函式。
import type { Equip } from './equipment';

export const STACK = 99;
export const BAG_START = 30;
export const BAG_MAX = 60;
export const BAG_EXPAND = 10;

export interface Bag { items: Record<string, number>; gear: Equip[]; equipped: Record<string, number | null>; capacity: number }

export function equippedUids(bag: Bag): Set<number> {
  return new Set(Object.values(bag.equipped).filter((u): u is number => u != null));
}

export function slotsUsed(bag: Bag): number {
  const stacks = Object.values(bag.items).reduce((s, n) => s + (n > 0 ? Math.ceil(n / STACK) : 0), 0);
  const worn = equippedUids(bag);
  return stacks + bag.gear.filter((g) => !worn.has(g.uid)).length;
}

/** 放得下 n 個這種消耗品嗎？（疊到現有堆疊不需要新格子） */
export function canAddItem(bag: Bag, name: string, n = 1): boolean {
  const have = bag.items[name] ?? 0;
  const extra = Math.ceil((have + n) / STACK) - Math.ceil(have / STACK);
  return slotsUsed(bag) + extra <= bag.capacity;
}

export function canAddGear(bag: Bag): boolean { return slotsUsed(bag) + 1 <= bag.capacity; }
