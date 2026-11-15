// 任務（PRD 9）：支線、討伐、收集、每日懸賞。純函式。
import quests from '../data/quests.json';
import type { Line } from './dialogue';
import { canAddGear, canAddItem } from './inventory';
import { BAG_MAX } from './inventory';
import type { BaseId } from './equipment';
import type { GameState } from './gameState';

export type QuestType = 'side' | 'hunt' | 'collect' | 'bounty';
export interface QuestDef {
  type: QuestType; name: string; giver: string; requires?: string[]; desc: string;
  target: { kill?: string; item?: string; pickup?: string; count: number };
  reward: { money?: number; items?: Record<string, number>; gear?: { base: string; rarity: number }; flags?: string[]; capacity?: number };
  offer?: Line[]; remind?: Line[]; done?: Line[];
}
export const QUESTS = quests as unknown as Record<string, QuestDef>;

/** 'active'：進行中；'done'：已交付 */
export interface QuestProgress { status: 'active' | 'done'; progress: number }
export type QuestLog = Record<string, QuestProgress>;

// ---------- 每日懸賞（依裝置日期刷新）----------
const BOUNTY_POOL: { kill: string; name: string; count: number; money: number; needs: string }[] = [
  { kill: 'kitsunebi', name: '狐火', count: 3, money: 40, needs: 'talked_priest' },
  { kill: 'karakasa', name: '唐傘小僧', count: 3, money: 50, needs: 'talked_priest' },
  { kill: 'nogitsune', name: '野狐', count: 3, money: 50, needs: 'talked_priest' },
  { kill: 'bonespider', name: '骨蜘蛛', count: 2, money: 70, needs: 'prologue_done' },
  { kill: 'chochin', name: '提燈鬼', count: 1, money: 120, needs: 'prologue_done' },
];

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 某一天的 3 個懸賞（同一天結果固定）。只從目前劇情已解鎖的怪物裡挑。 */
export function dailyBounties(date: string, flags: ReadonlySet<string>): Record<string, QuestDef> {
  const pool = BOUNTY_POOL.filter((b) => flags.has(b.needs));
  let seed = [...date].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0x100000000);
  const picked = [...pool].sort(() => rnd() - 0.5).slice(0, 3);
  const out: Record<string, QuestDef> = {};
  picked.forEach((b, i) => {
    out[`daily:${date}:${i}`] = {
      type: 'bounty', name: `懸賞：${b.name} ×${b.count}`, giver: 'board', desc: `今天的懸賞。打倒 ${b.count} 隻${b.name}。`,
      target: { kill: b.kill, count: b.count }, reward: { money: b.money, items: { 回復丸: 1 } },
    };
  });
  return out;
}

export function questDef(id: string, flags: ReadonlySet<string>): QuestDef | undefined {
  if (QUESTS[id]) return QUESTS[id];
  const m = /^daily:(\d{4}-\d{2}-\d{2}):\d$/.exec(id);
  return m ? dailyBounties(m[1], flags)[id] : undefined;
}

export const isUnlocked = (q: QuestDef, flags: ReadonlySet<string>) => (q.requires ?? []).every((f) => flags.has(f));

/** 目前的進度數字。收集任務看背包裡有幾個。 */
export function progressOf(s: GameState, id: string): number {
  const q = questDef(id, s.flags), p = s.quests[id];
  if (!q || !p) return 0;
  if (q.target.item) return Math.min(q.target.count, s.items[q.target.item] ?? 0);
  return Math.min(q.target.count, p.progress);
}

export function isReady(s: GameState, id: string): boolean {
  const q = questDef(id, s.flags);
  return !!q && s.quests[id]?.status === 'active' && progressOf(s, id) >= q.target.count;
}

/** 這位 NPC（或告示板）能給的任務 */
export function offersFrom(s: GameState, giver: string): string[] {
  return Object.entries(QUESTS).filter(([id, q]) => q.giver === giver && !s.quests[id] && isUnlocked(q, s.flags)).map(([id]) => id);
}

