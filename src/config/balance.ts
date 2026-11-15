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
  maxEnemies: 360,
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
export type WeaponId = 'katana' | 'drones' | 'shuriken' | 'field' | 'sakura';

export interface WeaponStats {
  damage: number;
  cooldown: number; // 秒
  area: number; // 倍率
  amount: number;
  bounce: number;
  speed: number;
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
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  katana: {
    id: 'katana',
    name: '高周波刀',
    desc: '自動朝最近的敵人扇形斬擊。',
    color: 0x3df5ff,
    base: { damage: 12, cooldown: 0.95, area: 1, amount: 1, bounce: 0, speed: 0 },
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
    base: { damage: 8, cooldown: 0.5, area: 1, amount: 1, bounce: 0, speed: 3.2 },
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
    base: { damage: 10, cooldown: 1.3, area: 1, amount: 1, bounce: 1, speed: 360 },
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
    base: { damage: 6, cooldown: 0.5, area: 1.1, amount: 1, bounce: 0, speed: 0 },
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
  sakura: {
    id: 'sakura',
    name: '千本櫻・斬',
    desc: '進化武器：高速迴旋，斬開四周的一切。',
    color: 0xff7ad9,
    base: { damage: 42, cooldown: 0.55, area: 1.6, amount: 1, bounce: 0, speed: 0 },
    levels: [],
    evolved: true,
  },
};

export const STARTER_WEAPON: WeaponId = 'katana';
export const WEAPON_POOL: WeaponId[] = ['katana', 'drones', 'shuriken', 'field'];

// ---------- 被動道具 ----------
export type PassiveId = 'might' | 'haste' | 'armor' | 'magnet';

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
};

export const PASSIVE_POOL: PassiveId[] = ['might', 'haste', 'armor', 'magnet'];

/** 進化配方：滿級武器 + 擁有被動道具 → 進化武器（從精英寶箱取得） */
export const EVOLUTIONS: { weapon: WeaponId; passive: PassiveId; result: WeaponId }[] = [
  { weapon: 'katana', passive: 'haste', result: 'sakura' },
];

// ---------- 敵人 ----------
export type EnemyKind = 'drone' | 'thug' | 'husk' | 'elite' | 'boss';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number;
  color: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  drone: { kind: 'drone', name: '維安無人機', hp: 6, speed: 80, damage: 6, radius: 9, xp: 1, color: 0xff3d81 },
  thug: { kind: 'thug', name: '改造幫派份子', hp: 16, speed: 56, damage: 9, radius: 12, xp: 2, color: 0xff8a3d },
  husk: { kind: 'husk', name: '殭屍化義體人', hp: 45, speed: 40, damage: 14, radius: 16, xp: 4, color: 0xb44dff },
  elite: { kind: 'elite', name: '企業執法者', hp: 320, speed: 50, damage: 18, radius: 24, xp: 25, color: 0xffc83d },
  boss: { kind: 'boss', name: '鬼面將軍', hp: 2400, speed: 54, damage: 25, radius: 40, xp: 120, color: 0xff2244 },
};

/** 一般敵人的血量隨時間成長 */
export function enemyHpMult(t: number): number {
  const m = t / 60;
  return 1 + m * 0.2 + m * m * 0.02;
}

export interface WaveSegment {
  from: number; // 秒
  rate: number; // 每秒生成數
  weights: Partial<Record<'drone' | 'thug' | 'husk', number>>;
}

export const WAVES: WaveSegment[] = [
  { from: 0, rate: 1.7, weights: { drone: 1 } },
  { from: 60, rate: 2, weights: { drone: 0.6, thug: 0.4 } },
  { from: 120, rate: 2.8, weights: { drone: 0.4, thug: 0.6 } },
  { from: 180, rate: 3.3, weights: { drone: 0.25, thug: 0.55, husk: 0.2 } },
  { from: 240, rate: 4, weights: { drone: 0.3, thug: 0.4, husk: 0.3 } },
  { from: 300, rate: 5, weights: { drone: 0.25, thug: 0.4, husk: 0.35 } },
  { from: 360, rate: 6, weights: { drone: 0.3, thug: 0.3, husk: 0.4 } },
  { from: 420, rate: 7, weights: { drone: 0.2, thug: 0.4, husk: 0.4 } },
  { from: 480, rate: 8.5, weights: { drone: 0.3, thug: 0.3, husk: 0.4 } },
  { from: 540, rate: 10, weights: { drone: 0.25, thug: 0.3, husk: 0.45 } },
  { from: 600, rate: 12, weights: { drone: 0.2, thug: 0.3, husk: 0.5 } },
];

/** 無人機群從四周包圍 */
export const SWARMS = [150, 330, 510];
export const ELITE_TIMES = [75, 165, 255, 345, 435, 525];
export const BOSS_SPAWNS = [
  { at: 180, hp: 1500, title: '鬼面將軍', final: false },
  { at: 360, hp: 4000, title: '鬼面將軍・改', final: false },
  { at: 570, hp: 9000, title: '鬼面將軍・極', final: true },
];

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

// ---------- 掉落 ----------
export const DROPS = {
  heal: 0.004,
  magnet: 0.003,
  credit: 0.02,
  healAmount: 30,
};
