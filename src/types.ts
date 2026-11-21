export type IngredientId = 'J' | 'I' | 'S';

export interface IngredientDef {
  id: IngredientId;
  name: string;
  element: string;
  color: string;
  weight: number;
}

export interface RecipeDef {
  /** 排序後的組合字串，例如 "IJS" */
  key: string;
  id: string;
  name: string;
  desc: string;
  color: string;
}

/** 裂變產生的傳說藥水 */
export interface LegendaryDef {
  id: string;
  name: string;
  desc: string;
  color: string;
}

/** 喝下的藥水：一般配方或傳說 */
export type Brew =
  | { kind: 'recipe'; recipe: RecipeDef }
  | { kind: 'legendary'; legendary: LegendaryDef; from: RecipeDef };

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
  desc: string;
  icon: string;
}
