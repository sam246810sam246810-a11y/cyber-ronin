// 等級與能力值（PRD 5）。純函式。
import classes from '../data/classes.json';
import { sumStats, type StatBlock } from './equipment';

export const LEVEL_CAP = 30; // 第五章開放到 Lv30（PRD 5.1 全遊戲上限）
export const JOB_LEVEL = 10; // 轉職等級（PRD 4.3）
export const JOB_BONUS = 1.1; // 轉職後屬性 +10%

/** 升到下一級所需經驗：floor(20 × L^1.6) */
export function expToNext(level: number): number { return Math.floor(20 * Math.pow(level, 1.6)); }

/** 加經驗。回傳新的等級、剩餘經驗、升了幾級。滿級後經驗不再累積。 */
export function addExp(level: number, exp: number, gain: number): { level: number; exp: number; gained: number } {
  let l = level, e = exp + gain, gained = 0;
  while (l < LEVEL_CAP && e >= expToNext(l)) { e -= expToNext(l); l++; gained++; }
  if (l >= LEVEL_CAP) e = 0;
  return { level: l, exp: e, gained };
}

/** 每級成長（PRD 5.1） */
export const GROWTH: Record<keyof typeof classes, { hp: number; mp: number; atk: number; def: number; spd: number }> = {
  swordsman: { hp: 12, mp: 3, atk: 2, def: 2, spd: 0 },
  archer: { hp: 9, mp: 3, atk: 2, def: 1, spd: 1 },
  onmyoji: { hp: 8, mp: 6, atk: 2, def: 1, spd: 0 },
};

export interface Stats { maxHp: number; maxMp: number; atk: number; def: number; spd: number; crit: number; mpRegen: number }

/** 最終能力 =（職業基礎 + 成長 ×（等級−1）+ 裝備固定值）×（1 + 百分比詞條） */
export function computeStats(classId: keyof typeof classes, level: number, gear: StatBlock[], advanced = false): Stats {
  const c = classes[classId], g = GROWTH[classId], n = level - 1;
  const eq = sumStats(gear);
  const j = advanced ? JOB_BONUS : 1;
  const atk = (c.atk + g.atk * n + (eq.atk ?? 0)) * (1 + (eq.atkPct ?? 0) / 100) * j;
  const def = (c.def + g.def * n + (eq.def ?? 0)) * (1 + (eq.defPct ?? 0) / 100) * j;
  return {
    maxHp: Math.round((c.hp + g.hp * n + (eq.hp ?? 0)) * j),
    maxMp: Math.round((c.mp + g.mp * n + (eq.mp ?? 0)) * j),
    atk: Math.round(atk),
    def: Math.round(def),
    spd: c.spd + g.spd * n + (eq.spd ?? 0),
    crit: 5 + (eq.crit ?? 0),
    mpRegen: Math.round((1 + (eq.mpRegen ?? 0)) * 10) / 10,
  };
}
