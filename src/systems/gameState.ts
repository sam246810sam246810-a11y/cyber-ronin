// 遊戲進度。M6 會把它存進 localStorage。
import classes from '../data/classes.json';
import { applyItem, type Difficulty, type Rng, type Statuses } from './combat';
import { BASES, canUse, equipName, equipStats, generateEquip, RARITIES, type BaseId, type Equip, type Slot } from './equipment';
import { BAG_START, canAddGear, canAddItem, type Bag } from './inventory';
import { addExp, computeStats, type Stats } from './progression';

export interface Reward { money?: number; item?: string; count?: number; gearTier?: number; minRarity?: number; key?: string }
export type ClassId = keyof typeof classes;

export interface GameState extends Bag {
  classId: ClassId;
  difficulty: Difficulty;
  level: number;
  hp: number;
  mp: number;
  exp: number;
  statuses: Statuses;
  money: number;
  nextUid: number;
  flags: Set<string>;
  openedChests: Set<string>;
  /** 自動存檔點：最後一次進入的地圖與出生點，死亡時回到這裡（PRD 4.7） */
  checkpoint: { map: string; spawn: string };
  /** 結局分數（PRD 2.6） */
  bond: number;
  anger: number;
  /** 遊玩時間（秒） */
  playTime: number;
  /** 任務進度（PRD 9） */
  quests: Record<string, { status: 'active' | 'done'; progress: number }>;
}

export function classStats(id: ClassId) { return classes[id]; }

const STARTER: Record<ClassId, BaseId> = { swordsman: 'wood_sword', archer: 'bamboo_bow', onmyoji: 'paper_fan' };

export function newGameState(classId: ClassId = 'swordsman', difficulty: Difficulty = 'normal'): GameState {
  const c = classes[classId];
  const gear: Equip[] = [
    { uid: 1, base: STARTER[classId], rarity: 0, affixes: [] },
    { uid: 2, base: 'hemp_robe', rarity: 0, affixes: [] },
  ];
  const s: GameState = {
    classId, difficulty, level: 1, hp: c.hp, mp: c.mp, exp: 0, statuses: {},
    money: 0, items: {}, gear, nextUid: 3,
    equipped: { weapon: 1, head: null, body: 2, hands: null, feet: null, accessory: null },
    capacity: BAG_START,
    flags: new Set(), openedChests: new Set(),
    checkpoint: { map: 'home', spawn: 'door' },
    bond: 0, anger: 0, playTime: 0, quests: {},
  };
  const st = statsOf(s); s.hp = st.maxHp; s.mp = st.maxMp;
  return s;
}

export function equippedGear(s: GameState): Equip[] {
  return Object.values(s.equipped).map((u) => s.gear.find((g) => g.uid === u)).filter((g): g is Equip => !!g);
}

/** 目前的最終能力值（等級＋裝備） */
export function statsOf(s: GameState): Stats {
  return computeStats(s.classId, s.level, equippedGear(s).map(equipStats));
}

/** 能力上限改變後，HP／MP 不超過上限 */
function clampVitals(s: GameState): void {
  const st = statsOf(s);
  s.hp = Math.min(s.hp, st.maxHp); s.mp = Math.min(s.mp, st.maxMp);
}

export function equip(s: GameState, uid: number): boolean {
  const g = s.gear.find((x) => x.uid === uid);
  if (!g || !canUse(g, s.classId)) return false;
  s.equipped[BASES[g.base].slot] = uid;
  clampVitals(s);
  return true;
}

export function unequip(s: GameState, slot: Slot): boolean {
  if (s.equipped[slot] == null) return false;
  const was = s.equipped[slot];
  s.equipped[slot] = null;
  if (!canAddGear(s)) { s.equipped[slot] = was; return false; } // 背包放不下就不能卸
  clampVitals(s);
  return true;
}

/** 加經驗，升級時 HP／MP 全滿。回傳升了幾級。 */
export function gainExp(s: GameState, amount: number): number {
  const r = addExp(s.level, s.exp, amount);
  s.level = r.level; s.exp = r.exp;
  if (r.gained > 0) { const st = statsOf(s); s.hp = st.maxHp; s.mp = st.maxMp; }
  return r.gained;
}

