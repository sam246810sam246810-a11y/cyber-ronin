export type IngredientId = 'J' | 'I' | 'S';

export interface IngredientDef {
  id: IngredientId;
  name: string;
  element: string;
  color: string;
  weight: number;
}

/** 藥水參數。所有突變卡都透過修改這份參數生效。 */
export interface PotionParams {
  damage: number;
  radius: number;
  duration: number;
  bounces: number;
  splits: number;
  count: number;
  pierce: number;
  extra: Record<string, number>;
}

export interface RecipeDef {
  /** 排序後的組合字串，例如 "IJS" */
  key: string;
  id: string;
  name: string;
  desc: string;
  color: string;
  params: PotionParams;
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
  desc: string;
  icon: string;
}
