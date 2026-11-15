// 三池扭蛋的共用邏輯：付費、抽卡、角色升星、式神等級與加成。
import { CHARACTERS, CharId } from '../config/balance';
import { CHAR_POOL, CHAR_RARITY, DUP_SHARDS, MAX_STAR, POOLS, PoolId, SPIRITS, SPIRIT_SETS, STAR_COST, SpiritId, spiritLevel, starStats } from '../config/gacha';
import { ModuleItem, StatKey, makeModule } from '../config/meta';
import { SaveData } from './storage';

export type Rar = 0 | 1 | 2 | 3;

export type PullItem =
  | { kind: 'module'; rarity: Rar; module: ModuleItem }
  | { kind: 'credits'; rarity: Rar; amount: number }
  | { kind: 'char'; rarity: Rar; char: CharId; isNew: boolean; shards: number }
  | { kind: 'shards'; rarity: Rar; char: CharId | 'wild'; amount: number }
  | { kind: 'spirit'; rarity: Rar; spirit: SpiritId; isNew: boolean; lv: number; lvUp: boolean }
  | { kind: 'jade'; rarity: Rar; amount: number };

/** 用抽卡券或晶片付費；回傳用了哪一種，不夠時回傳 null */
export function payMethod(s: SaveData, pool: PoolId, n: 1 | 10): 'ticket' | 'chips' | null {
  if ((s.tickets[pool] ?? 0) >= n) return 'ticket';
  const cost = n === 10 ? POOLS[pool].ten : POOLS[pool].single;
  return s.chips >= cost ? 'chips' : null;
}

function getPity(s: SaveData, pool: PoolId): number {
  return pool === 'equip' ? s.pity : s.pities[pool];
}

function setPity(s: SaveData, pool: PoolId, v: number) {
  if (pool === 'equip') s.pity = v;
  else s.pities[pool] = v;
}

export function pityLeft(s: SaveData, pool: PoolId): number {
  return POOLS[pool].pity - getPity(s, pool);
}

function rollRar(pool: PoolId, s: SaveData): Rar {
  const p = getPity(s, pool) + 1;
  setPity(s, pool, p);
  let r: Rar;
  if (p >= POOLS[pool].pity) r = 3;
  else {
    const [, r1, r2, r3] = POOLS[pool].rates;
    const x = Math.random();
    r = x < r3 ? 3 : x < r3 + r2 ? 2 : x < r3 + r2 + r1 ? 1 : 0;
  }
  if (r === 3) setPity(s, pool, 0);
  return r;
}

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function grant(s: SaveData, pool: PoolId, r: Rar): PullItem {
  if (pool === 'equip') {
    const module = makeModule(r);
    s.modules.push(module);
    return { kind: 'module', rarity: r, module };
  }
  if (pool === 'char') {
    const ids = Object.keys(CHARACTERS) as CharId[];
    if (r === 0) {
      s.credits += CHAR_POOL.nCredits;
      return { kind: 'credits', rarity: r, amount: CHAR_POOL.nCredits };
    }
    if (r === 1) {
      const c = pick(ids);
      s.shards[c] = (s.shards[c] ?? 0) + CHAR_POOL.rShards;
      return { kind: 'shards', rarity: r, char: c, amount: CHAR_POOL.rShards };
    }
    if (r === 3) {
      s.wildShards += CHAR_POOL.ssrShards;
      return { kind: 'shards', rarity: r, char: 'wild', amount: CHAR_POOL.ssrShards };
    }
    // SR：抽到角色本身
    const c = pick(ids.filter((id) => CHAR_RARITY[id] >= 2));
    if (!s.chars.includes(c)) {
      s.chars.push(c);
      s.stars[c] = 1;
      return { kind: 'char', rarity: r, char: c, isNew: true, shards: 0 };
    }
    const n = DUP_SHARDS[CHAR_RARITY[c]];
    s.shards[c] = (s.shards[c] ?? 0) + n;
    return { kind: 'char', rarity: r, char: c, isNew: false, shards: n };
  }
  // 靈物池：N＝靈玉，R／SR／SSR＝對應稀有度的式神
  if (r === 0) {
    s.jade += 1;
    return { kind: 'jade', rarity: r, amount: 1 };
  }
  const sp = pick(SPIRITS.filter((x) => x.rarity === r));
  const before = s.spirits[sp.id] ?? 0;
  s.spirits[sp.id] = before + 1;
  const lv = spiritLevel(before + 1);
  return { kind: 'spirit', rarity: r, spirit: sp.id, isNew: before === 0, lv, lvUp: lv > spiritLevel(before) };
}

