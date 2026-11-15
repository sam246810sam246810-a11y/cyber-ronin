import { CHAPTERS } from '../data/chapters';
import { BUILDINGS, BUILDING_MAP, BuildingId, buildCost, buildSeconds, rushGems, AD_RUSH_SEC } from '../data/village';
import { ALL_PARTNERS, MAX_PLV, PARTNERS, PartnerId, RECRUITABLE, STARTER_PARTNERS, plvGold, shardCost } from '../data/partners';
import { Banner, DUPE_SHARDS, PULL_COST, STANDARD, WEEK_MS, limitedBanner, poolOf } from '../data/gacha';
import { DAILY_CHESTS, DAILY_QUESTS, PASS, PASS_FREE, PASS_PREMIUM, PASS_XP, Reward } from '../data/daily';
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
  daily: { date: string; freeChest: boolean; adGems: number; adEgg: boolean };
  offer: { expiresAt: number; lastShownAt: number; purchased: boolean };
  settings: { muted: boolean; vibrate: boolean; music: boolean; stopOnRelease: boolean };
  partners: Record<PartnerId, { lv: number; shards: number; owned: boolean }>;
  gacha: { pityStd: number; pityLim: number; limWeek: number; firstTen: boolean };
  tickets: number;
  dailyQ: { base: Record<string, number>; claimed: string[]; chests: number[] };
  pass: { season: number; xp: number; premium: boolean; free: number[]; prem: number[] };
  flags: { tutMove: boolean; tutMap: boolean; tutCard: boolean };
  activeRun: unknown | null;
  selectedChapter: number;
  village: { levels: Record<BuildingId, number>; building: { id: BuildingId; finishAt: number; total: number; adUsed: boolean } | null };
}

const KEY = 'pawstrike_save_v1';
const DAY = 86400000;

