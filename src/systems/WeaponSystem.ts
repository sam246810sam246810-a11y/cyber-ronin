import Phaser from 'phaser';
import { DEPTH, PLAYER, RARITY } from '../config';
import { WEAPONS, WEAPON_MAP, hexToInt } from '../data';
import type { Enemy } from '../entities/Enemy';
import type { GameScene } from '../scenes/GameScene';
import type { RarityIndex, WeaponDef } from '../types';
import { pick } from '../utils';
import type { BulletOptions, HitOptions } from './ProjectileSystem';
import { Sound } from './SoundSystem';

/**
 * 武器：同時帶 2 把，可切換。
 * 武器決定攻擊方式與「間隔 / 傷害倍率」；藥水給的數值（攻速、傷害、毒、冰凍、暴擊…）所有武器共用。
 */
export class WeaponSystem extends Phaser.Events.EventEmitter {
  slots: (WeaponDef | null)[];
  active = 0;
  private timer = 0;

  constructor(private game: GameScene, startId: string) {
    super();
    this.slots = [WEAPON_MAP[startId] ?? WEAPONS[0], null];
  }

  get weapon(): WeaponDef {
    return this.slots[this.active] ?? this.slots[0]!;
  }

  swap(): boolean {
    if (!this.slots[1 - this.active]) return false;
    this.active = 1 - this.active;
    this.timer = Math.min(this.timer, 0.15);
    this.emit('changed');
    Sound.play('card');
    return true;
  }

  /** 裝備新武器：有空格放空格，否則替換手上這把；回傳被換下的武器 */
  equip(w: WeaponDef): WeaponDef | null {
    const empty = this.slots.indexOf(null);
    let dropped: WeaponDef | null = null;
    if (empty >= 0) {
      this.slots[empty] = w;
      this.active = empty;
    } else {
      dropped = this.slots[this.active];
      this.slots[this.active] = w;
    }
    this.timer = 0.1;
    this.emit('changed');
    return dropped;
  }

  update(dt: number): void {
    this.timer -= dt;
    const p = this.game.player;
    if (this.timer > 0 || p.state === 'dead' || this.game.playerHidden) return;
    const w = this.weapon;
    const range = w.range ?? PLAYER.autoAimRange;
    const target = this.game.effects.nearestEnemy(p.x, p.y, range);
    if (!target) return;
    const st = this.game.buffs.stats;
    this.timer = Math.max(0.08, st.fireInterval * w.intervalMul * (this.game.roomMod === 'frenzy' ? 0.77 : 1));
    this.fire(w, target);
    this.game.buffs.onShot();
  }

  private hitOpts(): HitOptions {
    const st = this.game.buffs.stats;
    return {
      poison: st.poisonDps > 0 ? { dps: st.poisonDps, time: 2 } : undefined,
      slow: st.slow > 0 ? { factor: st.slow, time: 1 } : undefined,
      splash: st.splash,
      freezeChance: st.freezeChance,
      critChance: st.critChance,
      triggerPassives: true,
    };
  }

  private bulletOpts(extra: BulletOptions = {}): BulletOptions {
    const st = this.game.buffs.stats;
    return {
      ...this.hitOpts(),
      bounces: st.bounces,
      color: st.splash ? 0xf0b0ff : st.critChance > 0.2 ? 0xffe14d : st.poisonDps > 0 ? 0xc8ffa8 : undefined,
      ...extra,
      pierce: st.pierce + (extra.pierce ?? 0),
    };
  }

