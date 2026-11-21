import elementsJson from './elements.json';
import potionsJson from './potions.json';
import mythicsJson from './mythics.json';
import charactersJson from './characters.json';
import enemiesJson from './enemies.json';
import regionsJson from './regions.json';
import mutationsJson from './mutations.json';
import weaponsJson from './weapons.json';
import funJson from './fun.json';
import relicsJson from './relics.json';
import metaJson from './meta.json';
import { RARITY } from '../config';
import type {
  CharacterDef, ElementDef, ElementId, EnemyDef, EnemyType, Material, MutationDef, MythicDef, RarityIndex,
  RecipeDef, RegionDef, WeaponDef, RelicDef, MetaUpgradeDef, RoomModDef, NpcKind, NpcDef, RegionTheme,
} from '../types';

export const ELEMENTS = elementsJson as ElementDef[];
export const ELEMENT_IDS = ELEMENTS.map((e) => e.id);
export const ELEMENT_MAP = Object.fromEntries(ELEMENTS.map((e) => [e.id, e])) as Record<ElementId, ElementDef>;

export const materialName = (m: Material) => ELEMENT_MAP[m.el].materials[m.r];

/** 把三個元素轉成排序後的配方 key */
export function recipeKey(ids: ElementId[]): string {
  return [...ids].sort().join('');
}

/**
 * 35 種配方依規則自動生成：
 * - 純色 AAA：核心 A ×2 層
 * - 雙色 AAB：核心 A ×1 ＋ 附加 B ×1
 * - 三色 ABC：附加 A、B、C 各 ×1 ＋ 傷害加成
 */
function buildRecipes(): Record<string, RecipeDef> {
  const out: Record<string, RecipeDef> = {};
  const ids = [...ELEMENT_IDS].sort();
  const tri = potionsJson.triNames as Record<string, string>;
  for (let a = 0; a < ids.length; a++) {
    for (let b = a; b < ids.length; b++) {
      for (let c = b; c < ids.length; c++) {
        const key = ids[a] + ids[b] + ids[c];
        const counts = new Map<ElementId, number>();
        for (const ch of key) counts.set(ch as ElementId, (counts.get(ch as ElementId) ?? 0) + 1);
        const sorted = [...counts.entries()].sort((x, y) => y[1] - x[1]);
        if (sorted.length === 1) {
          const e = ELEMENT_MAP[sorted[0][0]];
          out[key] = {
            key, kind: 'pure', name: e.coreName, color: e.color, damageBonus: 0,
            desc: `【核心】${e.coreDesc}（每瓶 2 層）`,
            modules: [{ id: `core_${e.id}`, n: 2 }],
          };
        } else if (sorted.length === 2) {
          const main = ELEMENT_MAP[sorted[0][0]];
          const sub = ELEMENT_MAP[sorted[1][0]];
          out[key] = {
            key, kind: 'dual', name: `${sub.adj}${main.coreName}`, color: main.color, damageBonus: 0,
            desc: `【核心】${main.coreDesc}\n【附加】${sub.riderDesc}`,
            modules: [{ id: `core_${main.id}`, n: 1 }, { id: `rider_${sub.id}`, n: 1 }],
          };
        } else {
          const es = sorted.map(([id]) => ELEMENT_MAP[id]);
          out[key] = {
            key, kind: 'tri', name: tri[key] ?? '三相藥劑', color: '#fff3a8', damageBonus: potionsJson.triDamageBonus,
            desc: `【附加】${es.map((e) => e.riderName).join('、')} 各 1 層\n傷害 +${Math.round(potionsJson.triDamageBonus * 100)}%`,
            modules: es.map((e) => ({ id: `rider_${e.id}`, n: 1 })),
          };
        }
      }
    }
  }
  return out;
}

export const RECIPES = buildRecipes();
const KIND_ORDER = { pure: 0, dual: 1, tri: 2 };
/** 圖鑑顯示順序：純色 → 雙色 → 三色 */
export const RECIPE_ORDER = Object.values(RECIPES)
  .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key))
  .map((r) => r.key);

/** 藥水品質：三個素材稀有度總和 0~9 */
export function potionQuality(mats: Material[]): RarityIndex {
  const sum = mats.reduce((s, m) => s + m.r, 0);
  if (sum >= 8) return 3;
  if (sum >= 5) return 2;
  if (sum >= 2) return 1;
  return 0;
}

export const MYTHICS = mythicsJson as MythicDef[];
export const mythicKey = (id: string) => `M:${id}`;

export const CHARACTERS = charactersJson as CharacterDef[];

export const WEAPONS = weaponsJson as WeaponDef[];
export const WEAPON_MAP = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<string, WeaponDef>;

export const ENEMIES = enemiesJson as unknown as Record<EnemyType, EnemyDef>;
export const REGIONS = regionsJson as RegionDef[];
/** 每區層數（最後一層有 Boss） */
export const FLOORS_PER_REGION = 3;
export const TOTAL_FLOORS = REGIONS.length * FLOORS_PER_REGION;
export const MUTATIONS = mutationsJson as MutationDef[];

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export const rarityColor = (r: RarityIndex) => RARITY[r].color;

/** 時空裂縫、房間詞條、NPC */
export const FUN = funJson as unknown as {
  riftChance: number;
  roomModChance: number;
  npcChance: number;
  mods: RoomModDef[];
  npcs: Record<NpcKind, NpcDef>;
};

/** 時空裂縫的場景配色 */
export const RIFT_THEMES: Record<'past' | 'future', RegionTheme> = {
  past: { bg: '#1e170f', floor: '#3a2e1e', tile: '#43361f', wall: '#7a6440', deco: '#5a4a2a', decoLight: '#e0c08a' },
  future: { bg: '#05040f', floor: '#0e0b24', tile: '#151036', wall: '#00e0ff', deco: '#3a00a0', decoLight: '#ff3df0' },
};

export const RELICS = relicsJson as RelicDef[];
export const RELIC_MAP = Object.fromEntries(RELICS.map((r) => [r.id, r])) as Record<string, RelicDef>;
export const META_UPGRADES = metaJson as MetaUpgradeDef[];
/** 聖物在大廳解鎖的價格（依稀有度） */
export const RELIC_UNLOCK_COST = [10, 25, 45, 75];

/** 大廳「貓咪煉金工房」的配色 */
export const LOBBY_THEME: RegionTheme = {
  bg: '#1a1410', floor: '#3a2a1e', tile: '#45321f', wall: '#7a5530', deco: '#5a3a1a', decoLight: '#ffd166',
};
