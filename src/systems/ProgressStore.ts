import { STORAGE_KEYS } from '../config';
import { CHARACTERS } from '../data';
import type { CharacterDef } from '../types';

interface Progress {
  bestWave: number;
  fissions: number;
  bossKills: number;
  selected: string;
  debugUnlockAll?: boolean;
}

/** 跨局進度：角色解鎖條件用（存在 localStorage，失敗時只在本次開啟有效） */
class ProgressStoreImpl {
  data: Progress = { bestWave: 0, fissions: 0, bossKills: 0, selected: 'apprentice' };

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.progress);
      if (raw) this.data = { ...this.data, ...(JSON.parse(raw) as Partial<Progress>) };
    } catch {
      /* ignore */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }

  isUnlocked(c: CharacterDef): boolean {
    if (this.data.debugUnlockAll) return true;
    switch (c.unlock.type) {
      case 'default': return true;
      case 'bestWave': return this.data.bestWave >= c.unlock.value;
      case 'fissions': return this.data.fissions >= c.unlock.value;
      case 'bossKills': return this.data.bossKills >= c.unlock.value;
    }
  }

  progressText(c: CharacterDef): string {
    switch (c.unlock.type) {
      case 'default': return '';
      case 'bestWave': return `${Math.min(this.data.bestWave, c.unlock.value)}/${c.unlock.value}`;
      case 'fissions': return `${Math.min(this.data.fissions, c.unlock.value)}/${c.unlock.value}`;
      case 'bossKills': return `${Math.min(this.data.bossKills, c.unlock.value)}/${c.unlock.value}`;
    }
  }

  unlockedIds(): string[] {
    return CHARACTERS.filter((c) => this.isUnlocked(c)).map((c) => c.id);
  }

  /** 更新進度並回傳新解鎖的角色 */
  record(patch: { wave?: number; fission?: boolean; bossKill?: boolean }): CharacterDef[] {
    const before = new Set(this.unlockedIds());
    if (patch.wave !== undefined) this.data.bestWave = Math.max(this.data.bestWave, patch.wave);
    if (patch.fission) this.data.fissions++;
    if (patch.bossKill) this.data.bossKills++;
    this.save();
    return CHARACTERS.filter((c) => this.isUnlocked(c) && !before.has(c.id));
  }

  select(id: string): void {
    this.data.selected = id;
    this.save();
  }

  get selected(): CharacterDef {
    const c = CHARACTERS.find((x) => x.id === this.data.selected);
    return c && this.isUnlocked(c) ? c : CHARACTERS[0];
  }

  debugUnlockAll(): void {
    this.data.debugUnlockAll = true;
    this.save();
  }

  reset(): void {
    this.data = { bestWave: 0, fissions: 0, bossKills: 0, selected: 'apprentice' };
    this.save();
  }
}

export const ProgressStore = new ProgressStoreImpl();
