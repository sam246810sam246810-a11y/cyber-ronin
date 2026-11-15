import { CHAPTERS } from '../data/chapters';
import { BUILDINGS, BUILDING_MAP, BuildingId, buildCost, buildSeconds, rushGems, AD_RUSH_SEC } from '../data/village';
import { PARTNERS, PartnerId, RECRUITABLE } from '../data/partners';
import type { RunBonus } from '../game/run';
import { Item, MERGE_COUNT, RARITIES, SLOTS, Slot, TPL_MAP, itemStats, upgradeCost } from '../data/equipment';
import { CounterKey, QUESTS, MILESTONES, CARNIVAL_DAYS, CARNIVAL_CLAIM_DAYS, CARNIVAL_PACK, QuestDef } from '../data/quests';
import { BREAKTHROUGH_OFFER, CHESTS, ChestDef, FIRST_PURCHASE_GIFT, GEM_PACKS, DAILY_AD_GEMS } from '../data/shop';
import { track } from '../core/track';

export interface Save {
  v: 1;
  gold: number;
  gems: number;
  items: Item[];
  nextUid: number;
  equipped: Record<Slot, number | null>;
  unlockedChapter: number;
  best: Record<number, number>;
  cleared: Record<number, boolean>;
  counters: Record<CounterKey, number>;
  firstLaunch: number;
  dayOffset: number;
  lastLoginDay: number;
  carnival: { claimedTasks: string[]; claimedMilestones: number[]; packDays: number[]; bonusPoints: number };
  shop: { firstBuy: Record<string, boolean>; anyPurchase: boolean; goldPity: number; spentNtd: number };
  daily: { date: string; freeChest: boolean; adGems: number };
  offer: { expiresAt: number; lastShownAt: number; purchased: boolean };
  settings: { muted: boolean; vibrate: boolean };
  selectedChapter: number;
  village: { levels: Record<BuildingId, number>; building: { id: BuildingId; finishAt: number; total: number; adUsed: boolean } | null };
}

const KEY = 'pawstrike_save_v1';
const DAY = 86400000;

function fresh(): Save {
  const counters = {} as Record<CounterKey, number>;
  (['kills', 'rooms', 'runs', 'upgrades', 'merges', 'chests', 'eliteKills', 'bossKills', 'chapterClears', 'evolutions', 'logins', 'builds', 'recruits'] as CounterKey[])
    .forEach((k) => (counters[k] = 0));
  const s: Save = {
    v: 1, gold: 800, gems: 60, items: [], nextUid: 1,
    equipped: { weapon: null, armor: null, ring: null, collar: null },
    unlockedChapter: 1, best: {}, cleared: {}, counters,
    firstLaunch: Date.now(), dayOffset: 0, lastLoginDay: 0,
    carnival: { claimedTasks: [], claimedMilestones: [], packDays: [], bonusPoints: 0 },
    shop: { firstBuy: {}, anyPurchase: false, goldPity: 0, spentNtd: 0 },
    daily: { date: '', freeChest: false, adGems: 0 },
    offer: { expiresAt: 0, lastShownAt: 0, purchased: false },
    settings: { muted: false, vibrate: true },
    selectedChapter: 1,
    village: { levels: { training: 0, clinic: 0, hall: 0, granary: 0, tower: 0 }, building: null },
  };
  // 新手裝備
  const w = addItemTo(s, 'slingshot', 0);
  const a = addItemTo(s, 'leafvest', 0);
  s.equipped.weapon = w.uid;
  s.equipped.armor = a.uid;
  return s;
}

function addItemTo(s: Save, tpl: string, rarity: number, level = 1): Item {
  const it: Item = { uid: s.nextUid++, tpl, rarity, level };
  s.items.push(it);
  return it;
}

export let save: Save = load();

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const base = fresh();
      const parsed = JSON.parse(raw) as Save;
      return { ...base, ...parsed, counters: { ...base.counters, ...parsed.counters }, village: { ...base.village, ...(parsed.village ?? {}), levels: { ...base.village.levels, ...(parsed.village?.levels ?? {}) } } };
    }
  } catch { /* 損毀就重建 */ }
  return fresh();
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* */ }
}

