// 本機存檔；在無痕模式或沙盒中可能無法使用，所以全部包在 try/catch 裡。
import type { CharId, PassiveId, UnlockStats, UpgradeId, WeaponId } from '../config/balance';
import type { ModuleItem, Slot } from '../config/meta';
import type { PoolId, SpiritId } from '../config/gacha';
import type { StageId } from '../config/stages';

import { pushCloud } from './cloud';

const KEY = 'cyber-ronin.save.v1';
const KEY_TIME = 'cyber-ronin.save.time';
/** 本機存檔讀不到時（被清掉或無法使用）的備援 */
let mem: string | null = null;

function readRaw(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return v;
  } catch {
    /* 無法使用本機存檔 */
  }
  return mem;
}

/** 目前本機存檔與最後存檔時間（給雲端同步比較用） */
export function localSaveInfo(): { json: string; savedAt: number } | null {
  const json = readRaw();
  if (!json) return null;
  let savedAt = 0;
  try {
    savedAt = Number(localStorage.getItem(KEY_TIME)) || 0;
  } catch {
    /* 忽略 */
  }
  return { json, savedAt };
}

/** 用雲端的存檔取代本機存檔 */
export function adoptSave(json: string, savedAt: number) {
  mem = json;
  try {
    localStorage.setItem(KEY, json);
    localStorage.setItem(KEY_TIME, String(savedAt));
  } catch {
    /* 忽略 */
  }
}

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
  /** 已通關（並領過首通獎勵）的關卡 */
  stagesCleared: StageId[];
  stageBest: Partial<Record<StageId, { time: number; kills: number }>>;
  lastStage: StageId;
  /** 圖鑑：拿過的遺物 */
  seenRelics: string[];
  /** 遊戲速度（3× 是付費特權） */
  gameSpeed: number;
  autoBattle: boolean;
  /** 付費特權（月卡／通行證，M3 接上） */
  premium: boolean;
  /** 信箱：已讀與已領取的郵件 */
  mailRead: string[];
  mailClaimed: string[];
  /** 角色好感度（累積點數） */
  affinity: Partial<Record<CharId, number>>;
  /** 每個角色選的換色皮膚 */
  skins: Partial<Record<CharId, number>>;
  /** 稱號 */
  title: string;
  /** 霓虹塔最高樓層 */
  towerBest: number;
  /** 賽季通行證：哪個月、經驗、已領的階 */
  passMonth: string;
  passXp: number;
  passClaimed: number[];
  /** 拿過通行證滿階（解鎖賽季框） */
  seasonFrame: boolean;
  /** 抽過的總次數（給稱號用） */
  totalPulls: number;
  /** 掃蕩：每天 3 次 */
  sweepDay: string;
  sweepUsed: number;
  /** 7 日登入：已領到第幾天、上次領取日期 */
  loginStreak: number;
  loginDay: string;
  /** 無盡模式最佳紀錄 */
  endlessBest: { time: number; kills: number };
  /** 每週 Boss：週次與最高傷害、已領的獎勵階段 */
  weeklyKey: string;
  weeklyBest: number;
  weeklyClaimed: number[];
  /** 新手教學已看過的提示 */
  tips: string[];
  /** 介面設定 */
  showDamage: boolean;
  screenShake: boolean;
  /** 每關各自解鎖的最高通緝等級 */
  stageWanted: Record<string, number>;
  /** 角色天賦：學到第幾個節點 */
  talents: Partial<Record<CharId, number>>;
  /** 特效品質 */
  fxQuality: 'high' | 'mid' | 'low';
  /** 看過的關卡劇情 */
  storySeen: string[];
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
  stagesCleared: [],
  stageBest: {},
  lastStage: 'slums',
  seenRelics: [],
  gameSpeed: 1,
  autoBattle: false,
  premium: false,
  mailRead: [],
  mailClaimed: [],
  affinity: {},
  skins: {},
  title: '',
  towerBest: 0,
  passMonth: '',
  passXp: 0,
  passClaimed: [],
  seasonFrame: false,
  totalPulls: 0,
  sweepDay: '',
  sweepUsed: 0,
  loginStreak: 0,
  loginDay: '',
  endlessBest: { time: 0, kills: 0 },
  weeklyKey: '',
  weeklyBest: 0,
  weeklyClaimed: [],
  tips: [],
  showDamage: true,
  screenShake: true,
  stageWanted: {},
  talents: {},
  fxQuality: 'high',
  storySeen: [],
};

export function loadSave(): SaveData {
  try {
    const raw = readRaw();
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
  const json = JSON.stringify(data);
  const savedAt = Date.now();
  mem = json;
  try {
    localStorage.setItem(KEY, json);
    localStorage.setItem(KEY_TIME, String(savedAt));
  } catch {
    /* 無法存檔時忽略（雲端仍會保存） */
  }
  pushCloud({ json, savedAt });
}

/** 清空存檔（開發者用） */
export function resetSave(): void {
  writeSave(structuredClone(EMPTY));
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
