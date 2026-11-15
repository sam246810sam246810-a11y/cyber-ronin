// 特殊模式：無盡模式、每週 Boss 挑戰。
import type { StageId } from './stages';

export type GameMode = 'normal' | 'endless' | 'weekly';

/** 無盡模式：10 分鐘後不結束，每 150 秒來一隻 Boss，敵人持續變強 */
export const ENDLESS = {
  bossEvery: 150,
  /** 10 分鐘後每分鐘敵人血量再 +25% */
  hpPerMin: 0.25,
};

export interface WeeklyBoss {
  tex: string;
  title: string;
  variant: 'oni' | 'spider' | 'apex';
  stage: StageId;
}

/** 每週輪替的 Boss（第一關到第五關的 Boss） */
export const WEEKLY_BOSSES: WeeklyBoss[] = [
  { tex: 'boss-oni', title: '鬼面將軍', variant: 'oni', stage: 'slums' },
  { tex: 'boss-tengu', title: '天狗執行官', variant: 'apex', stage: 'tower' },
  { tex: 'boss-spider', title: '絡新婦', variant: 'spider', stage: 'slums' },
  { tex: 'boss-orochi', title: '電子八岐大蛇', variant: 'spider', stage: 'shrine' },
  { tex: 'boss-necro', title: '亡靈主機', variant: 'spider', stage: 'grave' },
  { tex: 'boss-apex', title: '鬼面將軍・極', variant: 'apex', stage: 'slums' },
  { tex: 'boss-amaterasu', title: '軌道兵器・天照', variant: 'apex', stage: 'orbit' },
];

export const WEEKLY = {
  /** 挑戰時間（秒） */
  duration: 180,
  hp: 400000,
  /** 傷害門檻與獎勵 */
  tiers: [
    { dmg: 30000, label: '晶片 100', chips: 100, char: 0, spirit: 0 },
    { dmg: 80000, label: '浪人券 ×1', chips: 0, char: 1, spirit: 0 },
    { dmg: 150000, label: '晶片 200＋靈符 ×1', chips: 200, char: 0, spirit: 1 },
    { dmg: 250000, label: '浪人券 ×2＋靈符 ×2', chips: 0, char: 2, spirit: 2 },
  ],
};

/** 這一週的代號（年－週數），週一換新 */
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${wk}`;
}

export function weeklyBoss(d = new Date()): WeeklyBoss {
  const k = weekKey(d);
  const n = parseInt(k.split('W')[1], 10) + parseInt(k, 10);
  return WEEKLY_BOSSES[n % WEEKLY_BOSSES.length];
}