function fresh(): Save {
  const counters = {} as Record<CounterKey, number>;
  (['kills', 'rooms', 'runs', 'upgrades', 'merges', 'chests', 'eliteKills', 'bossKills', 'chapterClears', 'evolutions', 'logins', 'builds', 'recruits', 'pulls'] as CounterKey[])
    .forEach((k) => (counters[k] = 0));
  const s: Save = {
    v: 1, gold: 800, gems: 60, items: [], nextUid: 1,
    equipped: { weapon: null, armor: null, ring: null, collar: null },
    unlockedChapter: 1, best: {}, cleared: {}, counters,
    firstLaunch: Date.now(), dayOffset: 0, lastLoginDay: 0,
    carnival: { claimedTasks: [], claimedMilestones: [], packDays: [], bonusPoints: 0 },
    shop: { firstBuy: {}, anyPurchase: false, goldPity: 0, spentNtd: 0 },
    daily: { date: '', freeChest: false, adGems: 0, adEgg: false },
    offer: { expiresAt: 0, lastShownAt: 0, purchased: false },
    settings: { muted: false, vibrate: true, music: true, stopOnRelease: false },
    partners: Object.fromEntries(ALL_PARTNERS.map((p) => [p, { lv: 1, shards: 0, owned: p === 'shiba' || STARTER_PARTNERS.includes(p) }])) as Record<PartnerId, { lv: number; shards: number; owned: boolean }>,
    gacha: { pityStd: 0, pityLim: 0, limWeek: -1, firstTen: false },
    tickets: 0,
    dailyQ: { base: {}, claimed: [], chests: [] },
    pass: { season: 0, xp: 0, premium: false, free: [], prem: [] },
    flags: { tutMove: false, tutMap: false, tutCard: false },
    activeRun: null,
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

function migratePartners(base: Save['partners'], old: Partial<Save['partners']> | undefined, hall: number): Save['partners'] {
  const out = { ...base };
  // v0.3 以前沒有 owned：保留當時已經能用的夥伴（貓兔熊 + 依舊招募所等級解鎖的狐狸 / 企鵝 / 倉鼠）
  const legacy: PartnerId[] = ['cat', 'rabbit', 'bear', ...(hall >= 1 ? ['fox' as PartnerId] : []), ...(hall >= 2 ? ['penguin' as PartnerId] : []), ...(hall >= 3 ? ['hamster' as PartnerId] : [])];
  for (const p of ALL_PARTNERS) {
    const o = old?.[p];
    if (!o) continue;
    out[p] = { lv: o.lv ?? 1, shards: o.shards ?? 0, owned: o.owned ?? (base[p].owned || legacy.includes(p) || (o.lv ?? 1) > 1) };
  }
  return out;
}

export let save: Save = load();
save.village.levels.hall = Math.min(save.village.levels.hall ?? 0, 5);

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const base = fresh();
      const parsed = JSON.parse(raw) as Save;
      return { ...base, ...parsed, counters: { ...base.counters, ...parsed.counters }, settings: { ...base.settings, ...parsed.settings }, partners: migratePartners(base.partners, parsed.partners, parsed.village?.levels?.hall ?? 0), gacha: { ...base.gacha, ...(parsed.gacha ?? {}) }, dailyQ: { ...base.dailyQ, ...(parsed.dailyQ ?? {}) }, pass: { ...base.pass, ...(parsed.pass ?? {}) }, flags: { ...base.flags, ...(parsed.flags ?? {}) }, daily: { ...base.daily, ...parsed.daily }, village: { ...base.village, ...(parsed.village ?? {}), levels: { ...base.village.levels, ...(parsed.village?.levels ?? {}) } } };
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
  if (save.daily.date !== dateKey()) {
    save.daily = { date: dateKey(), freeChest: false, adGems: 0, adEgg: false };
    save.dailyQ = { base: { ...save.counters }, claimed: [], chests: [] };
  }
  const d = currentDay();
  if (d !== save.lastLoginDay) {
    save.lastLoginDay = d;
    save.counters.logins += 1;
    track('login', { day: d });
  }
  // 戰令換季
  const season = currentSeason();
  if (season !== save.pass.season) save.pass = { season, xp: 0, premium: false, free: [], prem: [] };
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

/** 已擁有、可在冒險中招募的夥伴 */
export function unlockedPartners(): PartnerId[] {
  return RECRUITABLE.filter((p) => save.partners[p]?.owned);
}

export function runBonus(): RunBonus {
  const hall = bLevel('hall');
  return {
    atkMul: 1 + 0.06 * bLevel('training'),
    hpMul: 1 + 0.07 * bLevel('clinic'),
    goldMul: 1 + 0.1 * bLevel('granary'),
    rerolls: bLevel('tower'),
    unlocked: unlockedPartners(),
    plv: Object.fromEntries(ALL_PARTNERS.map((p) => [p, save.partners[p]?.lv ?? 1])) as Record<PartnerId, number>,
    rescueChoices: hall >= 1 ? 3 : 2,
    startPartner: hall >= 2,
    startStar: hall >= 5 ? 3 : hall >= 3 ? 2 : 1,
    maxFollowers: hall >= 4 ? 7 : 6,
  };
}

export const villageCount = () => BUILDINGS.reduce((a, b) => a + bLevel(b.id), 0);

// ---------- 冒險結算 ----------
export interface RunReward { gold: number; gems: number; items: Item[]; shards: Partial<Record<PartnerId, number>> }

export function settleRun(r: { win: boolean; chapter: number; battles: number; rows: number; gold: number; kills: number; eliteKills: number; bossKills: number; evolutions: number; recruits: number; drops: { tpl: string; rarity: number }[]; shards: Partial<Record<PartnerId, number>> }): RunReward {
  const reward: RunReward = { gold: Math.round(r.gold), gems: 0, items: [], shards: r.shards };
  for (const [p, n] of Object.entries(r.shards)) addShards(p as PartnerId, n ?? 0);
  save.activeRun = null;
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
  addPassXp(r.battles * PASS_XP.perBattle + PASS_XP.perRun);
  persist();
  return reward;
}

// ---------- 夥伴碎片 ----------
export function addShards(p: PartnerId, n: number) {
  save.partners[p] = save.partners[p] ?? { lv: 1, shards: 0 };
  save.partners[p].shards += n;
}

export function canUpgradePartner(p: PartnerId): boolean {
  const d = save.partners[p];
  return d.lv < MAX_PLV && d.shards >= shardCost(d.lv) && save.gold >= plvGold(d.lv);
}

export function upgradePartner(p: PartnerId): boolean {
  if (!canUpgradePartner(p)) return false;
  const d = save.partners[p];
  d.shards -= shardCost(d.lv);
  save.gold -= plvGold(d.lv);
  d.lv++;
  bump('upgrades');
  track('partner_upgrade', { p, lv: d.lv });
  persist();
  return true;
}

// ---------- 夥伴召喚 ----------
export const weekIndex = () => Math.floor((now() - startOfDay(save.firstLaunch)) / WEEK_MS);
export const currentLimited = () => limitedBanner(weekIndex());
export const limitedEndsAt = () => startOfDay(save.firstLaunch) + (weekIndex() + 1) * WEEK_MS;

export interface PullResult { p: PartnerId; rarity: number; isNew: boolean; shards: number }

function rollOne(b: Banner, pityKey: 'pityStd' | 'pityLim', minRarity = 0): PartnerId {
  save.gacha[pityKey]++;
  let rarity = 0;
  let r = Math.random();
  for (let i = 0; i < b.odds.length; i++) { r -= b.odds[i]; if (r <= 0) { rarity = i; break; } }
  rarity = Math.max(rarity, minRarity);
  let pick: PartnerId | null = null;
  if (b.featured) {
    const fr = PARTNERS[b.featured].rarity;
    if (save.gacha.pityLim >= b.pity) pick = b.featured;            // 限時池：保底必得主打
    else if (rarity === fr && Math.random() < b.featuredShare!) pick = b.featured;
  } else if (save.gacha.pityStd >= b.pity) rarity = Math.max(rarity, b.pityMinRarity!);
  if (!pick) {
    let pool = poolOf(b, rarity);
    if (b.featured && rarity === PARTNERS[b.featured].rarity) pool = pool.filter((p) => p !== b.featured).length ? pool.filter((p) => p !== b.featured) : pool;
    if (!pool.length) pool = poolOf(b, 0);
    pick = pool[Math.floor(Math.random() * pool.length)];
  }
  const pr = PARTNERS[pick].rarity;
  if (b.featured) { if (pick === b.featured) save.gacha.pityLim = 0; }
  else if (pr >= b.pityMinRarity!) save.gacha.pityStd = 0;
  return pick;
}

export function pullCost(n: 1 | 10): { gems: number; tickets: number } {
  if (n === 10) return { gems: save.tickets >= 10 ? 0 : PULL_COST.ten, tickets: save.tickets >= 10 ? 10 : 0 };
  return { gems: save.tickets >= 1 ? 0 : PULL_COST.single, tickets: save.tickets >= 1 ? 1 : 0 };
}

/** 召喚；free = 每日廣告免費 / 新手十連 */
export function pull(bannerId: 'standard' | 'limited', n: 1 | 10, free: 'none' | 'ad' | 'starter' = 'none'): PullResult[] | null {
  const b = bannerId === 'standard' ? STANDARD : currentLimited();
  if (free === 'ad') { if (save.daily.adEgg) return null; save.daily.adEgg = true; }
  else if (free === 'starter') { if (save.gacha.firstTen) return null; save.gacha.firstTen = true; }
  else {
    const c = pullCost(n);
    if (save.gems < c.gems || save.tickets < c.tickets) return null;
    save.gems -= c.gems; save.tickets -= c.tickets;
  }
  const key = bannerId === 'standard' ? 'pityStd' : 'pityLim';
  const out: PullResult[] = [];
  for (let i = 0; i < n; i++) {
    // 十連最後一抽保底藍色以上；新手十連保底紫色以上
    const min = n === 10 && i === 9 && !out.some((x) => x.rarity >= 2) ? (free === 'starter' ? 3 : 2) : 0;
    const p = rollOne(b, key, min);
    const d = save.partners[p];
    const res: PullResult = { p, rarity: PARTNERS[p].rarity, isNew: !d.owned, shards: 0 };
    if (!d.owned) d.owned = true;
    else { res.shards = DUPE_SHARDS[res.rarity]; d.shards += res.shards; }
    out.push(res);
  }
  if (free === 'starter' && !out.some((x) => x.rarity >= 3)) {
    // 保險：新手十連至少一隻紫色
    const p = poolOf(b, 3)[0];
    out[9] = { p, rarity: 3, isNew: !save.partners[p].owned, shards: 0 };
    save.partners[p].owned = true;
  }
  bump('pulls', n);
  track('gacha_pull', { banner: b.id, n, free, got: out.map((x) => `${x.p}:${x.rarity}`) });
  persist();
  return out;
}

export const partnerUpgradable = () => ALL_PARTNERS.some((p) => save.partners[p].owned && canUpgradePartner(p));

// ---------- 獎勵 ----------
export function grant(r: Reward): string[] {
  const lines: string[] = [];
  if (r.gold) { save.gold += r.gold; lines.push(`🪙 +${r.gold}`); }
  if (r.gems) { save.gems += r.gems; lines.push(`💎 +${r.gems}`); }
  if (r.tickets) { save.tickets += r.tickets; lines.push(`🎟️ 召喚券 +${r.tickets}`); }
  if (r.shards) {
    const p = r.shards.p === 'random' ? RECRUITABLE[Math.floor(Math.random() * RECRUITABLE.length)] : r.shards.p;
    addShards(p, r.shards.n);
    lines.push(`${PARTNERS[p].icon} ${PARTNERS[p].name}碎片 +${r.shards.n}`);
  }
  return lines;
}

// ---------- 每日任務 ----------
export const dailyProgress = (id: string) => {
  const q = DAILY_QUESTS.find((x) => x.id === id)!;
  return Math.min(q.target, save.counters[q.key] - (save.dailyQ.base[q.key] ?? 0));
};
export const dailyDone = (id: string) => dailyProgress(id) >= DAILY_QUESTS.find((x) => x.id === id)!.target;
export const dailyPoints = () => DAILY_QUESTS.filter((q) => save.dailyQ.claimed.includes(q.id)).reduce((a, q) => a + q.pts, 0);
export const dailyClaimable = () => DAILY_QUESTS.some((q) => dailyDone(q.id) && !save.dailyQ.claimed.includes(q.id))
  || DAILY_CHESTS.some((c, i) => dailyPoints() >= c.pts && !save.dailyQ.chests.includes(i));

export function claimDaily(id: string): boolean {
  const q = DAILY_QUESTS.find((x) => x.id === id);
  if (!q || !dailyDone(id) || save.dailyQ.claimed.includes(id)) return false;
  save.dailyQ.claimed.push(id);
  addPassXp(q.pts * PASS_XP.perDailyPoint);
  track('daily_claim', { id });
  persist();
  return true;
}

export function claimDailyChest(i: number): string[] | null {
  const c = DAILY_CHESTS[i];
  if (!c || dailyPoints() < c.pts || save.dailyQ.chests.includes(i)) return null;
  save.dailyQ.chests.push(i);
  const lines = grant(c.reward);
  persist();
  return lines;
}

// ---------- 戰令 ----------
export const currentSeason = () => Math.floor((now() - startOfDay(save.firstLaunch)) / (PASS.seasonDays * DAY));
export const seasonEndsAt = () => startOfDay(save.firstLaunch) + (currentSeason() + 1) * PASS.seasonDays * DAY;
export const passLevel = () => Math.min(PASS.levels, Math.floor(save.pass.xp / PASS.xpPer));
export function addPassXp(n: number) { save.pass.xp = Math.min(PASS.levels * PASS.xpPer, save.pass.xp + n); }
export const passClaimable = () => {
  const lv = passLevel();
  for (let i = 0; i < lv; i++) if (!save.pass.free.includes(i) || (save.pass.premium && !save.pass.prem.includes(i))) return true;
  return false;
};

export function claimPass(i: number, premium: boolean): string[] | null {
  if (i >= passLevel()) return null;
  const list = premium ? save.pass.prem : save.pass.free;
  if (list.includes(i) || (premium && !save.pass.premium)) return null;
  list.push(i);
  const lines = grant((premium ? PASS_PREMIUM : PASS_FREE)[i]);
  track('pass_claim', { i, premium });
  persist();
  return lines;
}

export function buyPass() {
  if (save.pass.premium) return false;
  save.pass.premium = true;
  save.shop.spentNtd += PASS.ntd;
  if (!save.shop.anyPurchase) { addItemTo(save, FIRST_PURCHASE_GIFT.tpl, FIRST_PURCHASE_GIFT.rarity); save.shop.anyPurchase = true; }
  track('purchase', { sku: 'pass', ntd: PASS.ntd, simulated: true });
  persist();
  return true;
}

// ---------- 冒險存檔 ----------
export function saveRun(snapshot: unknown) { save.activeRun = snapshot; persist(); }
export function clearRun() { save.activeRun = null; persist(); }
