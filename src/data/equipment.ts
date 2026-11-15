export type Slot = 'weapon' | 'armor' | 'ring' | 'collar';
export const SLOTS: Slot[] = ['weapon', 'armor', 'ring', 'collar'];
export const SLOT_NAME: Record<Slot, string> = { weapon: '武器', armor: '護甲', ring: '戒指', collar: '項圈' };

export interface StatBlock {
  atk?: number;
  hp?: number;
  aspd?: number;      // 攻速加成（比例）
  crit?: number;      // 爆擊率
  critDmg?: number;   // 爆傷
  dmgReduce?: number; // 減傷
}

export interface EquipTpl {
  id: string;
  slot: Slot;
  name: string;
  icon: string;
  base: StatBlock;
}

export const EQUIP_TPLS: EquipTpl[] = [
  { id: 'slingshot', slot: 'weapon', name: '橡果彈弓', icon: '🌰', base: { atk: 30 } },
  { id: 'wand', slot: 'weapon', name: '鈴鐺魔杖', icon: '🪄', base: { atk: 24, aspd: 0.05 } },
  { id: 'leafvest', slot: 'armor', name: '樹葉背心', icon: '🍃', base: { hp: 150 } },
  { id: 'shell', slot: 'armor', name: '貝殼鎧甲', icon: '🐚', base: { hp: 110, dmgReduce: 0.03 } },
  { id: 'clover', slot: 'ring', name: '幸運草戒', icon: '🍀', base: { atk: 8, crit: 0.03 } },
  { id: 'moon', slot: 'ring', name: '月光戒指', icon: '🌙', base: { atk: 8, critDmg: 0.15 } },
  { id: 'bell', slot: 'collar', name: '鈴鐺項圈', icon: '🔔', base: { hp: 60, atk: 10 } },
  { id: 'star', slot: 'collar', name: '星星項圈', icon: '⭐', base: { hp: 40, aspd: 0.04 } },
];
export const TPL_MAP: Record<string, EquipTpl> = Object.fromEntries(EQUIP_TPLS.map((t) => [t.id, t]));

// 白綠藍紫金紅
export const RARITIES = [
  { name: '普通', color: '#c9ced6', mult: 1, maxLv: 10 },
  { name: '優秀', color: '#5cc46b', mult: 1.5, maxLv: 20 },
  { name: '稀有', color: '#4a9df0', mult: 2.2, maxLv: 30 },
  { name: '史詩', color: '#a861e8', mult: 3.2, maxLv: 40 },
  { name: '傳說', color: '#f2b233', mult: 4.6, maxLv: 50 },
  { name: '神話', color: '#ef4b4b', mult: 6.5, maxLv: 60 },
];
export const MERGE_COUNT = 3; // 三合一

export const upgradeCost = (lv: number) => Math.floor(60 * Math.pow(lv, 1.35));

export interface Item { uid: number; tpl: string; rarity: number; level: number }

export function itemStats(it: Item): StatBlock {
  const t = TPL_MAP[it.tpl];
  const r = RARITIES[it.rarity];
  const lvMul = 1 + 0.1 * (it.level - 1);
  const out: StatBlock = {};
  if (t.base.atk) out.atk = Math.round(t.base.atk * r.mult * lvMul);
  if (t.base.hp) out.hp = Math.round(t.base.hp * r.mult * lvMul);
  if (t.base.aspd) out.aspd = t.base.aspd * r.mult;
  if (t.base.crit) out.crit = t.base.crit * r.mult;
  if (t.base.critDmg) out.critDmg = t.base.critDmg * r.mult;
  if (t.base.dmgReduce) out.dmgReduce = t.base.dmgReduce * r.mult;
  return out;
}

export function statLines(s: StatBlock): string[] {
  const out: string[] = [];
  if (s.atk) out.push(`攻擊 +${s.atk}`);
  if (s.hp) out.push(`生命 +${s.hp}`);
  if (s.aspd) out.push(`攻速 +${Math.round(s.aspd * 100)}%`);
  if (s.crit) out.push(`爆擊率 +${Math.round(s.crit * 100)}%`);
  if (s.critDmg) out.push(`爆傷 +${Math.round(s.critDmg * 100)}%`);
  if (s.dmgReduce) out.push(`減傷 +${Math.round(s.dmgReduce * 100)}%`);
  return out;
}