export function resetSave() {
  save = fresh();
  persist();
}

// ---------- 時間 / 每日 ----------
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const now = () => Date.now() + save.dayOffset * DAY;
export function currentDay(): number {
  return Math.floor((startOfDay(now()) - startOfDay(save.firstLaunch)) / DAY) + 1;
}
const dateKey = () => new Date(now()).toDateString();

export function onBoot() {
  const d = currentDay();
  if (d !== save.lastLoginDay) {
    save.lastLoginDay = d;
    save.counters.logins += 1;
    track('login', { day: d });
  }
  if (save.daily.date !== dateKey()) save.daily = { date: dateKey(), freeChest: false, adGems: 0 };
  persist();
}

export function debugNextDay() {
  save.dayOffset += 1;
  onBoot();
}

export function bump(key: CounterKey, n = 1) { save.counters[key] += n; }

// ---------- 戰力 / 屬性 ----------
export interface BaseStats { atk: number; maxHp: number; aspd: number; crit: number; critDmg: number; dmgReduce: number; speed: number }
export const BASE: BaseStats = { atk: 100, maxHp: 800, aspd: 1.6, crit: 0.05, critDmg: 2, dmgReduce: 0, speed: 230 };

export function playerStats(): BaseStats {
  const s = { ...BASE };
  let aspdBonus = 0;
  for (const slot of SLOTS) {
    const it = equippedItem(slot);
    if (!it) continue;
    const st = itemStats(it);
    s.atk += st.atk ?? 0;
    s.maxHp += st.hp ?? 0;
    aspdBonus += st.aspd ?? 0;
    s.crit += st.crit ?? 0;
    s.critDmg += st.critDmg ?? 0;
    s.dmgReduce += st.dmgReduce ?? 0;
  }
  s.aspd *= 1 + aspdBonus;
  s.dmgReduce = Math.min(0.5, s.dmgReduce);
  return s;
}

export function power(st = playerStats()): number {
  return Math.round(st.atk * 3 * (st.aspd / BASE.aspd) * (1 + st.crit * (st.critDmg - 1)) + st.maxHp * 0.5 * (1 + st.dmgReduce));
}

// ---------- 裝備 ----------
export const findItem = (uid: number | null) => (uid == null ? undefined : save.items.find((i) => i.uid === uid));
export const equippedItem = (slot: Slot) => findItem(save.equipped[slot]);
export const isEquipped = (uid: number) => SLOTS.some((s) => save.equipped[s] === uid);

export function equip(uid: number) {
  const it = findItem(uid);
  if (!it) return;
  save.equipped[TPL_MAP[it.tpl].slot] = uid;
  persist();
}

export function addItem(tpl: string, rarity: number): Item {
  const it = addItemTo(save, tpl, rarity);
  persist();
  return it;
}

export function upgrade(uid: number): boolean {
  const it = findItem(uid);
  if (!it) return false;
  if (it.level >= RARITIES[it.rarity].maxLv) return false;
  const c = upgradeCost(it.level);
  if (save.gold < c) return false;
  save.gold -= c;
  it.level++;
  bump('upgrades');
  track('equip_upgrade', { tpl: it.tpl, rarity: it.rarity, level: it.level });
  persist();
  return true;
}

/** 找出可以和 uid 合成的另外兩件（同模板、同稀有度、未裝備優先） */
export function mergePartners(uid: number): Item[] {
  const it = findItem(uid);
  if (!it || it.rarity >= RARITIES.length - 1) return [];
  return save.items
    .filter((o) => o.uid !== uid && o.tpl === it.tpl && o.rarity === it.rarity)
    .sort((a, b) => Number(isEquipped(a.uid)) - Number(isEquipped(b.uid)) || a.level - b.level)
    .slice(0, MERGE_COUNT - 1);
}

