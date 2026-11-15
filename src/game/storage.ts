// 本機存檔；在無痕模式或沙盒中可能無法使用，所以全部包在 try/catch 裡。
import type { CharId, PassiveId, UnlockStats, UpgradeId, WeaponId } from '../config/balance';
import type { ModuleItem, Slot } from '../config/meta';
import type { PoolId, SpiritId } from '../config/gacha';

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
  vibrate: boolean;
  /** 已解鎖的最高通緝等級（0＝尚未通關） */
  wantedUnlocked: number;
  bestWanted: number;
  // 第二期：義體模組、抽卡、任務
  modules: ModuleItem[];
  equipped: Record<Slot, string | null>;
  parts: number;
  chips: number;
  pity: number;
  gachaPulls: number;
  ssrCount: number;
  relicsTotal: number;
  maxCombo: number;
  dailyDay: string;
  dailyProgress: Record<string, number>;
  dailyClaimed: string[];
  achClaimed: string[];
  dailyClears: number;
  dailyChallengeDay: string;
  dailyChallengeBest: { day: string; time: number; kills: number; victory: boolean } | null;
  // 三池扭蛋
  tickets: Record<PoolId, number>;
  /** 角色池、靈物池的保底計數（義體池沿用 pity） */
  pities: { char: number; spirit: number };
  shards: Partial<Record<CharId, number>>;
  /** 萬能碎片：任何角色都能用 */
  wildShards: number;
  stars: Partial<Record<CharId, number>>;
  /** 式神收集到的份數 */
  spirits: Partial<Record<SpiritId, number>>;
  /** 靈玉：可以餵給任何式神 */
  jade: number;
  /** 自選頭像（已解鎖的角色）與頭像框 */
  avatar?: CharId;
  avatarFrame: string;
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
  vibrate: true,
  wantedUnlocked: 0,
  bestWanted: 0,
  modules: [],
  equipped: { head: null, body: null, arm: null },
  parts: 0,
  chips: 300,
  pity: 0,
  gachaPulls: 0,
  ssrCount: 0,
  relicsTotal: 0,
  maxCombo: 0,
  dailyDay: '',
  dailyProgress: {},
  dailyClaimed: [],
  achClaimed: [],
  dailyClears: 0,
  dailyChallengeDay: '',
  dailyChallengeBest: null,
  tickets: { equip: 1, char: 3, spirit: 5 },
  pities: { char: 0, spirit: 0 },
  shards: {},
  wildShards: 0,
  stars: {},
  spirits: {},
  jade: 0,
  avatarFrame: 'default',
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
