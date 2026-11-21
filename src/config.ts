/** 全域常數。數值調整請優先改這裡或 data/*.json。 */
export const GAME_W = 720;
export const GAME_H = 1280;

/** 戰鬥區（上方約 68%） */
export const ARENA = { x: 24, y: 96, w: 672, h: 760 } as const;
export const ARENA_RIGHT = ARENA.x + ARENA.w;
export const ARENA_BOTTOM = ARENA.y + ARENA.h;

/** 坩堝列與操作區 */
export const BAR_Y = 868;
export const BAR_H = 116;
export const CONTROLS_Y = BAR_Y + BAR_H;

export const DEPTH = {
  floor: 0,
  zone: 5,
  telegraph: 8,
  pickup: 10,
  shadow: 15,
  enemy: 20,
  player: 30,
  projectile: 40,
  fx: 50,
  ui: 100,
  overlay: 200,
} as const;

export const PLAYER = {
  hp: 5,
  radius: 20,
  speed: 220,
  dashDistance: 160,
  dashTime: 0.15,
  dashIframes: 0.25,
  dashCooldown: 1.2,
  hurtIframes: 0.6,
  fireInterval: 0.5,
  bulletDamage: 1,
  bulletSpeed: 700,
  bulletRadius: 7,
  autoAimRange: 520,
  pickupRadius: 48,
} as const;

export const DROP = {
  chance: 0.4,
  lifetime: 12,
  blinkAt: 3,
} as const;

/** 稀有度：素材、藥水、突變卡、角色共用 */
export const RARITY = [
  { id: 'common', name: '普通', color: '#c9c9c9', mult: 1 },
  { id: 'rare', name: '稀有', color: '#4da3ff', mult: 1.5 },
  { id: 'epic', name: '史詩', color: '#b36bff', mult: 2 },
  { id: 'legendary', name: '傳說', color: '#ffb84d', mult: 3 },
] as const;
/** 裂變產生的藥水稀有度 */
export const MYTHIC = { name: '神話', color: '#ff4d6d' } as const;

/** 素材稀有度權重（普通/稀有/史詩/傳說），每波往高稀有度偏移 */
export const DROP_RARITY = {
  normal: [80, 16, 3.5, 0.5],
  elite: [30, 45, 20, 5],
  perWave: [-1.6, 0.9, 0.5, 0.2],
} as const;

/** 突變卡稀有度權重 */
export const CARD_RARITY = {
  base: [62, 27, 9, 2],
  perWave: [-2.4, 1, 1, 0.4],
} as const;

/** 煉成時裂變成神話藥水 */
export const FISSION = {
  baseChance: 0.1,
  /** 每個素材依稀有度增加的裂變率 */
  perMaterial: [0, 0.03, 0.06, 0.12],
  maxChance: 0.65,
} as const;

/** 喝下藥水時，每份素材帶來的屬性成長（份數 = 素材稀有度倍率） */
export const ELEMENT = {
  jellyDashMul: 0.95,
  jellySpeed: 0.03,
  jellyPerHeart: 3,
  iceFireMul: 0.95,
  iceSlow: 0.04,
  sporePoison: 0.25,
  fireDamage: 0.05,
  thunderCrit: 0.03,
  maxHp: 14,
  minDashCooldown: 0.4,
  minFireInterval: 0.12,
  maxSpeedMul: 1.6,
  maxSlow: 0.5,
  maxCrit: 0.6,
} as const;

export const WAVE = {
  total: 10,
  intermission: 2,
  maxDuration: 60,
} as const;

export const ELITE = {
  hpMul: 2.5,
  radiusMul: 1.3,
} as const;

export const COLORS = {
  bg: 0x0f1a14,
  floor: 0x16261c,
  floorTile: 0x1b2e22,
  wall: 0x2c4a36,
  bar: 0x1a1420,
  panel: 0x241c2e,
  panelLight: 0x3a2f45,
  accent: 0xc9a3ff,
  telegraph: 0xff3b3b,
  player: 0xf4f0e6,
  bullet: 0xfff2a8,
  enemyBullet: 0xff6b6b,
  text: '#f4f0e6',
  textDim: '#9a90a8',
  gold: 0xffd166,
} as const;

export const STORAGE_KEYS = {
  codex: 'crucible-garden.codex.v2',
  progress: 'crucible-garden.progress.v1',
} as const;

export const FONT = "'PingFang TC','Noto Sans TC','Microsoft JhengHei','Heiti TC',system-ui,sans-serif";