/** 抽卡：直接改存檔物件，回傳抽到的東西 */
export function pullPool(s: SaveData, pool: PoolId, n: 1 | 10): PullItem[] | null {
  const pay = payMethod(s, pool, n);
  if (!pay) return null;
  if (pay === 'ticket') s.tickets[pool] -= n;
  else s.chips -= n === 10 ? POOLS[pool].ten : POOLS[pool].single;
  const rars: Rar[] = [];
  for (let i = 0; i < n; i++) rars.push(rollRar(pool, s));
  // 十連保底：至少一個 SR
  if (n === 10 && !rars.some((r) => r >= 2)) rars[rars.findIndex((r) => r <= 1)] = 2;
  const out = rars.map((r) => grant(s, pool, r));
  s.gachaPulls += n;
  s.ssrCount += rars.filter((r) => r === 3).length;
  return out;
}

// ---------- 角色星級 ----------
export function starOf(s: SaveData, c: CharId): number {
  return s.chars.includes(c) ? Math.max(1, s.stars[c] ?? 1) : 0;
}

/** 升星需要的碎片；已滿星回傳 0 */
export function starUpCost(s: SaveData, c: CharId): number {
  const st = starOf(s, c);
  return st === 0 || st >= MAX_STAR ? 0 : STAR_COST[st];
}

export function canStarUp(s: SaveData, c: CharId): boolean {
  const cost = starUpCost(s, c);
  return cost > 0 && (s.shards[c] ?? 0) + s.wildShards >= cost;
}

/** 升星：先用該角色的碎片，不夠再用萬能碎片 */
export function starUp(s: SaveData, c: CharId): boolean {
  if (!canStarUp(s, c)) return false;
  let cost = starUpCost(s, c);
  const own = Math.min(s.shards[c] ?? 0, cost);
  s.shards[c] = (s.shards[c] ?? 0) - own;
  cost -= own;
  s.wildShards -= cost;
  s.stars[c] = starOf(s, c) + 1;
  return true;
}

// ---------- 式神 ----------
export function spiritLv(s: SaveData, id: SpiritId): number {
  return spiritLevel(s.spirits[id] ?? 0);
}

export function setComplete(s: SaveData, members: SpiritId[]): boolean {
  return members.every((m) => spiritLv(s, m) >= 1);
}

/** 所有式神（含圖鑑組合）的永久加成 */
export function spiritStats(s: SaveData): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  const add = (k: StatKey, v: number) => (out[k] = (out[k] ?? 0) + v);
  for (const sp of SPIRITS) {
    const lv = spiritLv(s, sp.id);
    if (lv > 0) add(sp.stat, sp.per * lv);
  }
  for (const set of SPIRIT_SETS) if (setComplete(s, set.members)) for (const [k, v] of Object.entries(set.bonus)) add(k as StatKey, v);
  return out;
}

/** 用一顆靈玉餵給已擁有的式神 */
export function feedJade(s: SaveData, id: SpiritId): boolean {
  if (s.jade < 1 || !(s.spirits[id] ?? 0) || spiritLv(s, id) >= 10) return false;
  s.jade--;
  s.spirits[id] = (s.spirits[id] ?? 0) + 1;
  return true;
}

/** 出戰時的總加成：義體模組＋式神＋角色星級 */
export function mergeStats(...parts: Partial<Record<StatKey, number>>[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k as StatKey] = (out[k as StatKey] ?? 0) + (v ?? 0);
  return out;
}

export function charStats(s: SaveData, c: CharId) {
  return starStats(starOf(s, c));
}
