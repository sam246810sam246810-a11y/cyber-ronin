// 所有遊戲數值集中在這裡，方便調整平衡。

export const PLAYER = {
  maxHp: 100,
  speed: 140,
  radius: 12,
  pickupRadius: 90,
  iframes: 0.45,
  armor: 0,
};

export const RUN = {
  duration: 600, // 10 分鐘
  maxEnemies: 240,
  /** 敵人放大到和角色一樣大之後：數量變少、單隻血量與經驗變多 */
  spawnScale: 0.65,
  gruntHpScale: 1.6,
  gruntXpScale: 1.5,
  revives: 1,
  rerolls: 2,
  banishes: 2,
  locks: 1,
  weaponSlots: 4,
  passiveSlots: 4,
  maxGems: 300,
};

/** 升到下一級需要的經驗 */
export function xpToNext(level: number): number {
  if (level < 20) return 5 + (level - 1) * 5;
  return 100 + (level - 20) * 10;
}

// ---------- 武器 ----------
export type WeaponId =
  | 'katana'
  | 'drones'
  | 'shuriken'
  | 'field'
  | 'laser'
  | 'virus'
  | 'orbital'
  | 'hook'
  | 'sakura'
  | 'crows'
  | 'fuma'
  | 'raijin';

export interface WeaponStats {
  damage: number;
  cooldown: number; // 秒
  area: number; // 倍率
  amount: number;
  bounce: number;
  speed: number;
  duration: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  desc: string;
  color: number;
  base: WeaponStats;
  /** 第 2～8 級的變化 */
  levels: { delta: Partial<WeaponStats>; desc: string }[];
  evolved?: boolean;
  /** 會受到「投射物 +1」角色特性影響 */
  projectile?: boolean;
}

