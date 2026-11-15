// 關卡：每關有自己的地面、敵人外觀、最終 Boss、地形機關與難度。
import type { EnemyKind } from './balance';

export type StageId = 'slums' | 'tower' | 'shrine' | 'grave' | 'orbit';
export type HazardKind = 'none' | 'laser' | 'curse' | 'storm' | 'meteor';

export interface EnemySkin {
  tex: string;
  name: string;
  desc: string;
}

export interface StageDef {
  id: StageId;
  name: string;
  desc: string;
  /** 地面貼圖 */
  ground: string;
  /** 大廳關卡卡片插圖 */
  card: string;
  /** 主題色（關卡卡片與標題） */
  color: number;
  css: string;
  /** 敵人血量／傷害倍率（越後面的關卡越難） */
  hpMult: number;
  dmgMult: number;
  /** 結算獎勵倍率 */
  rewardMult: number;
  /** 一般敵人換成這一關的樣子 */
  skins: Partial<Record<EnemyKind, EnemySkin>>;
  /** 最終 Boss（第三隻）；沿用的行為模式 */
  finalBoss?: { tex: string; title: string; desc: string; variant: 'oni' | 'spider' | 'apex'; hp: number };
  hazard: HazardKind;
  hazardDesc: string;
  /** 戰鬥音樂 */
  bgm: string;
  /** 首次通關獎勵 */
  firstClear: { chips: number; char: number; spirit: number };
}

export const STAGES: StageDef[] = [
  {
    id: 'slums',
    bgm: 'bgm-battle',
    name: '霓虹貧民窟',
    desc: '雨夜的霓虹巷弄，幫派與企業無人機橫行。',
    ground: 'ground',
    card: 'ui-stage-slums',
    color: 0xff3d81,
    css: '#ff6a9a',
    hpMult: 1,
    dmgMult: 1,
    rewardMult: 1,
    skins: {},
    hazard: 'none',
    hazardDesc: '沒有地形機關',
    firstClear: { chips: 100, char: 1, spirit: 1 },
  },
  {
    id: 'tower',
    bgm: 'bgm-tower',
    name: '企業高塔',
    desc: '雲層之上的企業總部頂樓，保全機犬與鎮暴兵嚴陣以待。',
    ground: 'ground-tower',
    card: 'ui-stage-tower',
    color: 0x4da6ff,
    css: '#7fc4ff',
    hpMult: 1.35,
    dmgMult: 1.15,
    rewardMult: 1.3,
    skins: {
      drone: { tex: 'enemy-hound', name: '保全機犬', desc: '企業的四足保全機器人，速度很快。' },
      husk: { tex: 'enemy-riot', name: '鎮暴盾兵', desc: '舉著能量盾的重裝鎮暴兵，非常耐打。' },
    },
    finalBoss: { tex: 'boss-tengu', title: '天狗執行官', desc: '企業的最高執行官機甲。噴射衝刺後揮出巨大刀光。', variant: 'apex', hp: 11000 },
    hazard: 'laser',
    hazardDesc: '掃描雷射：預警線出現後，整條線會被雷射掃過',
    firstClear: { chips: 150, char: 2, spirit: 1 },
  },
  {
    id: 'shrine',
    bgm: 'bgm-shrine',
    name: '電子神社',
    desc: '被駭入程式汙染的神社，妖怪化的程式在鳥居間徘徊。',
    ground: 'ground-shrine',
    card: 'ui-stage-shrine',
    color: 0xc48bff,
    css: '#d8a8ff',
    hpMult: 1.8,
    dmgMult: 1.3,
    rewardMult: 1.6,
    skins: {
      drone: { tex: 'enemy-kitsune', name: '狐火妖', desc: '被汙染的狐狸程式，衝得飛快。' },
      gunner: { tex: 'enemy-lantern', name: '提燈怪', desc: '會從遠處吐出紫色鬼火的燈籠妖怪。' },
    },
    finalBoss: { tex: 'boss-orochi', title: '電子八岐大蛇', desc: '八個頭的機械大蛇。噴出旋轉彈幕並召喚小妖。', variant: 'spider', hp: 15000 },
    hazard: 'curse',
    hazardDesc: '詛咒結界：站在紫色結界裡會被減速並持續受傷',
    firstClear: { chips: 200, char: 2, spirit: 2 },
  },
  {
    id: 'grave',
    bgm: 'bgm-grave',
    name: '地下數據墳場',
    desc: '廢棄伺服器堆成的墓園，死去的資料化成幽靈。',
    ground: 'ground-grave',
    card: 'ui-stage-grave',
    color: 0x5dff7a,
    css: '#7dff8a',
    hpMult: 2.4,
    dmgMult: 1.45,
    rewardMult: 2,
    skins: {
      husk: { tex: 'enemy-server', name: '屍化伺服器', desc: '被病毒操控的報廢伺服器，又重又硬。' },
      drone: { tex: 'enemy-ghost', name: '數據幽靈', desc: '飄來飄去的資料殘影。' },
    },
    finalBoss: { tex: 'boss-necro', title: '亡靈主機', desc: '墓園深處的骷髏主機。放出旋轉彈幕並召喚幽靈。', variant: 'spider', hp: 20000 },
    hazard: 'storm',
    hazardDesc: '數據風暴：地上出現綠色預警圈，之後會落下資料柱',
    firstClear: { chips: 250, char: 3, spirit: 2 },
  },
  {
    id: 'orbit',
    bgm: 'bgm-orbit',
    name: '軌道太空站',
    desc: '地球上空的軌道兵器平台，最後的決戰。',
    ground: 'ground-orbit',
    card: 'ui-stage-orbit',
    color: 0xff9a3d,
    css: '#ffb06a',
    hpMult: 3.1,
    dmgMult: 1.6,
    rewardMult: 2.5,
    skins: {
      gunner: { tex: 'enemy-spacetrooper', name: '太空機兵', desc: '穿著太空裝的槍兵，遠距射擊。' },
      drone: { tex: 'enemy-kamikaze', name: '自爆無人機', desc: '衝向目標的自爆無人機。' },
    },
    finalBoss: { tex: 'boss-amaterasu', title: '軌道兵器・天照', desc: '太陽女神造型的軌道兵器。衝刺、環狀與旋轉彈幕全開。', variant: 'apex', hp: 26000 },
    hazard: 'meteor',
    hazardDesc: '隕石雨：橘色預警圈出現後，隕石會砸下來',
    firstClear: { chips: 300, char: 3, spirit: 3 },
  },
];

export function stageById(id: string | undefined): StageDef {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

/** 這一關已解鎖的最高通緝等級（第一關沿用舊存檔的紀錄） */
export function stageWantedMax(s: { wantedUnlocked?: number; stageWanted?: Record<string, number> }, id: StageId): number {
  const v = s.stageWanted?.[id] ?? 0;
  return id === 'slums' ? Math.max(v, s.wantedUnlocked ?? 0) : v;
}