/** 新增一件隨機裝備；背包滿了回傳 null。 */
export function giveRandomGear(s: GameState, rng: Rng, tier: number, minRarity = 0): Equip | null {
  if (!canAddGear(s)) return null;
  const e = generateEquip(rng, s.nextUid++, { tier, classId: s.classId, minRarity });
  s.gear.push(e);
  return e;
}

export function gearLabel(e: Equip): string { return `${RARITIES[e.rarity].name}・${equipName(e)}`; }

export interface ChestResult { opened: boolean; message: string }

/** 開寶箱。已開過不重複給獎勵；背包放不下就先不打開。 */
export function openChest(s: GameState, chestId: string, reward: Reward, rng: Rng = Math.random): ChestResult {
  if (s.openedChests.has(chestId)) return { opened: false, message: '寶箱已經打開了' };
  if (reward.key && (s.items[reward.key] ?? 0) <= 0) return { opened: false, message: `上鎖了。需要「${reward.key}」` };
  const needItem = reward.item ? !canAddItem(s, reward.item, reward.count ?? 1) : false;
  const needGear = reward.gearTier ? !canAddGear(s) : false;
  if (needItem || needGear) return { opened: false, message: '背包滿了，整理一下再來開吧' };
  s.openedChests.add(chestId);
  const parts: string[] = [];
  if (reward.key) { s.items[reward.key]--; if (s.items[reward.key] <= 0) delete s.items[reward.key]; parts.push(`用掉${reward.key}`); }
  if (reward.item) {
    const n = reward.count ?? 1;
    s.items[reward.item] = (s.items[reward.item] ?? 0) + n;
    parts.push(`${reward.item} ×${n}`);
  }
  if (reward.gearTier) {
    const e = giveRandomGear(s, rng, reward.gearTier, reward.minRarity ?? 0);
    if (e) parts.push(gearLabel(e));
  }
  if (reward.money) { s.money += reward.money; parts.push(`${reward.money} 文`); }
  return { opened: true, message: parts.length ? `獲得 ${parts.join('、')}` : '寶箱是空的' };
}

/** 如果把 uid 這件換上去，能力值會變成多少（比較用）。uid = null 表示卸下 slot。 */
export function statsIfSwapped(s: GameState, slot: Slot, uid: number | null): Stats {
  const equipped = { ...s.equipped, [slot]: uid };
  const gear = Object.values(equipped).map((u) => s.gear.find((g) => g.uid === u)).filter((g): g is Equip => !!g);
  return computeStats(s.classId, s.level, gear.map(equipStats));
}

/** 從背包使用消耗品。HP／MP 已滿且沒有異常時不使用，回傳 null。 */
export function useItem(s: GameState, name: string): string | null {
  if ((s.items[name] ?? 0) <= 0) return null;
  const st = statsOf(s);
  const v = { hp: s.hp, maxHp: st.maxHp, mp: s.mp, maxMp: st.maxMp, statuses: s.statuses };
  const before = JSON.stringify(v);
  const msg = applyItem(name, v);
  if (JSON.stringify(v) === before) return null;
  s.items[name]--; if (s.items[name] <= 0) delete s.items[name];
  s.hp = v.hp; s.mp = v.mp;
  return msg;
}

/** 目前的主線目標（顯示在畫面上方）。 */
export function currentObjective(flags: ReadonlySet<string>): string {
  if (!flags.has('talked_priest')) return '到北邊的神社找宮司爺爺';
  if (!flags.has('found_well')) return '調查東邊竹林深處的古井';
  if (!flags.has('prologue_done')) return '回神社向宮司爺爺報告';
  if (!flags.has('visited:b1')) return '從竹林的古井進入古井地城';
  if (!flags.has('visited:b2')) return '古井地城 B1：找到往下的路';
  if (!flags.has('visited:b3')) return '古井地城 B2：找到往下的路';
  if (!flags.has('reached_boss_door')) return '古井地城 B3：找到土蜘蛛的巢穴';
  if (!flags.has('boss_defeated')) return '打倒土蜘蛛，救出孩子們';
  return '第一章完成！感謝遊玩（第二章製作中）';
}

/** 全域唯一的進度。 */
export let gameState = newGameState();
export function resetGameState(classId?: ClassId, difficulty?: Difficulty): void { gameState = newGameState(classId, difficulty); }
export function setGameState(s: GameState): void { gameState = s; }
