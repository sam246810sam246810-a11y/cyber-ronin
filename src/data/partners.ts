// 動物夥伴：每隻有自己的自動武器、稀有度與陣營。數值以「隊伍攻擊 / 隊伍生命」為基準的倍率。
export type PartnerId =
  | 'shiba' | 'rabbit' | 'bear' | 'cat' | 'penguin' | 'turtle' | 'fox' | 'hamster' | 'octopus'
  | 'parrot' | 'panda' | 'dolphin' | 'unicorn' | 'dragon';
export type Weapon = 'star' | 'fire' | 'rapid' | 'slam' | 'chain' | 'frost' | 'heal'
  | 'boomerang' | 'ink' | 'homing' | 'kungfu' | 'wave' | 'rainbow' | 'breath';
export type Faction = 'forest' | 'ocean' | 'snow' | 'sky' | 'none';

export interface PartnerDef {
  id: PartnerId;
  name: string;
  icon: string;
  color: string;
  role: string;
  desc: string;
  rarity: number;   // 0 白 1 綠 2 藍 3 紫 4 金 5 紅（與裝備共用一套顏色）
  faction: Faction;
  hp: number;       // × 隊伍生命
  dmg: number;      // × 隊伍攻擊
  cd: number;       // 攻擊間隔（秒）
  range: number;
  weapon: Weapon;
  limited?: boolean; // 只在限時卡池出現
}

export const PARTNERS: Record<PartnerId, PartnerDef> = {
  shiba: { id: 'shiba', name: '柴犬隊長', icon: '🐶', color: '#ffcf8a', role: '隊長', desc: '發射星星彈；隊長倒下即失敗', rarity: -1, faction: 'none', hp: 1.4, dmg: 1.0, cd: 0.55, range: 420, weapon: 'star' },
  // 白・普通
  rabbit: { id: 'rabbit', name: '連射兔兔', icon: '🐰', color: '#f4d6e8', role: '輸出', desc: '高速連射紅蘿蔔', rarity: 0, faction: 'forest', hp: 0.7, dmg: 0.36, cd: 0.22, range: 360, weapon: 'rapid' },
  bear: { id: 'bear', name: '抱抱熊', icon: '🐻', color: '#b07a4f', role: '坦克', desc: '血量很厚，定期震地擊退周圍敵人', rarity: 0, faction: 'forest', hp: 2.3, dmg: 0.95, cd: 1.6, range: 85, weapon: 'slam' },
  // 綠・優秀
  cat: { id: 'cat', name: '火球貓咪', icon: '🐱', color: '#ffb36b', role: '輸出', desc: '丟出火球，範圍爆炸並燃燒', rarity: 1, faction: 'forest', hp: 0.8, dmg: 1.25, cd: 1.1, range: 380, weapon: 'fire' },
  penguin: { id: 'penguin', name: '雪球企鵝', icon: '🐧', color: '#6f8fae', role: '控場', desc: '丟雪球範圍傷害並減速', rarity: 1, faction: 'snow', hp: 1.0, dmg: 0.7, cd: 1.0, range: 340, weapon: 'frost' },
  turtle: { id: 'turtle', name: '迴旋龜龜', icon: '🐢', color: '#7cbf6a', role: '坦克', desc: '丟出會飛回來的龜殼，來回貫穿敵人', rarity: 1, faction: 'ocean', hp: 1.9, dmg: 0.8, cd: 1.5, range: 320, weapon: 'boomerang' },
  // 藍・稀有
  fox: { id: 'fox', name: '閃電狐狸', icon: '🦊', color: '#ff8a3d', role: '控場', desc: '閃電連鎖跳躍 3 個敵人', rarity: 2, faction: 'snow', hp: 0.85, dmg: 0.85, cd: 1.3, range: 330, weapon: 'chain' },
  hamster: { id: 'hamster', name: '護理倉鼠', icon: '🐹', color: '#f0c27b', role: '治療', desc: '定期治療血量最低的隊友', rarity: 2, faction: 'forest', hp: 0.9, dmg: 0.35, cd: 2.2, range: 300, weapon: 'heal' },
  octopus: { id: 'octopus', name: '墨汁章魚', icon: '🐙', color: '#c77dd6', role: '控場', desc: '扇形噴出 3 團墨汁，命中減速', rarity: 2, faction: 'ocean', hp: 0.9, dmg: 0.6, cd: 1.1, range: 320, weapon: 'ink' },
  // 紫・史詩
  parrot: { id: 'parrot', name: '追蹤鸚鵡', icon: '🦜', color: '#5fd38a', role: '輸出', desc: '射出 3 根會自動追蹤的羽毛', rarity: 3, faction: 'sky', hp: 0.9, dmg: 0.75, cd: 0.9, range: 420, weapon: 'homing' },
  panda: { id: 'panda', name: '功夫熊貓', icon: '🐼', color: '#e8e8e8', role: '坦克', desc: '快速連打周圍敵人，打中會暈眩', rarity: 3, faction: 'snow', hp: 2.2, dmg: 0.85, cd: 0.7, range: 75, weapon: 'kungfu' },
  // 金・傳說
  dolphin: { id: 'dolphin', name: '浪花海豚', icon: '🐬', color: '#4fb3ff', role: '輸出', desc: '掀起巨浪，貫穿一整排敵人', rarity: 4, faction: 'ocean', hp: 1.2, dmg: 2.2, cd: 2.0, range: 420, weapon: 'wave' },
  unicorn: { id: 'unicorn', name: '彩虹獨角獸', icon: '🦄', color: '#f6a8e8', role: '輸出', desc: '彩虹光束瞬間貫穿直線上所有敵人，並替隊伍回血', rarity: 4, faction: 'sky', hp: 1.2, dmg: 1.6, cd: 1.2, range: 440, weapon: 'rainbow' },
  // 紅・神話（限定）
  dragon: { id: 'dragon', name: '小火龍', icon: '🐉', color: '#ff5a4a', role: '輸出', desc: '持續噴出扇形火焰並燃燒敵人', rarity: 5, faction: 'sky', hp: 1.5, dmg: 0.9, cd: 0.3, range: 210, weapon: 'breath', limited: true },
};

