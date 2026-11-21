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
  unlock: { type: 'default' | 'bestWave' | 'fissions' | 'bossKills'; value: number; text: string };
}

export type EnemyType = 'crawler' | 'spitter' | 'hopper' | 'boss';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  color: string;
  contactDamage: number;
  attackInterval?: number;
  telegraph?: number;
  [key: string]: unknown;
}

export interface WaveGroup {
  type: Exclude<EnemyType, 'boss'>;
  count: number;
  elite?: boolean;
}

export interface WaveDef {
  spawnWindow: number;
  groups: WaveGroup[];
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
