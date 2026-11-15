import type { CounterKey } from './quests';
import type { PartnerId } from './partners';

// ---- 每日任務（每天重置）----
export interface DailyQuest { id: string; text: string; key: CounterKey; target: number; pts: number }
export const DAILY_QUESTS: DailyQuest[] = [
  { id: 'login', text: '登入遊戲', key: 'logins', target: 1, pts: 20 },
  { id: 'battles', text: '完成 3 場戰鬥', key: 'rooms', target: 3, pts: 20 },
  { id: 'kills', text: '擊倒 80 個敵人', key: 'kills', target: 80, pts: 20 },
  { id: 'pull', text: '召喚夥伴 1 次', key: 'pulls', target: 1, pts: 20 },
  { id: 'upgrade', text: '升級裝備或夥伴 1 次', key: 'upgrades', target: 1, pts: 20 },
];
export interface Reward { gold?: number; gems?: number; tickets?: number; shards?: { p: PartnerId | 'random'; n: number } }
export const DAILY_CHESTS: { pts: number; reward: Reward }[] = [
  { pts: 40, reward: { gold: 1000 } },
  { pts: 70, reward: { gems: 50 } },
  { pts: 100, reward: { tickets: 1 } },
];

// ---- 戰令（28 天一季）----
export const PASS = { levels: 20, xpPer: 100, ntd: 150, seasonDays: 28 };
/** 每一級的免費 / 豪華獎勵 */
export const PASS_FREE: Reward[] = Array.from({ length: PASS.levels }, (_, i) => {
  const lv = i + 1;
  if (lv % 5 === 0) return { tickets: 1 };
  if (lv % 2 === 0) return { gems: 30 };
  return { gold: 800 + lv * 100 };
});
export const PASS_PREMIUM: Reward[] = Array.from({ length: PASS.levels }, (_, i) => {
  const lv = i + 1;
  if (lv === 20) return { shards: { p: 'dragon', n: 80 } };
  if (lv === 10) return { shards: { p: 'unicorn', n: 50 } };
  if (lv % 5 === 0) return { tickets: 3 };
  if (lv % 2 === 0) return { gems: 100 };
  return { shards: { p: 'random', n: 15 } };
});
/** 戰令經驗來源 */
export const PASS_XP = { perDailyPoint: 1, perBattle: 5, perRun: 10 };