const S = (s: Partial<WeaponStats>): WeaponStats => ({
  damage: 0,
  cooldown: 1,
  area: 1,
  amount: 1,
  bounce: 0,
  speed: 0,
  duration: 0,
  ...s,
});

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  katana: {
    id: 'katana',
    name: '高周波刀',
    desc: '自動朝最近的敵人扇形斬擊。',
    color: 0x3df5ff,
    base: S({ damage: 12, cooldown: 0.95 }),
    levels: [
      { delta: { damage: 5 }, desc: '傷害 +5' },
      { delta: { area: 0.15 }, desc: '範圍 +15%' },
      { delta: { amount: 1 }, desc: '同時向後方斬擊' },
      { delta: { damage: 6 }, desc: '傷害 +6' },
      { delta: { cooldown: -0.15 }, desc: '冷卻 -0.15 秒' },
      { delta: { area: 0.2 }, desc: '範圍 +20%' },
      { delta: { damage: 10 }, desc: '傷害 +10' },
    ],
  },
  drones: {
    id: 'drones',
    name: '苦無無人機',
    desc: '無人機環繞身邊，切割碰到的敵人。',
    color: 0x7dff6a,
    base: S({ damage: 8, cooldown: 0.5, speed: 3.2 }),
    levels: [
      { delta: { amount: 1 }, desc: '無人機 +1' },
      { delta: { damage: 4 }, desc: '傷害 +4' },
      { delta: { area: 0.2, speed: 0.6 }, desc: '環繞範圍 +20%、轉速提升' },
      { delta: { amount: 1 }, desc: '無人機 +1' },
      { delta: { damage: 6 }, desc: '傷害 +6' },
      { delta: { amount: 1 }, desc: '無人機 +1' },
      { delta: { damage: 8, area: 0.2 }, desc: '傷害 +8、範圍 +20%' },
    ],
  },
  shuriken: {
    id: 'shuriken',
    name: '電漿手裡劍',
    desc: '射向最近的敵人，命中後彈射到下一個目標。',
    color: 0xffe14d,
    base: S({ damage: 10, cooldown: 1.3, bounce: 1, speed: 360 }),
    projectile: true,
    levels: [
      { delta: { amount: 1 }, desc: '手裡劍 +1' },
      { delta: { damage: 5 }, desc: '傷害 +5' },
      { delta: { bounce: 2 }, desc: '彈射次數 +2' },
      { delta: { cooldown: -0.2 }, desc: '冷卻 -0.2 秒' },
      { delta: { amount: 1 }, desc: '手裡劍 +1' },
      { delta: { damage: 6, bounce: 1 }, desc: '傷害 +6、彈射 +1' },
      { delta: { amount: 1, damage: 5 }, desc: '手裡劍 +1、傷害 +5' },
    ],
  },
  field: {
    id: 'field',
    name: '電磁結界',
    desc: '身邊的電磁場持續傷害並減速敵人。',
    color: 0x6d7cff,
    base: S({ damage: 6, cooldown: 0.5, area: 1.1 }),
    levels: [
      { delta: { area: 0.2 }, desc: '範圍 +20%' },
      { delta: { damage: 3 }, desc: '傷害 +3' },
      { delta: { area: 0.2 }, desc: '範圍 +20%' },
      { delta: { damage: 3 }, desc: '傷害 +3' },
      { delta: { cooldown: -0.1 }, desc: '傷害頻率提升' },
      { delta: { area: 0.25 }, desc: '範圍 +25%' },
      { delta: { damage: 5 }, desc: '傷害 +5' },
    ],
  },
  laser: {
    id: 'laser',
    name: '雷射居合',
    desc: '朝敵人射出貫穿一切的雷射光刃。',
    color: 0xc8f6ff,
    base: S({ damage: 22, cooldown: 1.7, area: 1 }),
    projectile: true,
    levels: [
      { delta: { damage: 8 }, desc: '傷害 +8' },
      { delta: { amount: 1 }, desc: '光刃 +1' },
      { delta: { area: 0.3 }, desc: '長度與寬度 +30%' },
      { delta: { cooldown: -0.3 }, desc: '冷卻 -0.3 秒' },
      { delta: { amount: 1 }, desc: '光刃 +1' },
      { delta: { damage: 12 }, desc: '傷害 +12' },
      { delta: { amount: 1, area: 0.2 }, desc: '光刃 +1、範圍 +20%' },
    ],
  },
  virus: {
    id: 'virus',
    name: '駭入病毒',
    desc: '感染敵人持續造成傷害；感染者死亡時擴散給附近敵人。',
    color: 0x5dff7a,
    base: S({ damage: 7, cooldown: 2.4, amount: 1, duration: 3, bounce: 2 }),
    projectile: true,
    levels: [
      { delta: { amount: 1 }, desc: '一次感染 +1 個敵人' },
      { delta: { damage: 4 }, desc: '每秒傷害 +4' },
      { delta: { bounce: 1 }, desc: '擴散數量 +1' },
      { delta: { amount: 1, duration: 1 }, desc: '感染 +1、持續 +1 秒' },
      { delta: { damage: 5 }, desc: '每秒傷害 +5' },
      { delta: { cooldown: -0.6 }, desc: '冷卻 -0.6 秒' },
      { delta: { amount: 2, damage: 6 }, desc: '感染 +2、每秒傷害 +6' },
    ],
  },
  orbital: {
    id: 'orbital',
    name: '軌道打擊',
    desc: '衛星鎖定畫面上的敵人，從天而降轟炸。',
    color: 0xff4d5e,
    base: S({ damage: 34, cooldown: 2.6, area: 1, amount: 1 }),
    projectile: true,
    levels: [
      { delta: { amount: 1 }, desc: '轟炸 +1' },
      { delta: { damage: 12 }, desc: '傷害 +12' },
      { delta: { area: 0.25 }, desc: '爆炸範圍 +25%' },
      { delta: { amount: 1 }, desc: '轟炸 +1' },
      { delta: { cooldown: -0.5 }, desc: '冷卻 -0.5 秒' },
      { delta: { amount: 1, damage: 10 }, desc: '轟炸 +1、傷害 +10' },
      { delta: { area: 0.25, damage: 15 }, desc: '範圍 +25%、傷害 +15' },
    ],
  },
  hook: {
    id: 'hook',
    name: '鎖鏈鉤爪',
    desc: '射出鉤爪，把敵人連同周圍的雜兵拉到面前。',
    color: 0xb8c4d8,
    base: S({ damage: 16, cooldown: 1.9, area: 1, amount: 1, speed: 520 }),
    projectile: true,
    levels: [
      { delta: { damage: 6 }, desc: '傷害 +6' },
      { delta: { amount: 1 }, desc: '鉤爪 +1' },
      { delta: { area: 0.3 }, desc: '拉扯範圍 +30%' },
      { delta: { damage: 8 }, desc: '傷害 +8' },
      { delta: { cooldown: -0.4 }, desc: '冷卻 -0.4 秒' },
      { delta: { amount: 1 }, desc: '鉤爪 +1' },
      { delta: { damage: 12, area: 0.2 }, desc: '傷害 +12、範圍 +20%' },
    ],
  },
  sakura: {
    id: 'sakura',
    name: '千本櫻・斬',
    desc: '進化武器：高速迴旋，斬開四周的一切。',
    color: 0xff7ad9,
    base: S({ damage: 42, cooldown: 0.55, area: 1.6 }),
    levels: [],
    evolved: true,
  },
  crows: {
    id: 'crows',
    name: '夜鴉群',
    desc: '進化武器：六架鴉型無人機忽遠忽近地盤旋獵殺。',
    color: 0x5dff7a,
    base: S({ damage: 28, cooldown: 0.35, area: 1.5, amount: 6, speed: 4.4 }),
    levels: [],
    evolved: true,
  },
  fuma: {
    id: 'fuma',
    name: '風魔大手裡劍',
    desc: '進化武器：巨大手裡劍貫穿敵陣後飛回手中。',
    color: 0xffd23d,
    base: S({ damage: 36, cooldown: 1.1, amount: 3, speed: 420, area: 1 }),
    levels: [],
    evolved: true,
    projectile: true,
  },
  raijin: {
    id: 'raijin',
    name: '雷神結界',
    desc: '進化武器：巨大結界，並不斷降下落雷。',
    color: 0x7fa8ff,
    base: S({ damage: 16, cooldown: 0.4, area: 1.9, amount: 4, duration: 1.3 }),
    levels: [],
    evolved: true,
  },
};

