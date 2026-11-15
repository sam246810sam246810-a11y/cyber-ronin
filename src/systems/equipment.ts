// 裝備：稀有度、詞條、隨機產生、能力加總（PRD 7.1–7.3）。純函式。
import equipment from '../data/equipment.json';
import type { Rng } from './combat';

export type Slot = 'weapon' | 'head' | 'body' | 'hands' | 'feet' | 'accessory';
export const SLOTS: Slot[] = ['weapon', 'head', 'body', 'hands', 'feet', 'accessory'];
export const SLOT_NAME: Record<Slot, string> = { weapon: '武器', head: '頭', body: '身', hands: '手', feet: '腳', accessory: '飾品' };

export type StatKey = 'hp' | 'mp' | 'atk' | 'def' | 'spd' | 'crit' | 'mpRegen' | 'atkPct' | 'defPct';
export type StatBlock = Partial<Record<StatKey, number>>;
export const STAT_NAME: Record<StatKey, string> = {
  hp: 'HP', mp: 'MP', atk: '攻擊', def: '防禦', spd: '速度', crit: '爆擊率', mpRegen: 'MP 回復', atkPct: '攻擊', defPct: '防禦',
};
/** 顯示用：+3、+5%、+0.5/秒 */
export function formatStat(k: StatKey, v: number): string {
  const n = Number.isInteger(v) ? String(v) : v.toFixed(1);
  if (k === 'crit' || k === 'atkPct' || k === 'defPct') return `${STAT_NAME[k]} +${n}%`;
  if (k === 'mpRegen') return `${STAT_NAME[k]} +${n}/秒`;
  return `${STAT_NAME[k]} +${n}`;
}

export type BaseId = keyof typeof equipment;
export interface BaseItem { name: string; slot: Slot; class?: string; tier: number; price: number; stats: StatBlock }
export const BASES = equipment as Record<BaseId, BaseItem>;

export interface Rarity { name: string; color: string; affixes: number; weight: number }
export const RARITIES: Rarity[] = [
  { name: '普通', color: '#e8e4d8', affixes: 0, weight: 60 },
  { name: '優良', color: '#6fd06f', affixes: 1, weight: 25 },
  { name: '稀有', color: '#5fa8ff', affixes: 2, weight: 10 },
  { name: '史詩', color: '#c77dff', affixes: 3, weight: 4 },
  { name: '傳說', color: '#ffc845', affixes: 3, weight: 1 },
];

export interface Affix { stat: StatKey; value: number }
/** plus：強化等級 0–5（PRD 7.4） */
export interface Equip { uid: number; base: BaseId; rarity: number; affixes: Affix[]; plus?: number }

/** 詞條池：[最小, 最大]，第 2 階再 ×1.6 */
const AFFIX_POOL: Record<string, [number, number, boolean]> = {
  atkPct: [3, 8, true], defPct: [3, 8, true], hp: [5, 15, true], mp: [4, 10, true],
  spd: [2, 6, true], crit: [1, 4, true], mpRegen: [0.2, 0.6, false],
};

/** 依權重抽稀有度。maxRarity 用來限制（第 1 章普通怪不掉傳說）。 */
export function rollRarity(rng: Rng, minRarity = 0, maxRarity = 3): number {
  const pool = RARITIES.map((r, i) => ({ i, w: i >= minRarity && i <= maxRarity ? r.weight : 0 }));
  const total = pool.reduce((s, p) => s + p.w, 0);
  let x = rng() * total;
  for (const p of pool) { if (p.w === 0) continue; x -= p.w; if (x < 0) return p.i; }
  return Math.max(minRarity, Math.min(maxRarity, 0));
}

export function rollAffixes(rng: Rng, count: number, tier: number): Affix[] {
  const keys = Object.keys(AFFIX_POOL);
  const out: Affix[] = [];
  for (let i = 0; i < count && keys.length; i++) {
    const k = keys.splice(Math.floor(rng() * keys.length), 1)[0];
    const [lo, hi, int] = AFFIX_POOL[k];
    const raw = (lo + rng() * (hi - lo)) * (tier >= 2 ? 1.6 : 1);
    out.push({ stat: k as StatKey, value: int ? Math.round(raw) : Math.round(raw * 10) / 10 });
  }
  return out;
}

/** 隨機產生一件裝備。classId 用來只掉自己職業能用的武器。 */
export function generateEquip(rng: Rng, uid: number, opts: { tier: number; classId: string; minRarity?: number; maxRarity?: number; slot?: Slot }): Equip {
  const ids = (Object.keys(BASES) as BaseId[]).filter((id) => {
    const b = BASES[id];
    return b.tier === opts.tier && (!b.class || b.class === opts.classId) && (!opts.slot || b.slot === opts.slot);
  });
  const base = ids[Math.floor(rng() * ids.length)];
  const rarity = rollRarity(rng, opts.minRarity ?? 0, opts.maxRarity ?? 3);
  return { uid, base, rarity, affixes: rollAffixes(rng, RARITIES[rarity].affixes, opts.tier) };
}

export function equipName(e: Equip): string { return BASES[e.base].name + (e.plus ? ` +${e.plus}` : ''); }
export function canUse(e: Equip, classId: string): boolean { const c = BASES[e.base].class; return !c || c === classId; }

/** 這件裝備提供的所有能力（基礎＋詞條） */
export function equipStats(e: Equip): StatBlock {
  // 強化：每級基礎數值 +8%（四捨五入到小數 1 位）
  const k = 1 + 0.08 * (e.plus ?? 0);
  const out: StatBlock = {};
  for (const [s, v] of Object.entries(BASES[e.base].stats) as [StatKey, number][]) out[s] = Math.round(v * k * 10) / 10;
  for (const a of e.affixes) out[a.stat] = (out[a.stat] ?? 0) + a.value;
  return out;
}

/** 價格：基礎價 ×（1 + 0.5 × 稀有度） */
export function equipValue(e: Equip): number { return Math.round(BASES[e.base].price * (1 + 0.5 * e.rarity) * (1 + 0.2 * (e.plus ?? 0))); }
export const SELL_RATE = 0.4;
export function sellPrice(buyPrice: number): number { return Math.max(1, Math.floor(buyPrice * SELL_RATE)); }

export function sumStats(blocks: StatBlock[]): StatBlock {
  const out: StatBlock = {};
  for (const b of blocks) for (const [k, v] of Object.entries(b) as [StatKey, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}
