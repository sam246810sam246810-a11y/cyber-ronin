// M2.5 第二期：義體模組、抽卡、每日任務、成就、每日挑戰。

// ---------- B1 義體模組 ----------
export type Slot = 'head' | 'body' | 'arm';
export type StatKey =
  | 'might'
  | 'crit'
  | 'critDmg'
  | 'cdr'
  | 'maxHp'
  | 'armor'
  | 'regen'
  | 'speed'
  | 'pickup'
  | 'xp'
  | 'luck'
  | 'intent'
  | 'blade'
  | 'volt'
  | 'hack'
  | 'fire';

export const STATS: Record<StatKey, { name: string; pct: boolean }> = {
  might: { name: '攻擊力', pct: true },
  crit: { name: '暴擊率', pct: true },
  critDmg: { name: '暴擊傷害', pct: true },
  cdr: { name: '武器冷卻', pct: true },
  maxHp: { name: '最大生命', pct: false },
  armor: { name: '護甲', pct: false },
  regen: { name: '每秒回復', pct: false },
  speed: { name: '移動速度', pct: true },
  pickup: { name: '拾取範圍', pct: true },
  xp: { name: '經驗獲取', pct: true },
  luck: { name: '幸運', pct: false },
  intent: { name: '殺意累積', pct: true },
  blade: { name: '刃系傷害', pct: true },
  volt: { name: '電系傷害', pct: true },
  hack: { name: '駭系傷害', pct: true },
  fire: { name: '炎系傷害', pct: true },
};

export function fmtStat(key: StatKey, v: number): string {
  const s = STATS[key];
  if (key === 'cdr') return `${s.name} -${Math.round(v * 1000) / 10}%`;
  if (s.pct) return `${s.name} +${Math.round(v * 1000) / 10}%`;
  return `${s.name} +${Math.round(v * 10) / 10}`;
}

export interface ModuleBase {
  id: string;
  slot: Slot;
  name: string;
  main: StatKey;
  /** N 稀有度、+0 時的主屬性數值 */
  value: number;
}

export const MODULE_BASES: ModuleBase[] = [
  { id: 'chip-might', slot: 'head', name: '戰術晶片', main: 'might', value: 0.04 },
  { id: 'chip-crit', slot: 'head', name: '鎖定晶片', main: 'crit', value: 0.02 },
  { id: 'chip-cdr', slot: 'head', name: '時脈晶片', main: 'cdr', value: 0.025 },
  { id: 'chip-luck', slot: 'head', name: '招財晶片', main: 'luck', value: 0.8 },
  { id: 'body-hp', slot: 'body', name: '心核胸甲', main: 'maxHp', value: 10 },
  { id: 'body-armor', slot: 'body', name: '反應背心', main: 'armor', value: 0.5 },
  { id: 'body-regen', slot: 'body', name: '再生組織', main: 'regen', value: 0.15 },
  { id: 'body-pickup', slot: 'body', name: '磁力背心', main: 'pickup', value: 0.06 },
  { id: 'arm-blade', slot: 'arm', name: '刃之臂', main: 'blade', value: 0.05 },
  { id: 'arm-volt', slot: 'arm', name: '雷之臂', main: 'volt', value: 0.05 },
  { id: 'arm-hack', slot: 'arm', name: '駭之臂', main: 'hack', value: 0.05 },
  { id: 'arm-fire', slot: 'arm', name: '炎之臂', main: 'fire', value: 0.05 },
];

export const SLOT_NAME: Record<Slot, string> = { head: '頭部晶片', body: '軀幹裝甲', arm: '手臂義肢' };

export const MOD_RARITY = [
  { name: 'N', color: 0xa9a5c8, css: '#c9c6e0', mult: 1, subs: 0, dismantle: 5 },
  { name: 'R', color: 0x4da6ff, css: '#6db8ff', mult: 1.6, subs: 1, dismantle: 15 },
  { name: 'SR', color: 0xb46bff, css: '#c48bff', mult: 2.4, subs: 2, dismantle: 40 },
  { name: 'SSR', color: 0xffc83d, css: '#ffd84d', mult: 3.5, subs: 3, dismantle: 100 },
] as const;

export const MAX_MOD_LEVEL = 10;

/** 副屬性：每條的數值範圍（N 基準，乘上稀有度倍率的一半） */
export const SUB_RANGES: Partial<Record<StatKey, [number, number]>> = {
  might: [0.02, 0.04],
  crit: [0.01, 0.025],
  critDmg: [0.05, 0.12],
  cdr: [0.01, 0.025],
  maxHp: [5, 12],
  armor: [0.3, 0.8],
  speed: [0.015, 0.035],
  pickup: [0.04, 0.1],
  xp: [0.02, 0.05],
  luck: [0.3, 0.8],
  intent: [0.04, 0.1],
};

