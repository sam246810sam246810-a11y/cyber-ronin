/** Boss 的血量階段（PRD 8.3）：100–60% 第 1 階段、60–30% 第 2 階段、30% 以下第 3 階段 */
export function bossPhase(hp: number, maxHp: number): 1 | 2 | 3 {
  const r = hp / maxHp;
  return r > 0.6 ? 1 : r > 0.3 ? 2 : 3;
}

/** 階段分界（顯示在 Boss 血條上） */
export const PHASE_MARKS = [0.6, 0.3];
