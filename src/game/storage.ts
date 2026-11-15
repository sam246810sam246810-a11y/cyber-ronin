// 本機存檔；在無痕模式或沙盒中可能無法使用，所以全部包在 try/catch 裡。
import type { CharId, PassiveId, UnlockStats, UpgradeId, WeaponId } from '../config/balance';

const KEY = 'cyber-ronin.save.v1';

export interface SaveData extends UnlockStats {
  bestKills: number;
  wins: number;
  /** 目前持有、可以花的信用點 */
  credits: number;
  totalCredits: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  chars: CharId[];
  lastChar: CharId;
  unlocked: (WeaponId | PassiveId)[];
  seenWeapons: WeaponId[];
  seenPassives: PassiveId[];
  seenEnemies: string[];
  music: boolean;
  sfx: boolean;
}

const EMPTY: SaveData = {
  bestTime: 0,
  bestKills: 0,
  bestLevel: 0,
  totalKills: 0,
  bossKills: 0,
  runs: 0,
  wins: 0,
  iaiTotal: 0,
  credits: 0,
  totalCredits: 0,
  upgrades: {},
  chars: ['jin'],
  lastChar: 'jin',
  unlocked: [],
  seenWeapons: [],
  seenPassives: [],
  seenEnemies: [],
  music: true,
  sfx: true,
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const data = { ...structuredClone(EMPTY), ...JSON.parse(raw) } as SaveData;
    // M1 的存檔只有 totalCredits，沒有錢包
    if (data.credits === 0 && data.totalCredits > 0 && !('credits' in JSON.parse(raw))) data.credits = data.totalCredits;
    return data;
  } catch {
    return structuredClone(EMPTY);
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