export function merge(uid: number): Item | null {
  const it = findItem(uid);
  const partners = mergePartners(uid);
  if (!it || partners.length < MERGE_COUNT - 1) return null;
  const all = [it, ...partners];
  const keepSlotEquipped = all.some((i) => isEquipped(i.uid));
  // 退還被吃掉那兩件已投入的部分金幣（50%），避免強化錯件的挫折
  let refund = 0;
  for (const p of partners) for (let l = 1; l < p.level; l++) refund += Math.floor(upgradeCost(l) * 0.5);
  save.items = save.items.filter((i) => !partners.includes(i));
  it.rarity += 1;
  it.level = Math.max(...all.map((i) => i.level));
  save.gold += refund;
  if (keepSlotEquipped) save.equipped[TPL_MAP[it.tpl].slot] = it.uid;
  bump('merges');
  track('equip_merge', { tpl: it.tpl, toRarity: it.rarity });
  persist();
  return it;
}

/** 一鍵合成所有可合成的裝備 */
export function mergeAll(): number {
  let n = 0;
  let again = true;
  while (again) {
    again = false;
    const sorted = [...save.items].sort((a, b) => Number(isEquipped(b.uid)) - Number(isEquipped(a.uid)) || b.level - a.level);
    for (const it of sorted) {
      if (!save.items.includes(it)) continue;
      if (mergePartners(it.uid).length >= MERGE_COUNT - 1) { merge(it.uid); n++; again = true; break; }
    }
  }
  return n;
}

// ---------- 寶箱 ----------
export function randomTpl(): string {
  const all = Object.keys(TPL_MAP);
  return all[Math.floor(Math.random() * all.length)];
}

function rollRarity(odds: number[]): number {
  let r = Math.random();
  for (let i = 0; i < odds.length; i++) { r -= odds[i]; if (r <= 0) return i; }
  return odds.findIndex((o) => o > 0);
}

export function canAffordChest(c: ChestDef, free = false) {
  if (free) return true;
  return (c.cost.gold ?? 0) <= save.gold && (c.cost.gems ?? 0) <= save.gems;
}

export function openChest(id: string, free = false): Item | null {
  const c = CHESTS.find((x) => x.id === id)!;
  if (!canAffordChest(c, free)) return null;
  if (!free) { save.gold -= c.cost.gold ?? 0; save.gems -= c.cost.gems ?? 0; }
  else save.daily.freeChest = true;
  let rarity = rollRarity(c.odds);
  if (c.pity) {
    save.shop.goldPity += 1;
    if (save.shop.goldPity >= c.pity.every) rarity = Math.max(rarity, c.pity.minRarity);
    if (rarity >= c.pity.minRarity) save.shop.goldPity = 0;
  }
  const it = addItemTo(save, randomTpl(), rarity);
  bump('chests');
  track('chest_open', { chest: id, rarity, free });
  persist();
  return it;
}

// ---------- 模擬金流 ----------
export function buyGemPack(id: string): { gems: number; bonus: number; gift: Item | null } {
  const p = GEM_PACKS.find((x) => x.id === id)!;
  const bonus = save.shop.firstBuy[id] ? 0 : p.gems;
  save.shop.firstBuy[id] = true;
  save.gems += p.gems + bonus;
  let gift: Item | null = null;
  if (!save.shop.anyPurchase) { gift = addItemTo(save, FIRST_PURCHASE_GIFT.tpl, FIRST_PURCHASE_GIFT.rarity); save.shop.anyPurchase = true; }
  save.shop.spentNtd += p.ntd;
  track('purchase', { sku: id, ntd: p.ntd, simulated: true });
  persist();
  return { gems: p.gems, bonus, gift };
}

export function watchAdForGems(): boolean {
  if (save.daily.adGems >= DAILY_AD_GEMS.max) return false;
  save.daily.adGems += 1;
  save.gems += DAILY_AD_GEMS.perAd;
  track('ad_reward', { kind: 'gems' });
  persist();
  return true;
}