export const WEAPON_POOL: WeaponId[] = ['katana', 'drones', 'shuriken', 'field', 'laser', 'virus', 'orbital', 'hook'];

// ---------- 被動道具 ----------
export type PassiveId = 'might' | 'haste' | 'armor' | 'magnet' | 'camo' | 'nano' | 'overclock' | 'intent';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  desc: string; // 每級效果
  color: number;
  maxLevel: number;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  might: { id: 'might', name: '義體強化', desc: '攻擊力 +10%', color: 0xff5a5a, maxLevel: 5 },
  haste: { id: 'haste', name: '神經加速器', desc: '武器冷卻 -7%', color: 0x3dffc5, maxLevel: 5 },
  armor: { id: 'armor', name: '反應裝甲', desc: '受到的傷害 -1，最大生命 +10', color: 0xa0a8c0, maxLevel: 5 },
  magnet: { id: 'magnet', name: '磁力模組', desc: '拾取範圍 +30%', color: 0x4da6ff, maxLevel: 5 },
  camo: { id: 'camo', name: '光學迷彩', desc: '移動速度 +8%', color: 0xb48cff, maxLevel: 5 },
  nano: { id: 'nano', name: '奈米修復', desc: '每秒回復 0.4 生命', color: 0x5dff7a, maxLevel: 5 },
  overclock: { id: 'overclock', name: '超頻核心', desc: '武器範圍 +10%', color: 0xff9a3d, maxLevel: 5 },
  intent: { id: 'intent', name: '殺意晶片', desc: '殺意累積 +15%', color: 0xff3d81, maxLevel: 5 },
};

export const PASSIVE_POOL: PassiveId[] = ['might', 'haste', 'armor', 'magnet', 'camo', 'nano', 'overclock', 'intent'];

/** 進化配方：滿級武器 + 擁有被動道具 → 進化武器（從精英寶箱取得） */
export const EVOLUTIONS: { weapon: WeaponId; passive: PassiveId; result: WeaponId }[] = [
  { weapon: 'katana', passive: 'haste', result: 'sakura' },
  { weapon: 'drones', passive: 'camo', result: 'crows' },
  { weapon: 'shuriken', passive: 'overclock', result: 'fuma' },
  { weapon: 'field', passive: 'armor', result: 'raijin' },
];

// ---------- 角色 ----------
export type CharId = 'jin' | 'zero' | 'tetsu';

export interface CharDef {
  id: CharId;
  name: string;
  role: string;
  trait: string;
  weapon: WeaponId;
  maxHp: number;
  speedMult: number;
  armor: number;
  intentMult: number;
  extraAmount: number;
  cost: number; // 用信用點解鎖（0 = 預設角色）
}

export const CHARACTERS: Record<CharId, CharDef> = {
  jin: {
    id: 'jin',
    name: '浪人・刃',
    role: '平衡型',
    trait: '殺意累積 +20%',
    weapon: 'katana',
    maxHp: 100,
    speedMult: 1,
    armor: 0,
    intentMult: 1.2,
    extraAmount: 0,
    cost: 0,
  },
  zero: {
    id: 'zero',
    name: '駭客・零',
    role: '遠程控制型',
    trait: '投射物 +1、最大生命 80',
    weapon: 'shuriken',
    maxHp: 80,
    speedMult: 1.05,
    armor: 0,
    intentMult: 1,
    extraAmount: 1,
    cost: 300,
  },
  tetsu: {
    id: 'tetsu',
    name: '重裝・鐵',
    role: '坦克型',
    trait: '護甲 +3、最大生命 130、移動較慢',
    weapon: 'field',
    maxHp: 130,
    speedMult: 0.88,
    armor: 3,
    intentMult: 1,
    extraAmount: 0,
    cost: 500,
  },
};