  private fire(w: WeaponDef, target: Enemy): void {
    const g = this.game;
    const p = g.player;
    const st = g.buffs.stats;
    const dmg = st.damage * w.damageMul;
    p.playAttack(target.x);
    const a = Math.atan2(target.y - p.y, target.x - p.x);
    const extraShots = Math.max(0, Math.round(st.shots) - 1);
    const fan = (n: number, step: number, fn: (ang: number) => void) => {
      for (let i = 0; i < n; i++) fn(a + (i - (n - 1) / 2) * step);
    };

    switch (w.kind) {
      case 'single': {
        fan(1 + extraShots, 0.16, (ang) => {
          const j = ((w.jitter ?? 0) * Math.PI / 180) * (Math.random() - 0.5) * 2;
          g.projectiles.fireFriendly(p.x, p.y, ang + j, w.speed ?? 700, dmg, this.bulletOpts());
        });
        Sound.play('shoot');
        break;
      }
      case 'spread': {
        const n = (w.bullets ?? 5) + extraShots * 2;
        const spread = ((w.spread ?? 40) * Math.PI) / 180;
        fan(n, spread / Math.max(1, n - 1), (ang) =>
          g.projectiles.fireFriendly(p.x, p.y, ang, w.speed ?? 620, dmg, this.bulletOpts({ maxDist: w.maxDist, texture: 'thorn', long: true, radius: 6, color: 0xa6d65c })));
        Sound.play('shoot');
        break;
      }
      case 'lance': {
        fan(1 + extraShots, 0.12, (ang) =>
          g.projectiles.fireFriendly(p.x, p.y, ang, w.speed ?? 1000, dmg, this.bulletOpts({
            pierce: w.pierce ?? 6, texture: 'thorn', long: true, radius: 12, color: 0xb8f0ff,
            slow: { factor: Math.max(0.4, st.slow), time: 1.2 },
          })));
        Sound.play('zap');
        break;
      }
      case 'boomerang': {
        fan(1 + extraShots, 0.3, (ang) =>
          g.projectiles.fireFriendly(p.x, p.y, ang, w.speed ?? 560, dmg, this.bulletOpts({
            boomerang: true, maxDist: w.maxDist ?? 380, pierce: 99, texture: 'leaf', radius: 16, spin: 18, color: 0x7eff8a,
          })));
        Sound.play('dash');
        break;
      }
      case 'orb': {
        g.projectiles.fireFriendly(p.x, p.y, a, w.speed ?? 300, dmg, this.bulletOpts({
          pierce: 999, maxDist: w.maxDist ?? 620, radius: 26, color: 0xffd166, spin: 3,
          onExpire: (x, y) => g.effects.explode(x, y, (w.radius ?? 120) * this.area(), dmg * 1.2, 0xffd166, { knockback: 40 }),
        }));
        Sound.play('explode');
        break;
      }
      case 'melee': {
        const r = (w.radius ?? 150) * this.area();
        const arc = ((w.arc ?? 120) * Math.PI) / 180;
        this.drawSlash(p.x, p.y, a, r, arc);
        const o = { ...this.hitOpts(), knockback: 30 };
        for (const e of g.effects.enemiesInRadius(p.x, p.y, r)) {
          const ea = Math.atan2(e.y - p.y, e.x - p.x);
          let d = ea - a;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) <= arc / 2 + 0.2) g.projectiles.applyHit(e, dmg, o, p.x, p.y);
        }
        Sound.play('dash');
        break;
      }
      case 'mortar': {
        const shells = 1 + extraShots;
        for (let i = 0; i < shells; i++) {
          const tx = target.x + (i ? (Math.random() - 0.5) * 120 : 0);
          const ty = target.y + (i ? (Math.random() - 0.5) * 120 : 0);
          this.lob(p.x, p.y, tx, ty, () => {
            g.effects.explode(tx, ty, (w.radius ?? 90) * this.area(), dmg, 0x7eff8a, {
              poison: { dps: Math.max(1, st.poisonDps), time: 3 },
            });
          });
        }
        Sound.play('shoot');
        break;
      }
      case 'chain': {
        const hops = (w.hops ?? 4) + extraShots;
        const hit = new Set<Enemy>();
        let cx = p.x;
        let cy = p.y;
        let cur: Enemy | undefined = target;
        const o = this.hitOpts();
        for (let i = 0; i < hops && cur; i++) {
          hit.add(cur);
          g.fx.line(cx, cy, cur.x, cur.y, 0xffe14d, 5);
          g.fx.line(cx, cy, cur.x, cur.y, 0xffffff, 2);
          g.projectiles.applyHit(cur, dmg * Math.pow(0.85, i), o, cx, cy);
          cx = cur.x;
          cy = cur.y;
          cur = g.effects.nearestEnemy(cx, cy, (w.range ?? 320) * 0.8, hit);
        }
        Sound.play('zap');
        break;
      }
    }
  }

  private area(): number {
    return 1 + this.game.mutations.value('spread') / 100;
  }

  private drawSlash(x: number, y: number, a: number, r: number, arc: number): void {
    const gfx = this.game.add.graphics().setDepth(DEPTH.fx);
    gfx.fillStyle(0xa6ff8a, 0.35);
    gfx.slice(x, y, r, a - arc / 2, a + arc / 2, false).fillPath();
    gfx.lineStyle(4, 0xe8ffd0, 0.9);
    gfx.beginPath();
    gfx.arc(x, y, r, a - arc / 2, a + arc / 2, false);
    gfx.strokePath();
    this.game.tweens.add({ targets: gfx, alpha: 0, duration: 160, onComplete: () => gfx.destroy() });
  }

  private lob(sx: number, sy: number, tx: number, ty: number, onLand: () => void): void {
    const shell = this.game.add.image(sx, sy, 'circle').setTint(0x7eff8a).setDisplaySize(18, 18).setDepth(DEPTH.projectile);
    const t = { k: 0 };
    this.game.tweens.add({
      targets: t, k: 1, duration: 450,
      onUpdate: () => {
        shell.setPosition(sx + (tx - sx) * t.k, sy + (ty - sy) * t.k - Math.sin(t.k * Math.PI) * 110);
      },
      onComplete: () => {
        shell.destroy();
        if (this.game.dungeon.combatActive || this.game.enemies.length) onLand();
      },
    });
  }
}

/** 依稀有度權重抽一把武器 */
export function rollWeapon(weights: readonly number[], minRarity: RarityIndex = 0): WeaponDef {
  const total = weights.reduce((s, w, i) => s + (i >= minRarity ? w : 0), 0);
  let r = Math.random() * total;
  let rarity: RarityIndex = minRarity;
  for (let i = minRarity; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) {
      rarity = i as RarityIndex;
      break;
    }
  }
  const pool = WEAPONS.filter((w) => w.rarity === rarity);
  return pick(pool.length ? pool : WEAPONS);
}

export const weaponColor = (w: WeaponDef) => hexToInt(RARITY[w.rarity].color);
