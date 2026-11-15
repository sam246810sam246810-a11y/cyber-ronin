import { CHAPTERS, ChapterDef, MapNode, buildMap } from '../data/chapters';
import { MAX_FOLLOWERS, MAX_STAR, PARTNERS, PartnerId, RECRUITABLE, plvMul, starHp } from '../data/partners';
import { BUFFS, BuffId, COMBOS, ComboId, Card } from '../data/skills';
import type { BaseStats } from '../meta/state';
import { track } from '../core/track';

export interface Member { uid: number; pid: PartnerId; star: number; hp: number; maxHp: number; down: boolean; cdT: number; flash: number; invuln: number }

export interface RunBonus { atkMul: number; hpMul: number; goldMul: number; rerolls: number; unlocked: PartnerId[]; startStar: number; startPartner: boolean; plv: Record<PartnerId, number> }

/** 一次冒險（跨多場戰鬥）的狀態 */
export class Run {
  ch: ChapterDef;
  map: MapNode[][];
  pos: MapNode | null = null;
  visited: number[] = [];
  team: Member[] = [];
  buffs: Partial<Record<BuffId, number>> = {};
  combos = new Set<ComboId>();
  level = 1;
  xp = 0;
  gold = 0;
  kills = 0; eliteKills = 0; bossKills = 0; battles = 0; evolutions = 0; recruits = 0;
  rerolls: number;
  reviveUsed = false;
  reachedBoss = false;
  bossHpPct: number | null = null;
  items: { tpl: string; rarity: number }[] = [];
  shards: Partial<Record<PartnerId, number>> = {};
  private nextUid = 1;

  constructor(chapter: number, public base: BaseStats, public bonus: RunBonus) {
    this.ch = CHAPTERS[chapter - 1];
    this.map = buildMap(Math.random);
    this.rerolls = 1 + bonus.rerolls;
    this.addMember('shiba');
    if (bonus.startPartner) {
      const pool = bonus.unlocked;
      const m = this.addMember(pool[Math.floor(Math.random() * pool.length)]);
      m.star = bonus.startStar;
    }
    this.recalc(true);
    track('run_start', { chapter, start: this.team.map((m) => m.pid) });
  }

  // ---------- 隊伍數值 ----------
  L(id: BuffId) { return this.buffs[id] ?? 0; }
  get atk() { return this.base.atk * this.bonus.atkMul * (1 + 0.15 * this.L('atk')) * (this.combos.has('combo_unity') ? 1.2 : 1); }
  get aspdMul() { return (this.base.aspd / 1.6) * (1 + 0.12 * this.L('aspd')); }
  get teamHp() { return this.base.maxHp * this.bonus.hpMul * (1 + 0.2 * this.L('maxhp')); }
  get crit() { return Math.min(1, this.base.crit + 0.08 * this.L('crit')); }
  get critDmg() { return this.base.critDmg + 0.4 * this.L('critdmg'); }
  get dmgReduce() { return Math.min(0.7, this.base.dmgReduce + (this.combos.has('combo_hug') ? 0.3 : 0)); }
  get speed() { return 185 * (1 + 0.1 * this.L('speed')); }
  get pickupR() { return 70 * (1 + 0.6 * this.L('magnet')); }
  get leader() { return this.team[0]; }
  get followers() { return this.team.length - 1; }
  has(pid: PartnerId) { return this.team.some((m) => m.pid === pid); }
  member(pid: PartnerId) { return this.team.find((m) => m.pid === pid); }

  recalc(fill = false) {
    for (const m of this.team) {
      const mx = Math.round(this.teamHp * PARTNERS[m.pid].hp * starHp(m.star) * this.plvMul(m.pid));
      if (fill) m.hp = mx;
      else if (!m.down && mx > m.maxHp) m.hp += mx - m.maxHp;
      m.maxHp = mx;
      m.hp = Math.min(m.hp, m.maxHp);
    }
  }

  plvMul(pid: PartnerId) { return plvMul(this.bonus.plv?.[pid] ?? 1); }

  /** 本局獲得的夥伴碎片，冒險結束時入帳 */
  gainShards(n: number, pid?: PartnerId): PartnerId {
    const p = pid ?? this.team[Math.floor(Math.random() * this.team.length)].pid;
    this.shards[p] = (this.shards[p] ?? 0) + n;
    return p;
  }

  // ---------- 存檔 ----------
  snapshot() {
    return {
      v: 1, chapter: this.ch.id, map: this.map, posId: this.pos?.id ?? null, visited: this.visited, team: this.team,
      buffs: this.buffs, combos: [...this.combos], level: this.level, xp: this.xp, gold: this.gold,
      kills: this.kills, eliteKills: this.eliteKills, bossKills: this.bossKills, battles: this.battles, evolutions: this.evolutions, recruits: this.recruits,
      rerolls: this.rerolls, reviveUsed: this.reviveUsed, reachedBoss: this.reachedBoss, bossHpPct: this.bossHpPct,
      items: this.items, shards: this.shards, nextUid: this.nextUid, base: this.base, bonus: this.bonus,
    };
  }

