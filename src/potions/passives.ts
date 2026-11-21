import type { Enemy } from '../entities/Enemy';
import type { GameScene } from '../scenes/GameScene';
import type { Stats } from '../systems/BuffSystem';
import { pick } from '../utils';

/** 被動觸發時拿到的資訊。area / freq 已經套用突變卡與神話藥水。 */
export interface PassiveCtx {
  game: GameScene;
  /** 目前層數（可能有小數：品質與角色倍率） */
  n: number;
  /** 範圍倍率（擴散） */
  area: number;
  /** 週期倍率，越小越快（延時、時之砂） */
  freq: number;
}

/**
 * 被動模組。
 * - core_X：元素核心（純色 / 雙色主元素）
 * - rider_X：元素附加（雙色副元素 / 三色）
 * - 其餘：神話藥水
 */
export interface Passive {
  stats?(s: Stats, c: PassiveCtx): void;
  period?: (c: PassiveCtx) => number;
  onPeriod?(c: PassiveCtx): void;
  onAcquire?(c: PassiveCtx): void;
  onShot?(c: PassiveCtx, shotIndex: number): void;
  onKill?(c: PassiveCtx, e: Enemy): void;
}

const player = (c: PassiveCtx) => c.game.player;
const whole = (n: number) => Math.max(1, Math.floor(n));

export const PASSIVES: Record<string, Passive> = {
  // ---- 核心 ----
  core_J: {
    stats: (s, c) => { s.bounces += whole(c.n); },
  },
  core_I: {
    period: () => 6,
    onPeriod: (c) => {
      const p = player(c);
      c.game.effects.explode(p.x, p.y, (110 + 15 * c.n) * c.area, 1 + c.n, 0x9fe3ff, { freeze: 0.5 + 0.2 * c.n });
    },
  },
  core_S: {
    onAcquire: (c) => c.game.buffs.ensureAura(),
  },
  core_F: {
    onKill: (c, e) => {
      const x = e.x;
      const y = e.y;
      c.game.effects.delay(0.05, () =>
        c.game.effects.explode(x, y, (55 + 5 * c.n) * c.area, 1 + c.n, 0xff8a3d));
    },
  },
  core_T: {
    onShot: (c, i) => {
      if (i % 4 !== 0) return;
      const p = player(c);
      c.game.effects.chain(p.x, p.y, 2 + whole(c.n), 1.5 + 0.5 * c.n, 260 * c.area, 0xffe14d);
    },
  },

  // ---- 附加 ----
  rider_J: { stats: (s, c) => { s.pierce += whole(c.n); } },
  rider_I: { stats: (s, c) => { s.freezeChance = Math.min(0.5, s.freezeChance + 0.06 * c.n); } },
  rider_S: { stats: (s, c) => { s.poisonDps += 0.5 * c.n; } },
  rider_F: { stats: (s, c) => { s.explodeChance = Math.min(0.6, s.explodeChance + 0.08 * c.n); } },
  rider_T: { stats: (s, c) => { s.chainChance = Math.min(0.6, s.chainChance + 0.08 * c.n); } },

  // ---- 神話藥水 ----
  inferno_heart: {
    period: (c) => 1.5 * Math.pow(0.8, c.n - 1),
    onPeriod: (c) => {
      const alive = c.game.enemies.filter((e) => e.alive);
      if (!alive.length) return;
      const t = pick(alive);
      c.game.effects.explode(t.x, t.y, 80 * c.area, 4, 0xff5a3d, { knockback: 30 });
    },
  },
  time_sand: {
    stats: (s, c) => {
      s.fireInterval *= Math.pow(0.75, c.n);
      s.dashCooldown *= Math.pow(0.75, c.n);
    },
  },
  world_seed: {
    period: (c) => 10 * Math.pow(0.8, c.n - 1),
    onPeriod: (c) => {
      const p = player(c);
      const r = 220 * c.area;
      c.game.fx.burst(p.x, p.y, r * 0.5, 0xff7eb6);
      c.game.effects.delay(0.08, () => c.game.fx.burst(p.x, p.y, r * 0.75, 0x7ed4ff));
      c.game.effects.explode(p.x, p.y, r, 8, 0x9bff6b, { freeze: 1, poison: { dps: 1.5, time: 3 }, knockback: 60 });
      c.game.cameras.main.shake(120, 0.006);
    },
  },
  chaos_essence: {
    stats: (s, c) => {
      s.splash = Math.max(s.splash, 50 + 10 * (c.n - 1));
      s.damage *= Math.pow(1.3, c.n);
    },
  },
};

/** 被動模組的顯示名稱（暫停 / 結算畫面用） */
export function moduleLabel(id: string, elements: Record<string, { coreName: string; riderName: string; color: string }>,
  mythics: { id: string; name: string; color: string }[]): { name: string; color: string; mythic: boolean } {
  if (id.startsWith('core_')) {
    const e = elements[id.slice(5)];
    return { name: e.coreName, color: e.color, mythic: false };
  }
  if (id.startsWith('rider_')) {
    const e = elements[id.slice(6)];
    return { name: `附加・${e.riderName}`, color: e.color, mythic: false };
  }
  const m = mythics.find((x) => x.id === id);
  return { name: m?.name ?? id, color: m?.color ?? '#ffffff', mythic: true };
}
