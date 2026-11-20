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

export const POTION = {
  flightTime: 0.5,
  autoAimRange: 620,
  defaultDistance: 300,
  rackBase: 1,
  arcHeight: 90,
  pierceHitRadius: 26,
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
  codex: 'crucible-garden.codex.v1',
} as const;

export const FONT = "'PingFang TC','Noto Sans TC','Microsoft JhengHei','Heiti TC',system-ui,sans-serif";
