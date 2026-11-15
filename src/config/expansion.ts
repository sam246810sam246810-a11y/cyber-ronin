// M2.5 第一期：稀有度、遺物、羈絆、精英詞綴、黑市與事件、通緝等級。
import type { WeaponId } from './balance';

// ---------- A1 升級卡稀有度 ----------
export type Rarity = 0 | 1 | 2 | 3;

export const RARITY = [
  { name: '普通', color: 0xc9c6e0, css: '#c9c6e0', mult: 1, weight: 70, dmgBonus: 0 },
  { name: '稀有', color: 0x4da6ff, css: '#4da6ff', mult: 1.5, weight: 22, dmgBonus: 0.08 },
  { name: '史詩', color: 0xb46bff, css: '#c48bff', mult: 2.2, weight: 7, dmgBonus: 0.18 },
  { name: '傳說', color: 0xffc83d, css: '#ffd84d', mult: 3, weight: 1, dmgBonus: 0.3 },
] as const;

/** 依幸運值抽稀有度：幸運越高，稀有以上的權重越高 */
export function rollRarity(luck: number, min: Rarity = 0): Rarity {
  const w = [Math.max(10, 70 - luck * 4), 22 + luck * 2, 7 + luck * 1.2, 1 + luck * 0.6];
  for (let i = 0; i < min; i++) w[i] = 0;
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < 4; i++) {
    r -= w[i];
    if (r <= 0) return i as Rarity;
  }
  return 0;
}

// ---------- A2 遺物與詛咒 ----------
export type RelicId =
  | 'thunder'
  | 'leech'
  | 'legs'
  | 'magstorm'
  | 'battery'
  | 'heart'
  | 'scope'
  | 'executioner'
  | 'soul'
  | 'mirror'
  | 'coin'
  | 'goldhack'
  | 'xpmod'
  | 'warhead'
  | 'finaliai'
  | 'blood'
  | 'bounty'
  | 'glass'
  | 'berserk'
  | 'devil';

export interface RelicDef {
  id: RelicId;
  name: string;
  desc: string;
  curse: boolean;
}

export const RELICS: RelicDef[] = [
  { id: 'thunder', name: '雷鳴發電機', desc: '暴擊時，對附近 2 個敵人放電（50% 傷害）', curse: false },
  { id: 'leech', name: '吸能晶片', desc: '每擊殺 30 個敵人，回復 5 生命', curse: false },
  { id: 'legs', name: '加速義足', desc: '移動速度 +15%', curse: false },
  { id: 'magstorm', name: '磁暴線圈', desc: '拾取範圍 +50%', curse: false },
  { id: 'battery', name: '過載電池', desc: '武器冷卻 -12%', curse: false },
  { id: 'heart', name: '鋼鐵心臟', desc: '最大生命 +40', curse: false },
  { id: 'scope', name: '狙擊鏡', desc: '暴擊率 +10%', curse: false },
  { id: 'executioner', name: '處刑刀', desc: '對生命低於 30% 的敵人傷害 ×2', curse: false },
  { id: 'soul', name: '武士之魂', desc: '殺意累積 +40%', curse: false },
  { id: 'mirror', name: '鏡像護盾', desc: '每 15 秒抵擋一次傷害', curse: false },
  { id: 'coin', name: '招財貓幣', desc: '幸運 +3（更容易出現高稀有度卡）', curse: false },
  { id: 'goldhack', name: '黃金駭客鑰', desc: '信用點掉落 ×2', curse: false },
  { id: 'xpmod', name: '經驗模組', desc: '經驗獲取 +25%', curse: false },
  { id: 'warhead', name: '爆裂彈頭', desc: '擊殺敵人時 12% 機率爆炸，傷害周圍敵人', curse: false },
  { id: 'finaliai', name: '終焉居合', desc: '一閃對 Boss 傷害 ×2，發動後 3 秒無敵', curse: false },
  { id: 'blood', name: '血之契約', desc: '詛咒：最大生命 -50%，攻擊力 +60%', curse: true },
  { id: 'bounty', name: '懸賞令', desc: '詛咒：敵人數量 +50%，經驗與信用點 +50%', curse: true },
  { id: 'glass', name: '玻璃大砲', desc: '詛咒：受到傷害 ×2，暴擊傷害 +100%', curse: true },
  { id: 'berserk', name: '狂戰士之盔', desc: '詛咒：完全無法回血，武器冷卻 -25%', curse: true },
  { id: 'devil', name: '惡魔交易', desc: '詛咒：立刻升 3 級，之後經驗獲取 -30%', curse: true },
];

export const MAX_RELICS = 6;

// ---------- A3 羈絆 ----------
export type Tag = 'blade' | 'volt' | 'hack' | 'fire';

export const TAGS: Record<Tag, { name: string; color: number; css: string; tiers: { n: number; desc: string }[] }> = {
  blade: {
    name: '刃',
    color: 0x3df5ff,
    css: '#3df5ff',
    tiers: [
      { n: 2, desc: '暴擊率 +8%' },
      { n: 3, desc: '刃系武器傷害 +25%、暴擊傷害 +50%' },
    ],
  },
  volt: {
    name: '電',
    color: 0x7fa8ff,
    css: '#9fbcff',
    tiers: [
      { n: 2, desc: '命中時 15% 機率麻痺敵人 0.8 秒' },
      { n: 3, desc: '麻痺機率提高到 25%，電系武器傷害 +20%' },
    ],
  },
  hack: {
    name: '駭',
    color: 0x5dff7a,
    css: '#7dff8a',
    tiers: [
      { n: 2, desc: '擊殺時 15% 機率多掉一顆經驗晶片' },
      { n: 3, desc: '受到駭系武器攻擊的敵人，承受傷害 +15%' },
    ],
  },
  fire: {
    name: '炎',
    color: 0xff6a3d,
    css: '#ff8a5d',
    tiers: [
      { n: 2, desc: '爆炸範圍 +25%' },
      { n: 3, desc: '爆炸傷害 +30%' },
    ],
  },
};

