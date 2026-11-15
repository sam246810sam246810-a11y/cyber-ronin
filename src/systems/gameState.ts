// 遊戲進度。M6 會把它存進 localStorage。
import classes from '../data/classes.json';
import { applyItem, type Difficulty, type Rng, type Statuses } from './combat';
import { BASES, canUse, equipName, equipStats, generateEquip, RARITIES, type BaseId, type Equip, type Slot } from './equipment';
import { BAG_START, canAddGear, canAddItem, type Bag } from './inventory';
import { addExp, computeStats, JOB_LEVEL, type Stats } from './progression';
import jobs from '../data/jobs.json';

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
  /** 轉職後的職業（PRD 4.3），沒轉職是 null */
  job: string | null;
  /** 技能鈕上裝的 2 個技能 */
  skillSlots: [string, string];
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
    job: null, skillSlots: [c.skills[0], c.skills[1]] as [string, string],
  };
  const st = statsOf(s); s.hp = st.maxHp; s.mp = st.maxMp;
  return s;
}

export function equippedGear(s: GameState): Equip[] {
  return Object.values(s.equipped).map((u) => s.gear.find((g) => g.uid === u)).filter((g): g is Equip => !!g);
}

/** 目前的最終能力值（等級＋裝備） */
export function statsOf(s: GameState): Stats {
  return computeStats(s.classId, s.level, equippedGear(s).map(equipStats), !!s.job);
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
  return computeStats(s.classId, s.level, gear.map(equipStats), !!s.job);
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

/** 已經學會的技能：基本 2 個＋Lv6、Lv9 各 1 個＋轉職後 2 個 */
export function learnedSkills(s: GameState): string[] {
  const c = classes[s.classId] as { skills: string[]; later: Record<string, number> };
  const out = [...c.skills, ...Object.entries(c.later).filter(([, lv]) => s.level >= lv).map(([id]) => id)];
  if (s.job) out.push(...(jobs as Record<string, { skills: string[] }>)[s.job].skills);
  return out;
}

/** 把技能裝到第 slot 個技能鈕；已經裝在另一格就交換 */
export function setSkillSlot(s: GameState, slot: 0 | 1, skill: string): boolean {
  if (!learnedSkills(s).includes(skill)) return false;
  const other = slot === 0 ? 1 : 0;
  if (s.skillSlots[other] === skill) s.skillSlots[other] = s.skillSlots[slot];
  s.skillSlots[slot] = skill;
  return true;
}

export function canChangeJob(s: GameState): boolean { return !s.job && s.level >= JOB_LEVEL && s.flags.has('chapter1_done'); }

/** 轉職：屬性 +10%，學會 2 個新技能並裝到技能鈕上 */
export function changeJob(s: GameState, job: string): boolean {
  const j = (jobs as Record<string, { base: string; skills: string[] }>)[job];
  if (!j || j.base !== s.classId || !canChangeJob(s)) return false;
  s.job = job;
  s.skillSlots = [j.skills[0], j.skills[1]];
  const st = statsOf(s); s.hp = st.maxHp; s.mp = st.maxMp;
  return true;
}

export function className(s: GameState): string {
  return s.job ? (jobs as Record<string, { name: string }>)[s.job].name : classes[s.classId].name;
}

/** 目前的主線目標（顯示在畫面上方）。 */
export function currentObjective(flags: ReadonlySet<string>): string {
  // 先看章節：已經結束的章節不再回頭看裡面的旗標
  if (flags.has('chapter3_done')) return '第三章完成！感謝遊玩（第四章製作中）';
  if (flags.has('chapter2_done')) {
    if (!flags.has('ch3_started')) return '第三章：到神社找宮司爺爺';
    if (!flags.has('visited:mountain')) return '從狐火村西邊前往天狗山';
    if (!flags.has('gate:trials')) {
      const t = ['power', 'wisdom', 'speed'].filter((k) => flags.has(`trial:${k}`)).length;
      return `天狗山：通過三個試煉（${t}/3）`;
    }
    if (!flags.has('visited:tengu_temple')) return '登上山頂，進入天狗寺';
    if (!flags.has('reached_tengu_door')) return '天狗寺：找到大天狗';
    return '通過大天狗的考驗';
  }
  if (flags.has('chapter1_done')) {
    if (!flags.has('ch2_started')) return '第二章：到神社找宮司爺爺';
    if (!flags.has('visited:swamp')) return '從狐火村南邊前往河童沼澤';
    if (!flags.has('gate:swamp')) return '河童沼澤：拉下三個水門拉桿，打開往水神祠的路';
    if (!flags.has('visited:suijin1')) return '進入沼澤小島上的水神祠';
    if (!flags.has('visited:suijin2')) return '水神祠 B1：找到往下的路';
    if (!flags.has('reached_kappa_door')) return '水神祠 B2：找到河童王';
    return '打倒河童王，解開沼澤的異變';
  }
  if (!flags.has('talked_priest')) return '到北邊的神社找宮司爺爺';
  if (!flags.has('found_well')) return '調查東邊竹林深處的古井';
  if (!flags.has('prologue_done')) return '回神社向宮司爺爺報告';
  if (!flags.has('visited:b1')) return '從竹林的古井進入古井地城';
  if (!flags.has('visited:b2')) return '古井地城 B1：找到往下的路';
  if (!flags.has('visited:b3')) return '古井地城 B2：找到往下的路';
  if (!flags.has('reached_boss_door')) return '古井地城 B3：找到土蜘蛛的巢穴';
  return '打倒土蜘蛛，救出孩子們';
}

/** 全域唯一的進度。 */
export let gameState = newGameState();
export function resetGameState(classId?: ClassId, difficulty?: Difficulty): void { gameState = newGameState(classId, difficulty); }
export function setGameState(s: GameState): void { gameState = s; }