/** 可以交給這位 NPC 的任務 */
export function readyFor(s: GameState, giver: string): string[] {
  return Object.keys(s.quests).filter((id) => questDef(id, s.flags)?.giver === giver && isReady(s, id));
}

export function accept(s: GameState, id: string): boolean {
  const q = questDef(id, s.flags);
  if (!q || s.quests[id]) return false;
  s.quests[id] = { status: 'active', progress: 0 };
  return true;
}

/** 打倒怪物：更新討伐進度，回傳要顯示的訊息 */
export function onKill(s: GameState, kind: string): string[] {
  const msgs: string[] = [];
  for (const [id, p] of Object.entries(s.quests)) {
    const q = questDef(id, s.flags);
    if (!q || p.status !== 'active' || q.target.kill !== kind || p.progress >= q.target.count) continue;
    p.progress++;
    msgs.push(p.progress >= q.target.count ? `${q.name}：完成！回去交付吧` : `${q.name} ${p.progress}/${q.target.count}`);
  }
  return msgs;
}

/** 撿到任務物品 */
export function onPickup(s: GameState, group: string): string[] {
  const msgs: string[] = [];
  for (const [id, p] of Object.entries(s.quests)) {
    const q = questDef(id, s.flags);
    if (!q || p.status !== 'active' || q.target.pickup !== group) continue;
    p.progress = Math.min(q.target.count, p.progress + 1);
    msgs.push(p.progress >= q.target.count ? `${q.name}：找齊了！回去交付吧` : `${q.name} ${p.progress}/${q.target.count}`);
  }
  return msgs;
}

/** 這個撿取物現在要不要出現（任務進行中、還沒撿過） */
export function pickupVisible(s: GameState, group: string, pickupId: string): boolean {
  if (s.flags.has(`pickup:${pickupId}`)) return false;
  return Object.entries(s.quests).some(([id, p]) => p.status === 'active' && questDef(id, s.flags)?.target.pickup === group);
}

/** 交付：收走收集品、給獎勵。背包放不下獎勵就不交付。回傳訊息或 null。 */
export function turnIn(s: GameState, id: string): string | null {
  const q = questDef(id, s.flags);
  if (!q || !isReady(s, id)) return null;
  const r = q.reward;
  const extraItems = Object.entries(r.items ?? {});
  if (extraItems.some(([n, c]) => !canAddItem(s, n, c)) || (r.gear && !canAddGear(s))) return '背包滿了，整理一下再來交付吧';
  if (q.target.item) { s.items[q.target.item] -= q.target.count; if (s.items[q.target.item] <= 0) delete s.items[q.target.item]; }
  const parts: string[] = [];
  if (r.money) { s.money += r.money; parts.push(`${r.money} 文`); }
  for (const [n, c] of extraItems) { s.items[n] = (s.items[n] ?? 0) + c; parts.push(`${n} ×${c}`); }
  if (r.gear) { s.gear.push({ uid: s.nextUid++, base: r.gear.base as BaseId, rarity: r.gear.rarity, affixes: [] }); parts.push('裝備'); }
  if (r.capacity) { s.capacity = Math.min(BAG_MAX, s.capacity + r.capacity); parts.push(`背包 +${r.capacity} 格`); }
  for (const f of r.flags ?? []) s.flags.add(f);
  s.quests[id].status = 'done';
  return `完成「${q.name}」！獲得 ${parts.join('、')}`;
}

export function rewardText(q: QuestDef): string {
  const r = q.reward, parts: string[] = [];
  if (r.money) parts.push(`${r.money} 文`);
  for (const [n, c] of Object.entries(r.items ?? {})) parts.push(`${n} ×${c}`);
  if (r.gear) parts.push('裝備');
  if (r.capacity) parts.push(`背包 +${r.capacity} 格`);
  return parts.join('、');
}
