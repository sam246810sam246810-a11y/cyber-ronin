// 動物村莊：局外永久加成。蓋房子需要時間（一位建築師），可用鑽石或廣告加速。
export type BuildingId = 'training' | 'clinic' | 'hall' | 'granary' | 'tower';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  icon: string;
  maxLv: number;
  baseCost: number;
  effect: (lv: number) => string;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'training', name: '訓練場', icon: '🏟️', maxLv: 10, baseCost: 500, effect: (lv) => `全隊攻擊 +${lv * 6}%` },
  { id: 'clinic', name: '醫療小屋', icon: '🏥', maxLv: 10, baseCost: 500, effect: (lv) => `全隊生命 +${lv * 7}%` },
  {
    id: 'hall', name: '招募所', icon: '🏡', maxLv: 5, baseCost: 800,
    effect: (lv) => ['救援時 2 選 1', '救援時 3 選 1', '出發時自帶 1 隻夥伴', '出發夥伴 2 星', '隊伍上限 +1（7 隻夥伴）', '出發夥伴 3 星'][lv],
  },
  { id: 'granary', name: '金幣糧倉', icon: '🌾', maxLv: 8, baseCost: 400, effect: (lv) => `冒險金幣 +${lv * 10}%` },
  { id: 'tower', name: '瞭望塔', icon: '🗼', maxLv: 3, baseCost: 1200, effect: (lv) => `每局技能重抽 +${lv} 次` },
];

export const BUILDING_MAP = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>;

export const buildCost = (b: BuildingDef, lv: number) => Math.round(b.baseCost * Math.pow(1.65, lv));
/** 升到 lv+1 需要的秒數 */
export const buildSeconds = (lv: number) => Math.round(20 * Math.pow(lv + 1, 1.6));
/** 剩餘秒數換算鑽石 */
export const rushGems = (sec: number) => Math.max(3, Math.ceil(sec / 60) * 3);
export const AD_RUSH_SEC = 5 * 60;