export const CHAR_ORDER: CharId[] = ['jin', 'zero', 'tetsu'];

// ---------- 局外強化 ----------
export type UpgradeId = 'might' | 'hp' | 'speed' | 'pickup' | 'growth' | 'reroll' | 'banish' | 'lock';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  icon: string;
  maxLevel: number;
  baseCost: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'might', name: '強化攻擊', desc: '攻擊力 +5%', icon: 'icon-might', maxLevel: 5, baseCost: 60 },
  { id: 'hp', name: '強化生命', desc: '最大生命 +10', icon: 'icon-armor', maxLevel: 5, baseCost: 50 },
  { id: 'speed', name: '強化移動', desc: '移動速度 +3%', icon: 'icon-camo', maxLevel: 5, baseCost: 60 },
  { id: 'pickup', name: '強化磁力', desc: '拾取範圍 +10%', icon: 'icon-magnet', maxLevel: 5, baseCost: 40 },
  { id: 'growth', name: '學習晶片', desc: '經驗獲取 +5%', icon: 'icon-haste', maxLevel: 5, baseCost: 80 },
  { id: 'reroll', name: '重抽次數', desc: '每局重抽 +1', icon: 'icon-overclock', maxLevel: 3, baseCost: 100 },
  { id: 'banish', name: '放逐次數', desc: '每局放逐 +1', icon: 'icon-virus', maxLevel: 3, baseCost: 100 },
  { id: 'lock', name: '鎖定次數', desc: '每局鎖定 +1', icon: 'icon-intent', maxLevel: 2, baseCost: 120 },
];

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.baseCost * (1 + level * 0.8));
}

// ---------- 解鎖條件（成就） ----------
export interface UnlockStats {
  totalKills: number;
  bossKills: number;
  bestTime: number;
  bestLevel: number;
  runs: number;
  iaiTotal: number;
}

export interface UnlockDef {
  kind: 'weapon' | 'passive';
  id: WeaponId | PassiveId;
  hint: string;
  check: (s: UnlockStats) => boolean;
}

export const UNLOCKS: UnlockDef[] = [
  { kind: 'weapon', id: 'laser', hint: '累計擊殺 1000 個敵人', check: (s) => s.totalKills >= 1000 },
  { kind: 'weapon', id: 'virus', hint: '擊敗任一隻 Boss', check: (s) => s.bossKills >= 1 },
  { kind: 'weapon', id: 'orbital', hint: '單局存活 8 分鐘', check: (s) => s.bestTime >= 480 },
  { kind: 'weapon', id: 'hook', hint: '單局達到 Lv 25', check: (s) => s.bestLevel >= 25 },
  { kind: 'passive', id: 'nano', hint: '累計遊玩 3 局', check: (s) => s.runs >= 3 },
  { kind: 'passive', id: 'intent', hint: '累計發動居合・一閃 15 次', check: (s) => s.iaiTotal >= 15 },
];

// ---------- 敵人 ----------
export type EnemyKind = 'drone' | 'thug' | 'husk' | 'gunner' | 'elite' | 'boss';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  desc: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  color: number;
  tex: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  drone: { kind: 'drone', name: '維安無人機', desc: '企業的巡邏無人機，數量多、速度快。', hp: 6, speed: 80, damage: 6, radius: 15, xp: 1, color: 0xff3d81, tex: 'enemy-drone' },
  thug: { kind: 'thug', name: '改造幫派份子', desc: '裝了廉價義肢的街頭混混。', hp: 16, speed: 56, damage: 9, radius: 22, xp: 2, color: 0xff8a3d, tex: 'enemy-thug' },
  husk: { kind: 'husk', name: '殭屍化義體人', desc: '被病毒侵蝕神經的義體人，耐打又沉重。', hp: 45, speed: 40, damage: 14, radius: 25, xp: 4, color: 0xb44dff, tex: 'enemy-husk' },
  gunner: { kind: 'gunner', name: '企業槍兵', desc: '保持距離，用電漿步槍遠程射擊。', hp: 24, speed: 52, damage: 7, radius: 22, xp: 3, color: 0x9dff3d, tex: 'enemy-gunner' },
  elite: { kind: 'elite', name: '企業執法者', desc: '重裝精英，擊倒後掉落寶箱。', hp: 320, speed: 50, damage: 18, radius: 36, xp: 25, color: 0xffc83d, tex: 'enemy-elite' },
  boss: { kind: 'boss', name: '鬼面將軍', desc: '', hp: 1500, speed: 54, damage: 25, radius: 70, xp: 120, color: 0xff2244, tex: 'boss-oni' },
};

