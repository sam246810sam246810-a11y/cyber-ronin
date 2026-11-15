import { PARTNERS, PartnerId } from './partners';

// 局內三選一卡片：招募 / 升星 / 全隊強化 / 合體技
export type BuffId = 'atk' | 'aspd' | 'speed' | 'maxhp' | 'heal' | 'magnet' | 'crit' | 'critdmg' | 'lifesteal';
export type ComboId = 'combo_meteor' | 'combo_blizzard' | 'combo_hug' | 'combo_unity';

export interface BuffDef { id: BuffId; name: string; desc: string; icon: string; maxLv: number; weight: number }
export interface ComboDef {
  id: ComboId; name: string; desc: string; icon: string;
  needs: [PartnerId, number][]; // [夥伴, 最低星數]
  minTeam?: number;
}

export const BUFFS: BuffDef[] = [
  { id: 'atk', name: '團隊特訓', desc: '全隊攻擊 +15%', icon: '⚔️', maxLv: 6, weight: 10 },
  { id: 'aspd', name: '興奮點心', desc: '全隊攻擊速度 +12%', icon: '⚡', maxLv: 6, weight: 10 },
  { id: 'speed', name: '輕快腳步', desc: '隊伍移動速度 +10%', icon: '👟', maxLv: 3, weight: 5 },
  { id: 'maxhp', name: '大胃王', desc: '全隊最大生命 +20%，並回復等量', icon: '🍖', maxLv: 5, weight: 8 },
  { id: 'heal', name: '野餐便當', desc: '全隊回復 40% 生命，並救回倒下的夥伴', icon: '🧺', maxLv: 99, weight: 5 },
  { id: 'magnet', name: '吸吸磁鐵', desc: '撿取範圍 +60%', icon: '🧲', maxLv: 2, weight: 5 },
  { id: 'crit', name: '幸運四葉草', desc: '爆擊率 +8%', icon: '🍀', maxLv: 5, weight: 8 },
  { id: 'critdmg', name: '致命爪擊', desc: '爆擊傷害 +40%', icon: '💥', maxLv: 4, weight: 6 },
  { id: 'lifesteal', name: '吃飽飽', desc: '每擊倒一個敵人，全隊回復 1.5% 生命', icon: '🩸', maxLv: 3, weight: 6 },
];

export const COMBOS: ComboDef[] = [
  { id: 'combo_meteor', name: '合體・火狐流星', desc: '貓咪火球變成大範圍隕石，狐狸閃電連鎖 6 個目標並點燃', icon: '☄️', needs: [['cat', 3], ['fox', 1]] },
  { id: 'combo_blizzard', name: '合體・暴雪兔兔', desc: '兔兔紅蘿蔔變成冰錐：貫穿並減速，企鵝雪球範圍加倍', icon: '🌨️', needs: [['rabbit', 3], ['penguin', 1]] },
  { id: 'combo_hug', name: '合體・熊熊守護', desc: '全隊受到傷害 -30%，倉鼠治療量加倍', icon: '🫶', needs: [['bear', 3], ['hamster', 1]] },
  { id: 'combo_unity', name: '合體・團結之星', desc: '隊長星星彈變成 5 發扇形，全隊攻擊 +20%', icon: '🌟', needs: [['shiba', 3]], minTeam: 4 },
];

export const BUFF_MAP = Object.fromEntries(BUFFS.map((b) => [b.id, b])) as Record<BuffId, BuffDef>;
export const COMBO_MAP = Object.fromEntries(COMBOS.map((c) => [c.id, c])) as Record<ComboId, ComboDef>;

export type Card =
  | { kind: 'recruit'; partner: PartnerId }
  | { kind: 'star'; partner: PartnerId }
  | { kind: 'buff'; id: BuffId }
  | { kind: 'combo'; id: ComboId };

export function cardInfo(c: Card): { name: string; desc: string; icon: string; gold: boolean; tag: string } {
  switch (c.kind) {
    case 'recruit': { const p = PARTNERS[c.partner]; return { name: p.name, desc: `${p.role}・${p.desc}`, icon: p.icon, gold: false, tag: '新夥伴' }; }
    case 'star': { const p = PARTNERS[c.partner]; return { name: `${p.name} 升星`, desc: '傷害 +35%、生命 +25%，3 星起強化武器', icon: p.icon, gold: false, tag: '升星' }; }
    case 'buff': { const b = BUFF_MAP[c.id]; return { name: b.name, desc: b.desc, icon: b.icon, gold: false, tag: '全隊' }; }
    case 'combo': { const k = COMBO_MAP[c.id]; return { name: k.name, desc: k.desc, icon: k.icon, gold: true, tag: '合體技' }; }
  }
}

export const xpNeed = (lv: number) => 40 + 28 * lv;