export interface ModuleItem {
  uid: string;
  base: string;
  rarity: 0 | 1 | 2 | 3;
  level: number;
  subs: { key: StatKey; value: number }[];
}

export function mainValue(m: ModuleItem): number {
  const b = MODULE_BASES.find((x) => x.id === m.base)!;
  return b.value * MOD_RARITY[m.rarity].mult * (1 + 0.12 * m.level);
}

export function upgradeCost(m: ModuleItem): number {
  return (m.level + 1) * 8 * (m.rarity + 1);
}

export function dismantleValue(m: ModuleItem): number {
  let spent = 0;
  for (let l = 0; l < m.level; l++) spent += (l + 1) * 8 * (m.rarity + 1);
  return MOD_RARITY[m.rarity].dismantle + Math.floor(spent * 0.6);
}

let uidCounter = 0;
export function makeModule(rarity: 0 | 1 | 2 | 3, baseId?: string): ModuleItem {
  const base = baseId ? MODULE_BASES.find((b) => b.id === baseId)! : MODULE_BASES[Math.floor(Math.random() * MODULE_BASES.length)];
  const keys = (Object.keys(SUB_RANGES) as StatKey[]).filter((k) => k !== base.main);
  const subs: ModuleItem['subs'] = [];
  for (let i = 0; i < MOD_RARITY[rarity].subs && keys.length; i++) {
    const k = keys.splice(Math.floor(Math.random() * keys.length), 1)[0];
    const [lo, hi] = SUB_RANGES[k]!;
    subs.push({ key: k, value: (lo + Math.random() * (hi - lo)) * (1 + MOD_RARITY[rarity].mult * 0.25) });
  }
  return { uid: `${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, base: base.id, rarity, level: 0, subs };
}

/** 加總裝備中模組的屬性 */
export function moduleStats(mods: ModuleItem[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const m of mods) {
    const b = MODULE_BASES.find((x) => x.id === m.base);
    if (!b) continue;
    out[b.main] = (out[b.main] ?? 0) + mainValue(m);
    for (const s of m.subs) out[s.key] = (out[s.key] ?? 0) + s.value * (1 + 0.05 * m.level);
  }
  return out;
}

// ---------- B2 抽卡 ----------
export const GACHA = {
  single: 100,
  ten: 900,
  rates: [0.6, 0.3, 0.085, 0.015],
  pity: 50,
};

/** 模組掉落（Boss 必掉、精英機率掉）的稀有度權重 */
export function dropRarity(wanted: number, boss: boolean): 0 | 1 | 2 | 3 {
  const w = boss ? [40, 40, 16 + wanted, 4 + wanted * 0.6] : [65, 28, 6 + wanted * 0.5, 1 + wanted * 0.2];
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < 4; i++) {
    r -= w[i];
    if (r <= 0) return i as 0 | 1 | 2 | 3;
  }
  return 0;
}

// ---------- B5 每日任務 ----------
export interface RunStats {
  kills: number;
  time: number;
  bossKills: number;
  iai: number;
  relics: number;
  victory: boolean;
  level: number;
  maxCombo: number;
  wanted: number;
  tagKills: Record<string, number>;
  evolved: string[];
  daily: boolean;
}

export interface MissionDef {
  id: string;
  desc: (n: number) => string;
  target: number;
  reward: number;
  /** 每局結算時增加的進度 */
  progress: (r: RunStats) => number;
}

export const DAILY_POOL: MissionDef[] = [
  { id: 'kills', desc: (n) => `擊殺 ${n} 個敵人`, target: 800, reward: 60, progress: (r) => r.kills },
  { id: 'blade', desc: (n) => `用刃系武器擊殺 ${n} 個敵人`, target: 300, reward: 60, progress: (r) => r.tagKills.blade ?? 0 },
  { id: 'volt', desc: (n) => `用電系武器擊殺 ${n} 個敵人`, target: 300, reward: 60, progress: (r) => r.tagKills.volt ?? 0 },
  { id: 'hack', desc: (n) => `用駭系武器擊殺 ${n} 個敵人`, target: 300, reward: 60, progress: (r) => r.tagKills.hack ?? 0 },
  { id: 'survive', desc: (n) => `累計存活 ${n} 分鐘`, target: 15, reward: 60, progress: (r) => Math.floor(r.time / 60) },
  { id: 'boss', desc: (n) => `擊敗 ${n} 隻 Boss`, target: 2, reward: 80, progress: (r) => r.bossKills },
  { id: 'iai', desc: (n) => `發動 ${n} 次大招`, target: 8, reward: 60, progress: (r) => r.iai },
  { id: 'relics', desc: (n) => `取得 ${n} 個遺物`, target: 4, reward: 60, progress: (r) => r.relics },
  { id: 'runs', desc: (n) => `出擊 ${n} 次`, target: 3, reward: 50, progress: () => 1 },
  { id: 'combo', desc: (n) => `單局達到 ${n} 連段`, target: 300, reward: 70, progress: (r) => r.maxCombo },
];

export const DAILY_COUNT = 3;

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 依日期挑出今天的任務（同一天每次結果相同） */
export function dailyMissions(day: string): MissionDef[] {
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pool = DAILY_POOL.slice();
  const out: MissionDef[] = [];
  while (out.length < DAILY_COUNT && pool.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

// ---------- 成就 ----------
export interface AchStats {
  totalKills: number;
  bossKills: number;
  wins: number;
  bestWanted: number;
  iaiTotal: number;
  relicsTotal: number;
  gachaPulls: number;
  ssrCount: number;
  bestLevel: number;
  maxCombo: number;
  totalCredits: number;
  evolutions: number;
  chars: number;
  maxModuleLevel: number;
  dailyClears: number;
  runs: number;
}

export interface AchDef {
  id: string;
  name: string;
  desc: string;
  reward: number;
  check: (s: AchStats) => boolean;
}

const tier = (id: string, name: string, key: keyof AchStats, steps: [number, number][], unit: string): AchDef[] =>
  steps.map(([n, reward], i) => ({ id: `${id}${i + 1}`, name: `${name} ${['I', 'II', 'III', 'IV'][i]}`, desc: `${unit.replace('{n}', String(n))}`, reward, check: (s) => s[key] >= n }));

export const ACHIEVEMENTS: AchDef[] = [
  ...tier('kills', '割草者', 'totalKills', [[1000, 50], [5000, 100], [20000, 200], [50000, 300]], '累計擊殺 {n} 個敵人'),
  ...tier('boss', '斬將', 'bossKills', [[1, 50], [10, 100], [30, 200]], '累計擊敗 {n} 隻 Boss'),
  ...tier('wins', '黎明', 'wins', [[1, 100], [5, 150], [20, 300]], '通關 {n} 次'),
  ...tier('wanted', '頭號通緝犯', 'bestWanted', [[3, 100], [6, 200], [10, 400]], '在通緝等級 {n} 通關'),
  ...tier('iai', '一閃', 'iaiTotal', [[20, 50], [100, 150]], '累計發動 {n} 次居合・一閃'),
  ...tier('relic', '收藏家', 'relicsTotal', [[10, 50], [50, 150]], '累計取得 {n} 個遺物'),
  ...tier('pull', '黑市常客', 'gachaPulls', [[10, 50], [50, 100], [100, 200]], '累計抽卡 {n} 次'),
  ...tier('ssr', '天選之人', 'ssrCount', [[1, 100]], '取得 {n} 個 SSR 模組'),
  ...tier('lv', '成長', 'bestLevel', [[30, 50], [50, 100]], '單局達到 Lv {n}'),
  ...tier('combo', '連斬', 'maxCombo', [[500, 50], [2000, 150]], '單局達到 {n} 連段'),
  ...tier('credits', '富豪', 'totalCredits', [[1000, 50], [10000, 150]], '累計獲得 {n} 信用點'),
  ...tier('evo', '進化', 'evolutions', [[1, 50], [4, 150]], '進化過 {n} 種武器'),
  ...tier('chars', '浪人集結', 'chars', [[3, 150]], '解鎖 {n} 名角色'),
  ...tier('modlv', '改造狂', 'maxModuleLevel', [[5, 50], [10, 150]], '把一個模組強化到 +{n}'),
  ...tier('daily', '每日挑戰者', 'dailyClears', [[1, 50], [7, 200]], '完成 {n} 次每日挑戰'),
];

// ---------- 每日挑戰 ----------
export function dailyChallenge(day: string): { char: 'jin' | 'zero' | 'tetsu'; wanted: number; seed: number } {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const chars = ['jin', 'zero', 'tetsu'] as const;
  return { char: chars[h % 3], wanted: 1 + (h >>> 3) % 3, seed: h };
}

/** 可設定種子的亂數（每日挑戰用） */
export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