  static restore(raw: unknown): Run | null {
    try {
      const s = raw as ReturnType<Run['snapshot']>;
      if (!s || s.v !== 1) return null;
      const r = Object.create(Run.prototype) as Run;
      Object.assign(r, {
        ch: CHAPTERS[s.chapter - 1], map: s.map, visited: s.visited, team: s.team, buffs: s.buffs, combos: new Set(s.combos),
        level: s.level, xp: s.xp, gold: s.gold, kills: s.kills, eliteKills: s.eliteKills, bossKills: s.bossKills, battles: s.battles,
        evolutions: s.evolutions, recruits: s.recruits, rerolls: s.rerolls, reviveUsed: s.reviveUsed, reachedBoss: s.reachedBoss,
        bossHpPct: s.bossHpPct, items: s.items, shards: s.shards ?? {}, nextUid: s.nextUid, base: s.base, bonus: s.bonus,
      });
      r.pos = s.posId == null ? null : r.map.flat().find((n) => n.id === s.posId) ?? null;
      for (const m of r.team) { m.flash = 0; m.invuln = 0; }
      return r;
    } catch { return null; }
  }

  addMember(pid: PartnerId): Member {
    const m: Member = { uid: this.nextUid++, pid, star: 1, hp: 1, maxHp: 1, down: false, cdT: Math.random() * 0.5, flash: 0, invuln: 0 };
    this.team.push(m);
    this.recalc();
    m.hp = m.maxHp;
    if (pid !== 'shiba') this.recruits++;
    return m;
  }

  healAll(pct: number, revive: boolean) {
    for (const m of this.team) {
      if (m.down) { if (!revive) continue; m.down = false; m.hp = 0; }
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * pct);
    }
  }

  // ---------- 卡片 ----------
  comboReady(id: ComboId) {
    const c = COMBOS.find((x) => x.id === id)!;
    if (this.combos.has(id)) return false;
    if (c.minTeam && this.team.length < c.minTeam) return false;
    return c.needs.every(([pid, star]) => (this.member(pid)?.star ?? 0) >= star);
  }

  recruitable(): PartnerId[] {
    return RECRUITABLE.filter((p) => this.bonus.unlocked.includes(p) && !this.has(p));
  }

  rollCards(n = 3): Card[] {
    const out: Card[] = [];
    const combos = COMBOS.filter((c) => this.comboReady(c.id));
    if (combos.length) out.push({ kind: 'combo', id: combos[Math.floor(Math.random() * combos.length)].id });
    const pool: { c: Card; w: number }[] = [];
    if (this.followers < MAX_FOLLOWERS) for (const p of this.recruitable()) pool.push({ c: { kind: 'recruit', partner: p }, w: this.followers < 2 ? 16 : 9 });
    for (const m of this.team) if (m.star < MAX_STAR) pool.push({ c: { kind: 'star', partner: m.pid }, w: m.pid === 'shiba' ? 7 : 9 });
    for (const b of BUFFS) if (this.L(b.id) < b.maxLv) pool.push({ c: { kind: 'buff', id: b.id }, w: b.weight });
    while (out.length < n && pool.length) {
      const total = pool.reduce((a, x) => a + x.w, 0);
      let r = Math.random() * total, i = 0;
      for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
      out.push(pool.splice(i, 1)[0].c);
    }
    return out;
  }

  /** 套用卡片；回傳是否是合體技 */
  apply(c: Card): boolean {
    track('card_pick', { ...c, level: this.level });
    switch (c.kind) {
      case 'recruit': if (this.followers < MAX_FOLLOWERS && !this.has(c.partner)) this.addMember(c.partner); break;
      case 'star': {
        const m = this.member(c.partner);
        if (m && m.star < MAX_STAR) { m.star++; m.down = false; this.recalc(); m.hp = m.maxHp; }
        break;
      }
      case 'buff':
        this.buffs[c.id] = this.L(c.id) + 1;
        if (c.id === 'heal') this.healAll(0.4, true);
        this.recalc();
        break;
      case 'combo':
        this.combos.add(c.id);
        this.evolutions++;
        this.recalc();
        return true;
    }
    return false;
  }

  // ---------- 地圖 ----------
  available(): MapNode[] {
    if (!this.pos) return this.map[0];
    const ids = this.pos.next;
    return this.map.flat().filter((n) => ids.includes(n.id));
  }

  enter(node: MapNode) {
    this.pos = node;
    this.visited.push(node.id);
    track('node_enter', { row: node.row, kind: node.kind });
  }

  /** 營火 / 行商價格隨章節提高 */
  price(base: number) { return Math.round(base * (1 + 0.5 * (this.ch.id - 1))); }
}
