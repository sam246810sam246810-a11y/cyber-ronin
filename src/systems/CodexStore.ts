import { STORAGE_KEYS } from '../config';
import { RECIPE_ORDER } from '../data';

/** 圖鑑解鎖紀錄（唯一會存進 localStorage 的資料） */
class CodexStoreImpl {
  private known = new Set<string>();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.codex);
      if (raw) (JSON.parse(raw) as string[]).forEach((k) => this.known.add(k));
    } catch {
      /* 私密模式或被封鎖時直接忽略 */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.codex, JSON.stringify([...this.known]));
    } catch {
      /* ignore */
    }
  }

  has(key: string): boolean {
    return this.known.has(key);
  }

  /** 回傳 true 代表是新發現 */
  discover(key: string): boolean {
    if (this.known.has(key)) return false;
    this.known.add(key);
    this.save();
    return true;
  }

  get count(): number {
    return this.known.size;
  }

  get total(): number {
    return RECIPE_ORDER.length;
  }

  unlockAll(): void {
    RECIPE_ORDER.forEach((k) => this.known.add(k));
    this.save();
  }

  reset(): void {
    this.known.clear();
    this.save();
  }
}

export const CodexStore = new CodexStoreImpl();
