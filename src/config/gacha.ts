// 三池扭蛋：裝備池（義體模組）、角色池、靈物池（式神）。
import type { CharId } from './balance';
import type { StatKey } from './meta';

export type PoolId = 'equip' | 'char' | 'spirit';

export interface PoolDef {
  id: PoolId;
  name: string;
  ticket: string;
  color: number;
  css: string;
  single: number;
  ten: number;
  /** N、R、SR、SSR 的機率 */
  rates: [number, number, number, number];
  pity: number;
}

export const POOLS: Record<PoolId, PoolDef> = {
  equip: { id: 'equip', name: '義體池', ticket: '義體券', color: 0x3df5ff, css: '#3df5ff', single: 100, ten: 900, rates: [0.6, 0.3, 0.085, 0.015], pity: 50 },
  char: { id: 'char', name: '角色池', ticket: '浪人券', color: 0xff3d81, css: '#ff6a9a', single: 150, ten: 1350, rates: [0.55, 0.3, 0.12, 0.03], pity: 70 },
  spirit: { id: 'spirit', name: '靈物池', ticket: '靈符', color: 0xffc83d, css: '#ffd84d', single: 100, ten: 900, rates: [0.5, 0.35, 0.12, 0.03], pity: 60 },
};

export const POOL_ORDER: PoolId[] = ['equip', 'char', 'spirit'];

// ---------- 角色池 ----------
/** 角色的稀有度：角色最低就是 SR，N／R 只會抽到角色碎片 */
export const CHAR_RARITY: Record<CharId, 2 | 3> = { jin: 2, zero: 2, tetsu: 2, oboro: 2, hayabusa: 2, kagura: 3 };
/** 一開始就擁有的角色（其他角色都要從角色池取得） */
export const STARTER: CharId = 'jin';
/** 用碎片直接解鎖角色需要的數量 */
export const UNLOCK_SHARDS = { 2: 40, 3: 100 } as const;
/** 已擁有的角色再抽到時換成的碎片數 */
export const DUP_SHARDS = { 2: 25, 3: 60 } as const;
/** 從 n 星升到 n+1 星需要的碎片（1→2、2→3、3→4、4→5） */
export const STAR_COST = [0, 10, 20, 40, 80];
export const MAX_STAR = 5;
export const CHAR_POOL = {
  /** N：隨機一名角色的碎片 */
  nShards: 2,
  /** R：隨機一名角色的碎片 */
  rShards: 6,
  /** SSR：萬能碎片（第三期加入 SSR 角色前的替代） */
  ssrShards: 40,
};

/** 每顆星的能力加成：2 星起每星攻擊 +4%、生命 +8；3 星大招能量 +20%；5 星大招對 Boss 傷害 +50% */
export function starStats(star: number): Partial<Record<StatKey, number>> {
  const extra = Math.max(0, star - 1);
  const st: Partial<Record<StatKey, number>> = { might: 0.04 * extra, maxHp: 8 * extra };
  if (star >= 3) st.intent = 0.2;
  return st;
}

export const STAR_PERKS = ['擁有角色', '攻擊 +4%、生命 +8', '大招能量累積 +20%', '攻擊 +4%、生命 +8', '大招對 Boss 傷害 +50%'];

// ---------- 靈物池（式神） ----------
export type SpiritId = 'fox' | 'turtle' | 'kappa' | 'crane' | 'baku' | 'cat' | 'raiju' | 'tengu' | 'snake' | 'oni' | 'kyubi' | 'dragon';

export interface SpiritDef {
  id: SpiritId;
  name: string;
  rarity: 1 | 2 | 3;
  stat: StatKey;
  /** 每一級的加成 */
  per: number;
}

export const SPIRITS: SpiritDef[] = [
  { id: 'fox', name: '狐火', rarity: 1, stat: 'might', per: 0.015 },
  { id: 'turtle', name: '鐵甲龜', rarity: 1, stat: 'maxHp', per: 4 },
  { id: 'kappa', name: '河童', rarity: 1, stat: 'regen', per: 0.04 },
  { id: 'crane', name: '靈鶴', rarity: 1, stat: 'pickup', per: 0.04 },
  { id: 'baku', name: '夢貘', rarity: 1, stat: 'xp', per: 0.025 },
  { id: 'cat', name: '招財貓', rarity: 1, stat: 'luck', per: 0.25 },
  { id: 'raiju', name: '雷獸', rarity: 2, stat: 'volt', per: 0.04 },
  { id: 'tengu', name: '鴉天狗', rarity: 2, stat: 'speed', per: 0.015 },
  { id: 'snake', name: '翠蛇', rarity: 2, stat: 'cdr', per: 0.012 },
  { id: 'oni', name: '鬼面', rarity: 2, stat: 'critDmg', per: 0.06 },
  { id: 'kyubi', name: '九尾', rarity: 3, stat: 'crit', per: 0.012 },
  { id: 'dragon', name: '龍神', rarity: 3, stat: 'might', per: 0.03 },
];

export const MAX_SPIRIT_LV = 10;

/** 由收集到的份數算等級：1、3、6、10…（第 n 級需要累積 n(n+1)/2 份） */
export function spiritLevel(copies: number): number {
  let lv = 0;
  while (lv < MAX_SPIRIT_LV && ((lv + 1) * (lv + 2)) / 2 <= copies) lv++;
  return lv;
}

/** 升到下一級還需要幾份 */
export function spiritNeed(copies: number): number {
  const lv = spiritLevel(copies);
  if (lv >= MAX_SPIRIT_LV) return 0;
  return ((lv + 1) * (lv + 2)) / 2 - copies;
}

export interface SpiritSet {
  name: string;
  members: SpiritId[];
  bonus: Partial<Record<StatKey, number>>;
  desc: string;
}

export const SPIRIT_SETS: SpiritSet[] = [
  { name: '百鬼夜行', members: ['fox', 'kappa', 'tengu', 'oni'], bonus: { might: 0.05 }, desc: '攻擊力 +5%' },
  { name: '吉祥四寶', members: ['turtle', 'crane', 'baku', 'cat'], bonus: { maxHp: 20, luck: 1 }, desc: '最大生命 +20、幸運 +1' },
  { name: '天之眷屬', members: ['raiju', 'snake', 'kyubi', 'dragon'], bonus: { crit: 0.05, cdr: 0.05 }, desc: '暴擊率 +5%、武器冷卻 -5%' },
];
