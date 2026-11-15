// 本機存檔；在無痕模式或沙盒中可能無法使用，所以全部包在 try/catch 裡。
const KEY = 'cyber-ronin.save.v1';

export interface SaveData {
  bestTime: number;
  bestKills: number;
  totalCredits: number;
  runs: number;
}

const EMPTY: SaveData = { bestTime: 0, bestKills: 0, totalCredits: 0, runs: 0 };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 無法存檔時忽略 */
  }
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