// ---------- 突破禮包 ----------
export function offerActive() { return !save.offer.purchased && save.offer.expiresAt > now(); }

export function maybeTriggerOffer(ctx: { reachedBoss: boolean; bossHpPct: number | null; rows: number }): boolean {
  if (save.offer.purchased) return false;
  if (offerActive()) return true; // 已在倒數中，再提醒一次
  const close = (ctx.reachedBoss && (ctx.bossHpPct ?? 1) <= 0.5) || ctx.rows >= 6;
  if (!close) return false;
  if (now() - save.offer.lastShownAt < BREAKTHROUGH_OFFER.cooldownMs) return false;
  save.offer.expiresAt = now() + BREAKTHROUGH_OFFER.durationMs;
  save.offer.lastShownAt = now();
  track('offer_show', { id: 'breakthrough', ...ctx });
  persist();
  return true;
}

export function buyOffer() {
  const o = BREAKTHROUGH_OFFER;
  save.gems += o.gems;
  save.gold += o.gold;
  const it = addItemTo(save, o.item.tpl, o.item.rarity);
  save.offer.purchased = true;
  save.shop.spentNtd += o.ntd;
  if (!save.shop.anyPurchase) { addItemTo(save, FIRST_PURCHASE_GIFT.tpl, FIRST_PURCHASE_GIFT.rarity); save.shop.anyPurchase = true; }
  track('purchase', { sku: o.id, ntd: o.ntd, simulated: true });
  persist();
  return it;
}

// ---------- 嘉年華 ----------
export function carnivalEnded() { return currentDay() > CARNIVAL_CLAIM_DAYS; }
export const questUnlocked = (q: QuestDef) => q.day <= Math.min(currentDay(), CARNIVAL_DAYS);
export const questDone = (q: QuestDef) => save.counters[q.key] >= q.target;
export const questClaimed = (q: QuestDef) => save.carnival.claimedTasks.includes(q.id);

export function carnivalPoints() {
  return QUESTS.filter(questClaimed).reduce((a, q) => a + q.points, 0) + save.carnival.bonusPoints;
}

export function claimQuest(id: string): boolean {
  const q = QUESTS.find((x) => x.id === id);
  if (!q || !questUnlocked(q) || !questDone(q) || questClaimed(q) || carnivalEnded()) return false;
  save.carnival.claimedTasks.push(id);
  track('quest_claim', { id, points: q.points });
  persist();
  return true;
}

export function claimMilestone(i: number): Item | null | boolean {
  const m = MILESTONES[i];
  if (!m || carnivalPoints() < m.points || save.carnival.claimedMilestones.includes(i)) return false;
  save.carnival.claimedMilestones.push(i);
  save.gold += m.gold ?? 0;
  save.gems += m.gems ?? 0;
  const it = m.item ? addItemTo(save, m.item.tpl, m.item.rarity) : null;
  track('milestone_claim', { i, points: m.points });
  persist();
  return it ?? true;
}

export function buyCarnivalPack(): boolean {
  const d = currentDay();
  if (save.carnival.packDays.includes(d) || carnivalEnded()) return false;
  save.carnival.packDays.push(d);
  save.carnival.bonusPoints += CARNIVAL_PACK.points;
  save.gems += CARNIVAL_PACK.gems;
  save.shop.spentNtd += CARNIVAL_PACK.ntd;
  if (!save.shop.anyPurchase) { addItemTo(save, FIRST_PURCHASE_GIFT.tpl, FIRST_PURCHASE_GIFT.rarity); save.shop.anyPurchase = true; }
  track('purchase', { sku: 'carnival_pack', ntd: CARNIVAL_PACK.ntd, simulated: true });
  persist();
  return true;
}

// ---------- 村莊 ----------
export const bLevel = (id: BuildingId) => save.village.levels[id] ?? 0;

/** 若建造已完成就結算；回傳是否有變化 */
export function tickVillage(): boolean {
  const b = save.village.building;
  if (b && now() >= b.finishAt) {
    save.village.levels[b.id] = bLevel(b.id) + 1;
    save.village.building = null;
    bump('builds');
    track('build_done', { id: b.id, lv: bLevel(b.id) });
    persist();
    return true;
  }
  return false;
}