/** 可以出現在冒險中的夥伴（不含隊長） */
export const RECRUITABLE: PartnerId[] = ['rabbit', 'bear', 'cat', 'penguin', 'turtle', 'fox', 'hamster', 'octopus', 'parrot', 'panda', 'dolphin', 'unicorn', 'dragon'];
export const ALL_PARTNERS: PartnerId[] = ['shiba', ...RECRUITABLE];
/** 新帳號預設擁有 */
export const STARTER_PARTNERS: PartnerId[] = ['rabbit', 'bear', 'penguin', 'turtle'];

export const MAX_FOLLOWERS = 6;
export const MAX_STAR = 5;

// 升星成長（局內）
export const starDmg = (lv: number) => 1 + 0.35 * (lv - 1);
export const starHp = (lv: number) => 1 + 0.25 * (lv - 1);

// ---- 夥伴永久等級（碎片養成）----
export const MAX_PLV = 10;
/** 從 lv 升到 lv+1 需要的碎片 */
export const shardCost = (lv: number) => [0, 10, 20, 35, 55, 80, 110, 150, 200, 260][lv] ?? 9999;
export const plvGold = (lv: number) => 250 * lv * lv;
/** 永久等級對傷害與生命的倍率；Lv5 覺醒Ⅰ、Lv10 覺醒Ⅱ 額外加成 */
export const plvMul = (lv: number) => (1 + 0.1 * (lv - 1)) * (lv >= 10 ? 1.2 : lv >= 5 ? 1.1 : 1);
export const awakenTier = (lv: number) => (lv >= 10 ? 2 : lv >= 5 ? 1 : 0);
export const AWAKEN_NAME = ['', '覺醒Ⅰ', '覺醒Ⅱ'];

// ---- 陣營羈絆 ----
export interface FactionDef { id: Faction; name: string; icon: string; color: string; tiers: [number, string][] }
export const FACTIONS: FactionDef[] = [
  { id: 'forest', name: '森林', icon: '🌳', color: '#4cc75a', tiers: [[2, '全隊生命 +15%'], [3, '全隊生命 +30%，每 5 秒回 3%']] },
  { id: 'ocean', name: '海洋', icon: '🌊', color: '#4a9df0', tiers: [[2, '攻擊速度 +12%'], [3, '攻擊速度 +25%']] },
  { id: 'snow', name: '雪地', icon: '❄️', color: '#9fd8ff', tiers: [[2, '敵人移動速度 -15%'], [3, '敵人變慢 -25%，爆擊率 +12%']] },
  { id: 'sky', name: '天空', icon: '☁️', color: '#c9a7ff', tiers: [[2, '撿取範圍 +50%、移動 +10%'], [3, '全隊攻擊 +20%']] },
];
export const FACTION_MAP = Object.fromEntries(FACTIONS.map((f) => [f.id, f])) as Record<Exclude<Faction, 'none'>, FactionDef>;
