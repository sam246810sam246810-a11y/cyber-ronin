import type { Enemy } from '../entities/Enemy';
import type { GameScene } from '../scenes/GameScene';
import type { Stats } from '../systems/BuffSystem';

/** 被動觸發時拿到的資訊。area / freq / linger 已經套用突變卡與傳說藥水。 */
export interface PassiveCtx {
  game: GameScene;
  /** 這個被動目前的層數 */
  n: number;
  /** 範圍倍率（擴散） */
  area: number;
  /** 週期倍率，越小越快（延時、時之砂） */
  freq: number;
  /** 場地效果額外秒數（延時） */
  linger: number;
}

/**
 * 藥水被動。key 是 recipes.json / legendaries.json 的 id。
 * 新增藥水：在 json 加一筆，這裡註冊同 id 的被動即可。
 */
export interface Passive {
  /** 調整角色數值 */
  stats?(s: Stats, c: PassiveCtx): void;
  /** 週期型被動的間隔秒數（已乘上 freq 之前） */
  period?: (c: PassiveCtx) => number;
  onPeriod?(c: PassiveCtx): void;
  /** 每次取得（喝下）時 */
  onAcquire?(c: PassiveCtx): void;
  onShot?(c: PassiveCtx, shotIndex: number): void;
  onHit?(c: PassiveCtx, e: Enemy): void;
  onKill?(c: PassiveCtx, e: Enemy): void;
  onDash?(c: PassiveCtx, sx: number, sy: number, ex: number, ey: number): void;
}

const player = (c: PassiveCtx) => c.game.player;

export const PASSIVES: Record<string, Passive> = {
  // ---- 一般配方 ----
  bounce_bomb: {
    stats: (s, c) => { s.bounces += c.n; },
  },
  frost_nova: {
    period: () => 6,
    onPeriod: (c) => {
      const p = player(c);
      c.game.effects.explode(p.x, p.y, (110 + 15 * c.n) * c.area, 1 + c.n, 0x9fe3ff, { freeze: 0.5 + 0.2 * c.n });
    },
  },
  plague_cloud: {
    onAcquire: (c) => c.game.buffs.ensureAura(),
  },
  glue_trap: {
    onDash: (c, sx, sy, ex, ey) => {
      for (const [x, y] of [[sx, sy], [ex, ey]]) {
        c.game.effects.addZone({
          x, y, radius: 70 * c.area, duration: 2 + 0.5 * c.n + c.linger, color: 0xd6a8ff,
          onFrame: (inside) => inside.forEach((e) => e.applySlow(0.55, 0.3)),
        });
      }
    },
  },
  burst_pod: {
    onKill: (c, e) => {
      const x = e.x;
      const y = e.y;
      c.game.effects.delay(0.05, () =>
        c.game.effects.explode(x, y, (55 + 5 * c.n) * c.area, 1 + c.n, 0xffb36b, { poison: { dps: 1, time: 2 } }));
    },
  },
  crystal_marble: {
    onShot: (c, i) => {
      if (i % 4 !== 0) return;
      const p = player(c);
      c.game.effects.chain(p.x, p.y, 2 + c.n, 2, 260 * c.area, 0xb8f0ff, (e) => e.applySlow(0.5, 1.5));
    },
  },
  rot_frost: {
    stats: (s, c) => { s.freezeChance = Math.min(0.5, s.freezeChance + 0.07 * c.n); },
    onHit: (c, e) => {
      if (e.frozen) e.thawDamage = Math.max(e.thawDamage, 2 + c.n);
    },
  },
  sticky_swamp: {
    period: () => 8,
    onPeriod: (c) => {
      const p = player(c);
      const pull = 70;
      c.game.effects.addZone({
        x: p.x, y: p.y, radius: (100 + 12 * c.n) * c.area, duration: 3 + c.linger, color: 0xa6d65c, tickInterval: 0.5,
        onFrame: (inside, dt, z) => inside.forEach((e) => {
          const dx = z.x - e.x;
          const dy = z.y - e.y;
          const d = Math.hypot(dx, dy);
          if (d > 8) e.nudge((dx / d) * pull * dt, (dy / d) * pull * dt);
          e.applySlow(0.3, 0.2);
        }),
        onTick: (inside) => inside.forEach((e) => e.takeDamage(0.5 * c.n, { flash: false })),
      });
    },
  },
  needle_rain: {
    period: () => 3,
    onPeriod: (c) => {
      const p = player(c);
      const n = 6 + 2 * c.n;
      const off = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) {
        c.game.projectiles.fireFriendly(p.x, p.y, off + (Math.PI * 2 * i) / n, 520, 1, {
          radius: 6, color: 0x6be0b0, texture: 'thorn', poison: { dps: 1, time: 2 },
        });
      }
    },
  },
  elemental_bloom: {
    stats: (s, c) => {
      s.shots += c.n;
      s.damage *= 1 + 0.1 * c.n;
    },
  },

  // ---- 傳說藥水 ----
  phoenix_tear: {
    stats: (s, c) => { s.maxHp += 2 * c.n; },
    onAcquire: (c) => {
      c.game.buffs.revives++;
      c.game.player.hp = c.game.player.maxHp;
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
