import { MUTATIONS } from '../data';
import { MODIFIERS } from '../mutations/registry';
import type { MutationDef, PotionParams } from '../types';
import { shuffle } from '../utils';

/** 管理本局拿到的突變卡與層數 */
export class MutationSystem {
  private stackMap = new Map<string, number>();

  add(id: string): void {
    this.stackMap.set(id, this.stacks(id) + 1);
  }

  stacks(id: string): number {
    return this.stackMap.get(id) ?? 0;
  }

  /** 三選一，不重複 */
  roll(n = 3): MutationDef[] {
    return shuffle([...MUTATIONS]).slice(0, n);
  }

  /** 回傳套用所有突變後的參數複本 */
  apply(base: PotionParams, recipeKey: string): PotionParams {
    const p: PotionParams = { ...base, extra: { ...base.extra } };
    for (const [id, s] of this.stackMap) {
      if (s > 0) MODIFIERS[id]?.apply?.(p, s, recipeKey);
    }
    return p;
  }

  owned(): { def: MutationDef; stacks: number }[] {
    return MUTATIONS.filter((m) => this.stacks(m.id) > 0).map((def) => ({ def, stacks: this.stacks(def.id) }));
  }
}