export type BossVariant = 'oni' | 'spider' | 'apex';

export interface BossDef {
  variant: BossVariant;
  at: number;
  hp: number;
  title: string;
  desc: string;
  tex: string;
  radius: number;
  speed: number;
  final: boolean;
}

export const BOSSES: BossDef[] = [
  { variant: 'oni', at: 180, hp: 1200, title: '鬼面將軍', desc: '企業的私兵統帥。會蓄力衝刺，並放出環狀彈幕。', tex: 'boss-oni', radius: 70, speed: 54, final: false },
  { variant: 'spider', at: 360, hp: 4000, title: '絡新婦', desc: '蜘蛛型戰鬥機甲。召喚無人機，並噴出旋轉彈幕。', tex: 'boss-spider', radius: 74, speed: 46, final: false },
  { variant: 'apex', at: 570, hp: 9000, title: '鬼面將軍・極', desc: '重生的鬼面將軍。衝刺、環狀與旋轉彈幕全部用上。', tex: 'boss-apex', radius: 78, speed: 62, final: true },
];

/** 一般敵人的血量隨時間成長 */
export function enemyHpMult(t: number): number {
  const m = t / 60;
  return 1 + m * 0.2 + m * m * 0.02;
}

type Grunt = 'drone' | 'thug' | 'husk' | 'gunner';

export interface WaveSegment {
  from: number; // 秒
  rate: number; // 每秒生成數
  weights: Partial<Record<Grunt, number>>;
}

export const WAVES: WaveSegment[] = [
  { from: 0, rate: 1.7, weights: { drone: 1 } },
  { from: 60, rate: 2, weights: { drone: 0.6, thug: 0.4 } },
  { from: 120, rate: 2.8, weights: { drone: 0.35, thug: 0.5, gunner: 0.1 } },
  { from: 180, rate: 3.3, weights: { drone: 0.2, thug: 0.45, husk: 0.2, gunner: 0.1 } },
  { from: 240, rate: 4, weights: { drone: 0.25, thug: 0.35, husk: 0.25, gunner: 0.1 } },
  { from: 300, rate: 5, weights: { drone: 0.2, thug: 0.35, husk: 0.3, gunner: 0.1 } },
  { from: 360, rate: 6, weights: { drone: 0.3, thug: 0.25, husk: 0.3, gunner: 0.1 } },
  { from: 420, rate: 7, weights: { drone: 0.2, thug: 0.3, husk: 0.35, gunner: 0.1 } },
  { from: 480, rate: 8.5, weights: { drone: 0.25, thug: 0.25, husk: 0.35, gunner: 0.1 } },
  { from: 540, rate: 10, weights: { drone: 0.2, thug: 0.25, husk: 0.4, gunner: 0.1 } },
  { from: 600, rate: 12, weights: { drone: 0.2, thug: 0.25, husk: 0.4, gunner: 0.1 } },
];

/** 無人機群從四周包圍 */
export const SWARMS = [150, 330, 510];
export const ELITE_TIMES = [75, 165, 255, 345, 435, 525];

// ---------- 殺意與居合・一閃 ----------
export const INTENT = {
  baseThreshold: 60,
  growth: 0.5, // 每發動一次，門檻增加 50%
  maxThreshold: 400,
  decayDelay: 3, // 秒內沒有擊殺就開始下降
  decayPerSec: 4,
  eliteBonus: 10,
  freeze: 0.4, // 發動時畫面停頓秒數
  bossDamagePct: 0.08,
  eliteDamagePct: 0.35,
};

// ---------- 掉落與結算 ----------
export const DROPS = {
  heal: 0.004,
  magnet: 0.003,
  credit: 0.02,
  healAmount: 30,
};

/** 結算時額外給的信用點 */
export function runReward(r: { time: number; kills: number; bossKills: number; victory: boolean }): number {
  return Math.floor(r.time / 6 + r.kills / 20 + r.bossKills * 25 + (r.victory ? 100 : 0));
}