export const WEAPON_TAG: Partial<Record<WeaponId, Tag>> = {
  katana: 'blade',
  sakura: 'blade',
  laser: 'blade',
  hook: 'blade',
  field: 'volt',
  raijin: 'volt',
  drones: 'volt',
  crows: 'volt',
  virus: 'hack',
  shuriken: 'hack',
  fuma: 'hack',
  orbital: 'fire',
  shadow: 'blade',
  railgun: 'volt',
  talisman: 'hack',
};

// ---------- A4 精英詞綴 ----------
export type Affix = 'explode' | 'shield' | 'split' | 'frenzy' | 'summon';

export const AFFIXES: Record<Affix, { name: string; css: string }> = {
  explode: { name: '爆裂', css: '#ff8a3d' },
  shield: { name: '護盾', css: '#7fd4ff' },
  split: { name: '分裂', css: '#c48bff' },
  frenzy: { name: '狂暴', css: '#ff4d6a' },
  summon: { name: '召喚', css: '#7dff8a' },
};

// ---------- A5 黑市與事件 ----------
export const MERCHANT_TIMES = [120, 300, 480];
export const EVENT_TIMES = [200, 390];

export interface ShopItem {
  id: 'relic' | 'heal' | 'card' | 'reroll';
  name: string;
  desc: string;
  cost: number;
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'relic', name: '可疑的遺物', desc: '從三個遺物中選一個', cost: 60 },
  { id: 'heal', name: '黑市修復針', desc: '回復 50% 生命', cost: 25 },
  { id: 'card', name: '強化晶片', desc: '一次升級（必定稀有以上）', cost: 40 },
  { id: 'reroll', name: '重抽權杖', desc: '重抽次數 +1', cost: 20 },
];

// ---------- C2 通緝等級 ----------
export const WANTED_RULES: string[] = [
  '敵人血量 +20%',
  '精英出現次數加倍',
  '敵人移動速度 +10%',
  '敵人血量再 +20%',
  '回復效果減半',
  'Boss 血量 +30%',
  '敵人傷害 +25%',
  '精英必定帶 2 個詞綴',
  '敵人生成數量 +30%',
  'Boss 血量再 +30%，最終 Boss 出招更快',
];

export const MAX_WANTED = WANTED_RULES.length;

export interface WantedMods {
  hp: number;
  eliteDouble: boolean;
  speed: number;
  heal: number;
  bossHp: number;
  dmg: number;
  twoAffixes: boolean;
  spawn: number;
  fastFinal: boolean;
  reward: number;
}

export function wantedMods(level: number): WantedMods {
  return {
    hp: 1 + (level >= 1 ? 0.2 : 0) + (level >= 4 ? 0.2 : 0),
    eliteDouble: level >= 2,
    speed: level >= 3 ? 1.1 : 1,
    heal: level >= 5 ? 0.5 : 1,
    bossHp: 1 + (level >= 6 ? 0.3 : 0) + (level >= 10 ? 0.3 : 0),
    dmg: level >= 7 ? 1.25 : 1,
    twoAffixes: level >= 8,
    spawn: level >= 9 ? 1.3 : 1,
    fastFinal: level >= 10,
    reward: 1 + 0.2 * level,
  };
}

// ---------- D1 打擊感 ----------
export const CRIT = { base: 0.05, mult: 2 };

// ---------- 角色專屬大招 ----------
export interface UltimateDef {
  name: string;
  gauge: string;
  color: number;
  css: string;
  finisher: 'slash' | 'code' | 'thunder' | 'clone' | 'orbital' | 'hyakki';
  /** SSR：金色特寫外框 */
  ssr?: boolean;
}

export const ULTIMATES: Record<'jin' | 'zero' | 'tetsu' | 'oboro' | 'hayabusa' | 'kagura', UltimateDef> = {
  jin: { name: '居合・一閃', gauge: '殺意', color: 0xff3d81, css: '#ff3d81', finisher: 'slash' },
  zero: { name: '系統崩潰', gauge: '駭入', color: 0x2bd96b, css: '#5dff7a', finisher: 'code' },
  tetsu: { name: '雷神降臨', gauge: '電荷', color: 0x6d7cff, css: '#9fbcff', finisher: 'thunder' },
  oboro: { name: '分身亂舞', gauge: '殘影', color: 0x8a5cff, css: '#c48bff', finisher: 'clone' },
  hayabusa: { name: '衛星狙擊', gauge: '鎖定', color: 0xff8a3d, css: '#ffb06a', finisher: 'orbital' },
  kagura: { name: '百鬼夜行', gauge: '靈力', color: 0xff4fa0, css: '#ffd84d', finisher: 'hyakki', ssr: true },
};

/** 大招演出（特寫切入＋收尾特效）總長，遊戲在這段時間停住 */
export const ULT_FREEZE = 1.0;
