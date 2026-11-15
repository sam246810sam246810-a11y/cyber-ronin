// 局內技能（升級三選一）。數值全部集中在這裡，方便調整。
export type SkillId =
  | 'multishot' | 'diagonal' | 'backshot' | 'sideshot'
  | 'ricochet' | 'pierce' | 'wallbounce'
  | 'atk' | 'aspd' | 'crit' | 'critdmg' | 'maxhp' | 'heal' | 'lifesteal'
  | 'fire' | 'ice' | 'lightning' | 'orbit'
  | 'evo_sun' | 'evo_petal' | 'evo_thunder';

export interface SkillDef {
  id: SkillId;
  name: string;
  desc: string;
  icon: string;          // 佔位 emoji
  maxLv: number;
  weight: number;        // 抽中權重
  evo?: boolean;         // 超武（金卡）
  requires?: Partial<Record<SkillId, number>>;
}

export const SKILLS: SkillDef[] = [
  { id: 'multishot', name: '連發星星', desc: '正前方多 1 發子彈（每發傷害 -10%）', icon: '✨', maxLv: 2, weight: 10 },
  { id: 'diagonal', name: '斜向散射', desc: '額外向左右斜前方發射', icon: '🔱', maxLv: 2, weight: 10 },
  { id: 'backshot', name: '背後護衛', desc: '同時向後方發射 1 發', icon: '↩️', maxLv: 1, weight: 6 },
  { id: 'sideshot', name: '左右開弓', desc: '同時向左右兩側發射', icon: '↔️', maxLv: 1, weight: 6 },
  { id: 'ricochet', name: '彈跳星', desc: '子彈命中後彈向下一個敵人', icon: '🎯', maxLv: 2, weight: 8 },
  { id: 'pierce', name: '貫穿', desc: '子彈可以穿透敵人（傷害 -33%）', icon: '🗡️', maxLv: 1, weight: 7 },
  { id: 'wallbounce', name: '反彈牆', desc: '子彈碰到牆壁會反彈 2 次', icon: '🧱', maxLv: 1, weight: 6 },
  { id: 'atk', name: '攻擊強化', desc: '攻擊力 +20%', icon: '⚔️', maxLv: 6, weight: 12 },
  { id: 'aspd', name: '急速射擊', desc: '攻擊速度 +15%', icon: '⚡', maxLv: 6, weight: 12 },
  { id: 'crit', name: '幸運一擊', desc: '爆擊率 +8%', icon: '🍀', maxLv: 5, weight: 9 },
  { id: 'critdmg', name: '致命爪擊', desc: '爆擊傷害 +40%', icon: '💥', maxLv: 4, weight: 7 },
  { id: 'maxhp', name: '大胃王', desc: '最大生命 +20%，並回復等量生命', icon: '🍖', maxLv: 5, weight: 8 },
  { id: 'heal', name: '美味便當', desc: '立即回復 40% 生命', icon: '🍱', maxLv: 99, weight: 5 },
  { id: 'lifesteal', name: '吃飽飽', desc: '每擊倒一個敵人回復 2% 生命', icon: '🩸', maxLv: 3, weight: 6 },
  { id: 'fire', name: '火焰彈', desc: '子彈附帶燃燒，持續造成傷害', icon: '🔥', maxLv: 3, weight: 8 },
  { id: 'ice', name: '冰霜彈', desc: '命中使敵人減速 40%', icon: '❄️', maxLv: 2, weight: 7 },
  { id: 'lightning', name: '雷電彈', desc: '命中時閃電連鎖附近敵人', icon: '🌩️', maxLv: 3, weight: 8 },
  { id: 'orbit', name: '守護葉片', desc: '葉片環繞自身傷害敵人（每級 +1 片）', icon: '🍃', maxLv: 3, weight: 8 },
  // ---- 超武：條件達成後以金卡出現 ----
  { id: 'evo_sun', name: '超武・太陽火球', desc: '子彈命中爆炸，造成範圍傷害與強力燃燒', icon: '☀️', maxLv: 1, weight: 0, evo: true, requires: { fire: 2, atk: 1 } },
  { id: 'evo_petal', name: '超武・花瓣風暴', desc: '6 片巨大花瓣高速旋轉，所向披靡', icon: '🌸', maxLv: 1, weight: 0, evo: true, requires: { orbit: 2, aspd: 1 } },
  { id: 'evo_thunder', name: '超武・雷神之鏈', desc: '閃電連鎖 5 個目標，傷害大幅提升', icon: '⛈️', maxLv: 1, weight: 0, evo: true, requires: { lightning: 2, ricochet: 1 } },
];

export const SKILL_MAP: Record<SkillId, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;

// 經驗曲線
export const xpNeed = (lv: number) => 45 + 30 * lv;
