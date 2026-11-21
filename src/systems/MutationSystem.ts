import { MUTATIONS } from '../data';
import type { MutationDef } from '../types';
import { shuffle } from '../utils';

/** 管理本局拿到的突變卡與層數。效果由 BuffSystem / CrucibleSystem 依層數讀取。 */
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

  owned(): { def: MutationDef; stacks: number }[] {
    return MUTATIONS.filter((m) => this.stacks(m.id) > 0).map((def) => ({ def, stacks: this.stacks(def.id) }));
  }
}
