import ingredientsJson from './ingredients.json';
import recipesJson from './recipes.json';
import enemiesJson from './enemies.json';
import wavesJson from './waves.json';
import mutationsJson from './mutations.json';
import type {
  EnemyDef, EnemyType, IngredientDef, IngredientId, MutationDef, PotionParams, RecipeDef, WaveDef,
} from '../types';

export const INGREDIENTS = ingredientsJson as IngredientDef[];
export const INGREDIENT_MAP: Record<IngredientId, IngredientDef> = Object.fromEntries(
  INGREDIENTS.map((i) => [i.id, i]),
) as Record<IngredientId, IngredientDef>;

export function defaultParams(): PotionParams {
  return { damage: 0, radius: 60, duration: 0, bounces: 0, splits: 0, count: 1, pierce: 0, extra: {} };
}

type RawRecipe = Omit<RecipeDef, 'key' | 'params'> & { params: Partial<PotionParams> };

export const RECIPES: Record<string, RecipeDef> = Object.fromEntries(
  Object.entries(recipesJson as Record<string, RawRecipe>).map(([key, r]) => {
    const params = { ...defaultParams(), ...r.params, extra: { ...(r.params.extra ?? {}) } };
    return [key, { ...r, key, params }];
  }),
);

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
