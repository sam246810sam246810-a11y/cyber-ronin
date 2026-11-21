/** 元素：果凍 J、冰晶 I、孢子 S、火焰花 F、雷菇 T */
export type ElementId = 'J' | 'I' | 'S' | 'F' | 'T';
/** 稀有度索引：0 普通、1 稀有、2 史詩、3 傳說 */
export type RarityIndex = 0 | 1 | 2 | 3;

export interface RarityDef {
  id: string;
  name: string;
  color: string;
  /** 效果倍率 */
  mult: number;
}

export interface ElementDef {
  id: ElementId;
  name: string;
  color: string;
  /** 每份素材給的屬性說明 */
  growth: string;
  /** 純色核心被動 */
  coreName: string;
  coreDesc: string;
  /** 附加（命中特效）被動 */
  riderName: string;
  riderDesc: string;
  /** 雙色藥水的形容詞前綴 */
  adj: string;
  /** 四種稀有度的素材名稱 */
  materials: [string, string, string, string];
}

/** 一個素材 = 元素 + 稀有度 */
export interface Material {
  el: ElementId;
  r: RarityIndex;
}

export type RecipeKind = 'pure' | 'dual' | 'tri';

export interface RecipeDef {
  /** 排序後的元素組合，例如 "FIJ" */
  key: string;
  kind: RecipeKind;
  name: string;
  desc: string;
  color: string;
  /** 取得的被動模組 id 與每瓶層數 */
  modules: { id: string; n: number }[];
  /** 三色藥水額外的傷害加成 */
  damageBonus: number;
}

/** 裂變產生的神話藥水 */
export interface MythicDef {
  id: string;
  name: string;
  desc: string;
  color: string;
}

/** 煉出的藥水 */
export type Brew =
  | { kind: 'recipe'; recipe: RecipeDef; quality: RarityIndex; mats: Material[] }
  | { kind: 'mythic'; mythic: MythicDef; from: RecipeDef; quality: RarityIndex; mats: Material[] };

export interface CharacterDef {
  id: string;
  name: string;
  /** 稱號，例如「見習煉金貓」 */
  title: string;
  rarity: RarityIndex;
  color: string;
  desc: string;
  passiveName: string;
  passiveDesc: string;
  stats: { hp: number; speed: number; fireInterval: number; damage: number; dashCooldown: number };
  /** 該元素素材的屬性加成倍率 */
  elementBonus?: Partial<Record<ElementId, number>>;
  /** 開局自帶的被動模組 */
  startModules?: { id: string; n: number }[];
  fissionBonus?: number;
  pickupBonus?: number;
  /** 受傷時爆炸（熔岩護甲） */
  hurtBlast?: { radius: number; damage: number };
  /** 所有藥水被動層數倍率 */
  moduleMul?: number;
  unlock: { type: 'default' | 'bestFloor' | 'fissions' | 'bossKills'; value: number; text: string };
  startWeapon: string;
  skill: SkillDef;
}

export interface SkillDef {
  id: 'emergency_brew' | 'frost_storm' | 'lava_charge' | 'thunder_field';
  name: string;
  desc: string;
  cooldown: number;
}

export type WeaponKind = 'single' | 'spread' | 'melee' | 'boomerang' | 'lance' | 'mortar' | 'chain' | 'orb';

export interface WeaponDef {
  id: string;
  name: string;
  rarity: RarityIndex;
  kind: WeaponKind;
  desc: string;
  intervalMul: number;
  damageMul: number;
  speed?: number;
  bullets?: number;
  spread?: number;
  maxDist?: number;
  jitter?: number;
  radius?: number;
  arc?: number;
  range?: number;
  pierce?: number;
  hops?: number;
}

export type EnemyType =
  | 'crawler' | 'spitter' | 'hopper' | 'bomber' | 'beetle' | 'splitter' | 'wisp' | 'thief'
  | 'boss_flower' | 'boss_snail' | 'boss_king';
export type MinionType = Exclude<EnemyType, 'boss_flower' | 'boss_snail' | 'boss_king'>;
export type BossType = Extract<EnemyType, 'boss_flower' | 'boss_snail' | 'boss_king'>;

export interface EnemyDef {
  type: EnemyType;
  name: string;
  boss?: boolean;
  hp: number;
  speed: number;
  radius: number;
  color: string;
  contactDamage: number;
  attackInterval?: number;
  telegraph?: number;
  [key: string]: unknown;
}

export interface RegionEnemy {
  type: MinionType;
  weight: number;
  /** 佔用戰鬥預算 */
  cost: number;
  /** 從該區第幾層開始出現 */
  minFloor: number;
}

export interface RegionTheme {
  bg: string;
  floor: string;
  tile: string;
  wall: string;
  deco: string;
  decoLight: string;
}

export interface RegionDef {
  id: string;
  name: string;
  subtitle: string;
  hpMul: number;
  boss: BossType;
  theme: RegionTheme;
  enemies: RegionEnemy[];
  /** 每層戰鬥房的敵人預算（兩波合計） */
  roomBudget: number[];
}

export type RoomType = 'start' | 'combat' | 'elite' | 'treasure' | 'shop' | 'event' | 'exit' | 'boss' | 'rift_past' | 'rift_future' | 'lobby';

export type RoomModId = 'golden' | 'bounty' | 'frenzy' | 'darkness' | 'gale' | 'gravity' | 'teaser';
export interface RoomModDef {
  id: RoomModId;
  name: string;
  desc: string;
  icon: string;
  curse: boolean;
}

export type NpcKind = 'future_self' | 'lost_alchemist' | 'time_merchant' | 'chatty_mushroom';
export interface NpcDef {
  name: string;
  color: string;
  lines: string[];
}

export interface MutationDef {
  id: string;
  name: string;
  /** {v} 會被換成實際數值 */
  desc: string;
  icon: string;
  /** 普通稀有度時每張的數值 */
  base: number;
  unit: string;
}

export interface RelicDef {
  id: string;
  name: string;
  rarity: RarityIndex;
  icon: string;
  desc: string;
  /** 一開始就在掉落池裡（其餘要在大廳用時之砂解鎖） */
  starter?: boolean;
}

export interface MetaUpgradeDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  max: number;
  costs: number[];
}

export type TerrainType = 'water' | 'grass' | 'oil' | 'sun';
export interface TerrainPatch {
  type: TerrainType;
  x: number;
  y: number;
  r: number;
}

export type HistoryId = 'flower' | 'notes' | 'kitten' | 'bury';
