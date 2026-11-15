/** World 每幀寫入、UI 每幀讀取的戰鬥介面資訊。 */
export interface SkillHud { name: string; mp: number; cooldown: number; usable: boolean }

export const hudState = {
  maxHp: 1,
  maxMp: 1,
  skills: [] as SkillHud[],
  dodgeCooldown: 0,
  /** 弓術師蓄力進度 0..1 */
  charge: 0,
};
