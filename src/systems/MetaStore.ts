import { META_UPGRADES, RELICS, RELIC_UNLOCK_COST } from '../data';

const KEY = 'crucible-garden.meta.v1';

interface MetaData {
  sand: number;
  levels: Record<string, number>;
  relics: string[];
}

/** 跨局永久進度：時之砂、大坩堝升級、已解鎖的聖物 */
class MetaStoreImpl {
  data: MetaData = { sand: 0, levels: {}, relics: RELICS.filter((r) => r.starter).map((r) => r.id) };

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<MetaData>;
        this.data = { ...this.data, ...d, relics: [...new Set([...(this.data.relics), ...(d.relics ?? [])])] };
      }
    } catch {
      /* ignore */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }

  get sand(): number {
    return this.data.sand;
  }

  addSand(n: number): void {
    this.data.sand += Math.max(0, Math.round(n));
    this.save();
  }

  level(id: string): number {
    return this.data.levels[id] ?? 0;
  }

  nextCost(id: string): number | undefined {
    const def = META_UPGRADES.find((u) => u.id === id);
    if (!def) return undefined;
    const lv = this.level(id);
    return lv >= def.max ? undefined : def.costs[lv];
  }

  buy(id: string): boolean {
    const cost = this.nextCost(id);
    if (cost === undefined || this.data.sand < cost) return false;
    this.data.sand -= cost;
    this.data.levels[id] = this.level(id) + 1;
    this.save();
    return true;
  }

  relicUnlocked(id: string): boolean {
    return this.data.relics.includes(id);
  }

  unlockRelic(id: string): boolean {
    const r = RELICS.find((x) => x.id === id);
    if (!r || this.relicUnlocked(id)) return false;
    const cost = RELIC_UNLOCK_COST[r.rarity];
    if (this.data.sand < cost) return false;
    this.data.sand -= cost;
    this.data.relics.push(id);
    this.save();
    return true;
  }

  debugAddSand(n: number): void {
    this.addSand(n);
  }

  reset(): void {
    this.data = { sand: 0, levels: {}, relics: RELICS.filter((r) => r.starter).map((r) => r.id) };
    this.save();
  }
}

export const MetaStore = new MetaStoreImpl();