export function startBuild(id: BuildingId): string | null {
  tickVillage();
  const def = BUILDING_MAP[id];
  const lv = bLevel(id);
  if (lv >= def.maxLv) return '已達最高等級';
  if (save.village.building) return '建築師正在忙碌中';
  const cost = buildCost(def, lv);
  if (save.gold < cost) return '金幣不足';
  save.gold -= cost;
  const sec = buildSeconds(lv);
  save.village.building = { id, finishAt: now() + sec * 1000, total: sec, adUsed: false };
  track('build_start', { id, toLv: lv + 1, cost, sec });
  persist();
  return null;
}

export function buildRemainSec(): number {
  const b = save.village.building;
  return b ? Math.max(0, Math.ceil((b.finishAt - now()) / 1000)) : 0;
}

export function rushBuild(): boolean {
  const b = save.village.building;
  if (!b) return false;
  const gems = rushGems(buildRemainSec());
  if (save.gems < gems) return false;
  save.gems -= gems;
  b.finishAt = now();
  track('build_rush', { id: b.id, gems });
  tickVillage();
  return true;
}

export function adRushBuild(): boolean {
  const b = save.village.building;
  if (!b || b.adUsed) return false;
  b.adUsed = true;
  b.finishAt -= AD_RUSH_SEC * 1000;
  track('ad_reward', { kind: 'build_rush' });
  tickVillage();
  persist();
  return true;
}

export function unlockedPartners(): PartnerId[] {
  const hall = bLevel('hall');
  return RECRUITABLE.filter((p) => PARTNERS[p].unlockHall <= hall);
}

export function runBonus(): RunBonus {
  const hall = bLevel('hall');
  return {
    atkMul: 1 + 0.06 * bLevel('training'),
    hpMul: 1 + 0.07 * bLevel('clinic'),
    goldMul: 1 + 0.1 * bLevel('granary'),
    rerolls: bLevel('tower'),
    unlocked: unlockedPartners(),
    startPartner: hall >= 4,
    startStar: hall >= 6 ? 3 : hall >= 5 ? 2 : 1,
  };
}

export const villageCount = () => BUILDINGS.reduce((a, b) => a + bLevel(b.id), 0);

// ---------- 冒險結算 ----------
export interface RunReward { gold: number; gems: number; items: Item[] }

export function settleRun(r: { win: boolean; chapter: number; battles: number; rows: number; gold: number; kills: number; eliteKills: number; bossKills: number; evolutions: number; recruits: number; drops: { tpl: string; rarity: number }[] }): RunReward {
  const reward: RunReward = { gold: Math.round(r.gold), gems: 0, items: [] };
  reward.gold += r.battles * 25 * r.chapter;
  for (const d of r.drops) reward.items.push(addItemTo(save, d.tpl, d.rarity));
  if (r.win) {
    reward.items.push(addItemTo(save, randomTpl(), Math.min(2, r.chapter)));
    reward.items.push(addItemTo(save, randomTpl(), Math.random() < 0.5 ? 1 : 0));
  }
  if (r.win && !save.cleared[r.chapter]) {
    reward.gems += CHAPTERS[r.chapter - 1].firstClearGems;
    save.cleared[r.chapter] = true;
    save.unlockedChapter = Math.max(save.unlockedChapter, Math.min(CHAPTERS.length, r.chapter + 1));
  }
  save.gold += reward.gold;
  save.gems += reward.gems;
  save.best[r.chapter] = Math.max(save.best[r.chapter] ?? 0, r.rows);
  bump('runs'); bump('kills', r.kills); bump('rooms', r.battles);
  bump('eliteKills', r.eliteKills); bump('bossKills', r.bossKills); bump('evolutions', r.evolutions); bump('recruits', r.recruits);
  if (r.win) bump('chapterClears');
  persist();
  return reward;
}
