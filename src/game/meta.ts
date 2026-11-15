// 第二期的共用邏輯：抽卡、模組、每日任務、成就。
import { ACHIEVEMENTS, AchStats, MAX_MOD_LEVEL, ModuleItem, RunStats, dailyMissions, moduleStats, todayKey, upgradeCost, dismantleValue } from '../config/meta';
import { EVOLUTIONS } from '../config/balance';
import { SaveData } from './storage';

export function equippedModules(s: SaveData): ModuleItem[] {
  return (Object.values(s.equipped ?? {}) as (string | null)[])
    .map((uid) => s.modules.find((m) => m.uid === uid))
    .filter((m): m is ModuleItem => !!m);
}

export function equippedStats(s: SaveData) {
  return moduleStats(equippedModules(s));
}

export function upgradeModule(s: SaveData, uid: string): boolean {
  const m = s.modules.find((x) => x.uid === uid);
  if (!m || m.level >= MAX_MOD_LEVEL) return false;
  const c = upgradeCost(m);
  if (s.parts < c) return false;
  s.parts -= c;
  m.level++;
  return true;
}

export function dismantle(s: SaveData, uids: string[]): number {
  let gain = 0;
  const equipped = new Set(Object.values(s.equipped));
  s.modules = s.modules.filter((m) => {
    if (!uids.includes(m.uid) || equipped.has(m.uid)) return true;
    gain += dismantleValue(m);
    return false;
  });
  s.parts += gain;
  return gain;
}

/** 確保每日任務是今天的 */
export function ensureDaily(s: SaveData) {
  const day = todayKey();
  if (s.dailyDay !== day) {
    s.dailyDay = day;
    s.dailyProgress = {};
    s.dailyClaimed = [];
  }
}

export function applyRunToDaily(s: SaveData, r: RunStats) {
  ensureDaily(s);
  for (const m of dailyMissions(s.dailyDay)) {
    const cur = s.dailyProgress[m.id] ?? 0;
    const p = m.progress(r);
    // 「單局連段」類型取最大值，其他累加
    s.dailyProgress[m.id] = m.id === 'combo' ? Math.max(cur, p) : cur + p;
  }
}

export function achStats(s: SaveData): AchStats {
  const evolved = new Set(EVOLUTIONS.map((e) => e.result));
  return {
    totalKills: s.totalKills,
    bossKills: s.bossKills,
    wins: s.wins,
    bestWanted: s.bestWanted ?? 0,
    iaiTotal: s.iaiTotal,
    relicsTotal: s.relicsTotal ?? 0,
    gachaPulls: s.gachaPulls ?? 0,
    ssrCount: s.ssrCount ?? 0,
    bestLevel: s.bestLevel,
    maxCombo: s.maxCombo ?? 0,
    totalCredits: s.totalCredits,
    evolutions: s.seenWeapons.filter((w) => evolved.has(w)).length,
    chars: s.chars.length,
    maxModuleLevel: Math.max(0, ...s.modules.map((m) => m.level)),
    dailyClears: s.dailyClears ?? 0,
    runs: s.runs,
  };
}

/** 可以領取的任務／成就數量（主選單紅點用） */
export function claimableCount(s: SaveData): number {
  ensureDaily(s);
  let n = 0;
  for (const m of dailyMissions(s.dailyDay)) if ((s.dailyProgress[m.id] ?? 0) >= m.target && !s.dailyClaimed.includes(m.id)) n++;
  const st = achStats(s);
  for (const a of ACHIEVEMENTS) if (a.check(st) && !s.achClaimed.includes(a.id)) n++;
  return n;
}
