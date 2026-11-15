// 成就（20 個）：每個都是對遊戲狀態的檢查，達成時給獎勵。純函式。
import bestiary from '../data/bestiary.json';
import { RARITIES } from './equipment';
import type { GameState } from './gameState';

export interface Achievement { id: string; name: string; desc: string; reward: { money?: number; items?: Record<string, number> }; check: (s: GameState, extra: { collection: number }) => boolean }

const totalKills = (s: GameState) => Object.values(s.kills).reduce((a, b) => a + b, 0);
const doneQuests = (s: GameState, pred: (id: string) => boolean = () => true) => Object.entries(s.quests).filter(([id, q]) => q.status === 'done' && pred(id)).length;
const seen = (s: GameState) => Object.keys(bestiary).filter((k) => (s.kills[k] ?? 0) > 0).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_kill', name: '初次除妖', desc: '打倒第一隻妖怪', reward: { items: { 回復丸: 3 } }, check: (s) => totalKills(s) >= 1 },
  { id: 'kill_100', name: '百妖斬', desc: '累計打倒 100 隻妖怪', reward: { money: 500 }, check: (s) => totalKills(s) >= 100 },
  { id: 'kill_500', name: '千妖之路', desc: '累計打倒 500 隻妖怪', reward: { money: 3000, items: { 萬能符: 5 } }, check: (s) => totalKills(s) >= 500 },
  { id: 'boss1', name: '古井的光', desc: '打倒土蜘蛛', reward: { money: 300 }, check: (s) => s.flags.has('boss_defeated') },
  { id: 'boss2', name: '清澈的沼澤', desc: '打倒河童王', reward: { money: 600 }, check: (s) => s.flags.has('kappa_defeated') },
  { id: 'boss3', name: '天狗的認可', desc: '打倒大天狗', reward: { money: 1000 }, check: (s) => s.flags.has('tengu_defeated') },
  { id: 'boss4', name: '鬼之城陷落', desc: '打倒酒吞童子', reward: { money: 2000 }, check: (s) => s.flags.has('shuten_defeated') },
  { id: 'end_a', name: '封印', desc: '看到結局 A', reward: { money: 1000 }, check: (s) => s.flags.has('ending_a') },
  { id: 'end_b', name: '共存', desc: '看到結局 B', reward: { money: 1000 }, check: (s) => s.flags.has('ending_b') },
  { id: 'end_true', name: '結界真正的意義', desc: '看到真結局', reward: { money: 5000 }, check: (s) => s.flags.has('ending_true') },
  { id: 'job', name: '踏上新的道路', desc: '轉職', reward: { items: { 大回復丸: 3 } }, check: (s) => !!s.job },
  { id: 'lv20', name: '登峰造極', desc: '到達 Lv20', reward: { money: 3000 }, check: (s) => s.level >= 20 },
  { id: 'rich', name: '鈴屋的大客戶', desc: '同時持有 10000 文', reward: { items: { 萬能符: 3 } }, check: (s) => s.money >= 10000 },
  { id: 'plus5', name: '千錘百鍊', desc: '把一件裝備強化到 +5', reward: { items: { 玉鋼: 5 } }, check: (s) => s.gear.some((g) => (g.plus ?? 0) >= 5) },
  { id: 'legend', name: '傳說之物', desc: `得到一件${RARITIES[4].name}裝備`, reward: { money: 2000 }, check: (s) => s.gear.some((g) => g.rarity >= 4) },
  { id: 'collector', name: '收集家', desc: '收集度 100%', reward: { money: 5000 }, check: (_s, x) => x.collection >= 100 },
  { id: 'quests10', name: '村子的好幫手', desc: '完成 10 個任務', reward: { money: 1500 }, check: (s) => doneQuests(s) >= 10 },
  { id: 'bounty5', name: '懸賞獵人', desc: '完成 5 個每日懸賞', reward: { money: 1000 }, check: (s) => doneQuests(s, (id) => id.startsWith('daily:')) >= 5 },
  { id: 'bestiary', name: '妖怪博士', desc: '圖鑑收錄 20 種妖怪', reward: { money: 2000 }, check: (s) => seen(s) >= 20 },
  { id: 'tower10', name: '百鬼塔制霸', desc: '登上百鬼塔第 10 層', reward: { money: 8000 }, check: (s) => s.towerBest >= 10 },
  { id: 'ngplus', name: '再一次，狐火之旅', desc: '開始二周目', reward: { money: 3000 }, check: (s) => s.ngPlus >= 1 },
];

/** 新達成的成就（還沒拿過的） */
export function newlyUnlocked(s: GameState, extra: { collection: number }): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !s.flags.has(`ach:${a.id}`) && a.check(s, extra));
}

export function grantAchievement(s: GameState, a: Achievement): string {
  s.flags.add(`ach:${a.id}`);
  const parts: string[] = [];
  if (a.reward.money) { s.money += a.reward.money; parts.push(`${a.reward.money} 文`); }
  for (const [n, c] of Object.entries(a.reward.items ?? {})) { s.items[n] = (s.items[n] ?? 0) + c; parts.push(`${n} ×${c}`); }
  return `成就達成「${a.name}」！獲得 ${parts.join('、')}`;
}
