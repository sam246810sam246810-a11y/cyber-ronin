/** World 每幀寫入、UI 每幀讀取的介面資訊。 */
export interface SkillHud { name: string; mp: number; cooldown: number; usable: boolean }
export interface MapMarker { x: number; y: number; color: number }

export const hudState = {
  maxHp: 1,
  maxMp: 1,
  skills: [] as SkillHud[],
  dodgeCooldown: 0,
  /** 弓術師蓄力進度 0..1 */
  charge: 0,
  /** 小地圖：地形（換地圖時 version +1）、主角位置與標記（格子座標） */
  minimap: { version: 0, w: 1, h: 1, walls: new Uint8Array(1), player: { x: 0, y: 0 }, markers: [] as MapMarker[] },
};
