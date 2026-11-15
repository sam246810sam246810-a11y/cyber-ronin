// 動物夥伴：每隻有自己的自動武器。數值以「隊伍攻擊 / 隊伍生命」為基準的倍率。
export type PartnerId = 'shiba' | 'cat' | 'rabbit' | 'bear' | 'fox' | 'penguin' | 'hamster';
export type Weapon = 'star' | 'fire' | 'rapid' | 'slam' | 'chain' | 'frost' | 'heal';

export interface PartnerDef {
  id: PartnerId;
  name: string;
  icon: string;
  color: string;
  role: string;
  desc: string;
  hp: number;       // × 隊伍生命
  dmg: number;      // × 隊伍攻擊
  cd: number;       // 攻擊間隔（秒）
  range: number;
  weapon: Weapon;
  unlockHall: number; // 需要的招募所等級（0 = 預設解鎖）
}

export const PARTNERS: Record<PartnerId, PartnerDef> = {
  shiba: { id: 'shiba', name: '柴犬隊長', icon: '🐶', color: '#ffcf8a', role: '隊長', desc: '發射星星彈；隊長倒下即失敗', hp: 1.4, dmg: 1.0, cd: 0.55, range: 420, weapon: 'star', unlockHall: 0 },
  cat: { id: 'cat', name: '火球貓咪', icon: '🐱', color: '#ffb36b', role: '輸出', desc: '丟出火球，命中後燃燒', hp: 0.8, dmg: 1.25, cd: 1.1, range: 380, weapon: 'fire', unlockHall: 0 },
  rabbit: { id: 'rabbit', name: '連射兔兔', icon: '🐰', color: '#f4d6e8', role: '輸出', desc: '高速連射紅蘿蔔', hp: 0.7, dmg: 0.38, cd: 0.22, range: 360, weapon: 'rapid', unlockHall: 0 },
  bear: { id: 'bear', name: '抱抱熊', icon: '🐻', color: '#b07a4f', role: '坦克', desc: '血量很厚，定期震地擊退周圍敵人', hp: 2.4, dmg: 1.0, cd: 1.6, range: 85, weapon: 'slam', unlockHall: 0 },
  fox: { id: 'fox', name: '閃電狐狸', icon: '🦊', color: '#ff8a3d', role: '控場', desc: '閃電連鎖跳躍 3 個敵人', hp: 0.8, dmg: 0.75, cd: 1.3, range: 330, weapon: 'chain', unlockHall: 1 },
  penguin: { id: 'penguin', name: '雪球企鵝', icon: '🐧', color: '#6f8fae', role: '控場', desc: '丟雪球範圍傷害並減速', hp: 1.0, dmg: 0.65, cd: 1.0, range: 340, weapon: 'frost', unlockHall: 2 },
  hamster: { id: 'hamster', name: '護理倉鼠', icon: '🐹', color: '#f0c27b', role: '治療', desc: '定期治療血量最低的隊友', hp: 0.8, dmg: 0.3, cd: 2.4, range: 300, weapon: 'heal', unlockHall: 3 },
};

export const RECRUITABLE: PartnerId[] = ['cat', 'rabbit', 'bear', 'fox', 'penguin', 'hamster'];
export const MAX_FOLLOWERS = 6;
export const MAX_STAR = 5;

// 升星成長
export const starDmg = (lv: number) => 1 + 0.35 * (lv - 1);
export const starHp = (lv: number) => 1 + 0.25 * (lv - 1);
