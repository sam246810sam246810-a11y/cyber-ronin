import ingredientsJson from './ingredients.json';
import recipesJson from './recipes.json';
import enemiesJson from './enemies.json';
import wavesJson from './waves.json';
import mutationsJson from './mutations.json';
import legendariesJson from './legendaries.json';
import type {
  EnemyDef, EnemyType, IngredientDef, IngredientId, LegendaryDef, MutationDef, RecipeDef, WaveDef,
} from '../types';

export const INGREDIENTS = ingredientsJson as IngredientDef[];
export const INGREDIENT_MAP: Record<IngredientId, IngredientDef> = Object.fromEntries(
  INGREDIENTS.map((i) => [i.id, i]),
) as Record<IngredientId, IngredientDef>;

type RawRecipe = Omit<RecipeDef, 'key'>;

export const RECIPES: Record<string, RecipeDef> = Object.fromEntries(
  Object.entries(recipesJson as Record<string, RawRecipe>).map(([key, r]) => [key, { ...r, key }]),
);

export const LEGENDARIES = legendariesJson as LegendaryDef[];
/** 圖鑑裡傳說藥水的 key */
export const legendaryKey = (id: string) => `L:${id}`;

/** 圖鑑顯示順序 */
export const RECIPE_ORDER = ['JJJ', 'III', 'SSS', 'IJJ', 'JJS', 'IIJ', 'IIS', 'JSS', 'ISS', 'IJS'];

/** 把三個藥材轉成排序後的配方 key */
export function recipeKey(ids: IngredientId[]): string {
  return [...ids].sort().join('');
}

export const ENEMIES = enemiesJson as unknown as Record<EnemyType, EnemyDef>;
export const WAVES = wavesJson as WaveDef[];
export const MUTATIONS = mutationsJson as MutationDef[];

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
