// 存檔（PRD 10）：3 個手動欄位＋1 個自動存檔，存在瀏覽器的 localStorage。
import classes from '../data/classes.json';
import { newGameState, statsOf, type ClassId, type GameState } from './gameState';

export const SAVE_VERSION = 1;
export type SlotId = 'auto' | 0 | 1 | 2;
export const MANUAL_SLOTS: SlotId[] = [0, 1, 2];

export interface SaveFile {
  v: number;
  savedAt: number;
  map: string;
  spawn: string;
  areaName: string;
  state: Omit<GameState, 'flags' | 'openedChests'> & { flags: string[]; openedChests: string[] };
}

export function serialize(s: GameState, map: string, spawn: string, areaName: string, now = Date.now()): SaveFile {
  return {
    v: SAVE_VERSION, savedAt: now, map, spawn, areaName,
    state: { ...s, statuses: { ...s.statuses }, items: { ...s.items }, kills: { ...s.kills }, buffs: { ...s.buffs }, quests: JSON.parse(JSON.stringify(s.quests)), gear: s.gear.map((g) => ({ ...g, affixes: g.affixes.map((a) => ({ ...a })) })),
      equipped: { ...s.equipped }, checkpoint: { ...s.checkpoint }, flags: [...s.flags], openedChests: [...s.openedChests] },
  };
}

/** 讀回存檔。格式不對或版本太新回傳 null；缺少的欄位用新遊戲的預設值補上（舊存檔相容）。 */
export function deserialize(raw: unknown): { state: GameState; map: string; spawn: string } | null {
  const f = raw as Partial<SaveFile> | null;
  if (!f || typeof f !== 'object' || typeof f.v !== 'number' || f.v > SAVE_VERSION || !f.state || typeof f.map !== 'string') return null;
  const st = f.state as Partial<SaveFile['state']>;
  if (!st.classId || !(st.classId in classes)) return null;
  const base = newGameState(st.classId as ClassId, st.difficulty ?? 'normal');
  const state: GameState = {
    ...base, ...st,
    flags: new Set(Array.isArray(st.flags) ? st.flags : []),
    openedChests: new Set(Array.isArray(st.openedChests) ? st.openedChests : []),
    statuses: { ...(st.statuses ?? {}) }, items: { ...(st.items ?? {}) }, quests: { ...(st.quests ?? {}) }, kills: { ...(st.kills ?? {}) }, buffs: { ...(st.buffs ?? {}) },
    gear: Array.isArray(st.gear) ? st.gear : base.gear,
    equipped: { ...base.equipped, ...(st.equipped ?? {}) },
    checkpoint: st.checkpoint ?? { map: f.map, spawn: f.spawn ?? 'start' },
  } as GameState;
  if (!Array.isArray(state.skillSlots) || state.skillSlots.length !== 2) state.skillSlots = base.skillSlots;
  if (state.job === undefined) state.job = null;
  const max = statsOf(state);
  state.hp = typeof st.hp === 'number' ? Math.min(Math.max(1, st.hp), max.maxHp) : max.maxHp;
  state.mp = typeof st.mp === 'number' ? Math.min(Math.max(0, st.mp), max.maxMp) : max.maxMp;
  return { state, map: f.map, spawn: f.spawn ?? 'start' };
}

export function formatPlayTime(sec: number): string {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h ? `${h} 小時 ${m % 60} 分` : `${m} 分`;
}

// ---------- localStorage（可能被瀏覽器擋住，全部包 try/catch） ----------
const key = (slot: SlotId) => `kitsunebi.save.${slot}`;

export function writeSave(slot: SlotId, file: SaveFile): boolean {
  try { localStorage.setItem(key(slot), JSON.stringify(file)); return true; } catch { return false; }
}

export function readSave(slot: SlotId): SaveFile | null {
  try {
    const raw = localStorage.getItem(key(slot));
    if (!raw) return null;
    const f = JSON.parse(raw) as SaveFile;
    return deserialize(f) ? f : null;
  } catch { return null; }
}

/** 最新的存檔（「繼續遊戲」用） */
export function latestSave(): { slot: SlotId; file: SaveFile } | null {
  let best: { slot: SlotId; file: SaveFile } | null = null;
  for (const slot of ['auto', ...MANUAL_SLOTS] as SlotId[]) {
    const f = readSave(slot);
    if (f && (!best || f.savedAt > best.file.savedAt)) best = { slot, file: f };
  }
  return best;
}
