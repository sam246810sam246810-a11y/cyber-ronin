import { ARENA, ARENA_BOTTOM, ARENA_RIGHT } from '../config';
import { ELEMENT_IDS } from '../data';
import type { Enemy } from '../entities/Enemy';
import type { GameScene } from '../scenes/GameScene';
import type { SkillDef } from '../types';
import { clamp, pick } from '../utils';
import { Sound } from './SoundSystem';

/** 角色主動技能（右下「技能」鍵），傷害隨角色當下的傷害數值成長 */
export class SkillSystem {
  cooldown = 0;
  private fieldTime = 0;
  private fieldTick = 0;
  private charge?: { hit: Set<Enemy>; t: number };

  constructor(private game: GameScene, readonly skill: SkillDef) {}

  get ratio(): number {
    return this.cooldown / this.skill.cooldown;
  }

  get ready(): boolean {
    return this.cooldown <= 0;
  }

  use(): boolean {
    const g = this.game;
    if (!this.ready || g.player.state === 'dead') return false;
    const ok = this.cast();
    if (ok) {
      this.cooldown = this.skill.cooldown;
      g.fx.floatText(g.player.x, g.player.y - 60, this.skill.name, '#ffd166', 24);
    }
    return ok;
  }

  private dmg(mul: number): number {
    return this.game.buffs.stats.damage * mul;
  }

  private cast(): boolean {
    const g = this.game;
    const p = g.player;
    switch (this.skill.id) {
      case 'emergency_brew': {
        if (!g.crucible.canAccept && !g.crucible.canBrew) return false;
        while (g.crucible.canAccept) g.crucible.add({ el: pick(ELEMENT_IDS), r: 0 });
        g.brewAndDrink();
        g.fx.burst(p.x, p.y, 120, 0xc9a3ff, 400);
        return true;
      }
      case 'frost_storm': {
        const n = 24;
        for (let i = 0; i < n; i++) {
          g.projectiles.fireFriendly(p.x, p.y, (Math.PI * 2 * i) / n, 640, this.dmg(2), {
            texture: 'thorn', long: true, radius: 9, color: 0x9fe3ff, pierce: 2,
            freezeChance: 0.5, critChance: g.buffs.stats.critChance, triggerPassives: false,
          });
        }
        g.fx.burst(p.x, p.y, 140, 0x9fe3ff, 400);
        Sound.play('zap');
        return true;
      }
      case 'lava_charge': {
        const m = g.input2.move;
        const len = Math.hypot(m.x, m.y);
        const t = g.effects.nearestEnemy(p.x, p.y, 600);
        const a = len > 0.1 ? Math.atan2(m.y, m.x) : t ? Math.atan2(t.y - p.y, t.x - p.x) : p.facing;
        const sx = p.x;
        const sy = p.y;
        p.forceDash(Math.cos(a), Math.sin(a), 280, 0.28, 0.5);
        this.charge = { hit: new Set(), t: 0.3 };
        const ex = clamp(sx + Math.cos(a) * 280, ARENA.x + 30, ARENA_RIGHT - 30);
        const ey = clamp(sy + Math.sin(a) * 280, ARENA.y + 30, ARENA_BOTTOM - 30);
        for (let i = 0; i <= 3; i++) {
          const x = sx + (ex - sx) * (i / 3);
          const y = sy + (ey - sy) * (i / 3);
          g.effects.addZone({
            x, y, radius: 55, duration: 3, color: 0xff5a2a, tickInterval: 0.4,
            onTick: (inside) => inside.forEach((e) => e.takeDamage(this.dmg(0.6), { flash: false })),
          });
        }
        g.cameras.main.shake(120, 0.006);
        Sound.play('explode');
        return true;
      }
      case 'thunder_field': {
        this.fieldTime = 5;
        this.fieldTick = 0;
        g.fx.burst(p.x, p.y, 200, 0xffe14d, 500);
        return true;
      }
    }
  }

  update(dt: number): void {
    const g = this.game;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.charge) {
      this.charge.t -= dt;
      const p = g.player;
      for (const e of g.effects.enemiesInRadius(p.x, p.y, 50)) {
        if (this.charge.hit.has(e)) continue;
        this.charge.hit.add(e);
        g.projectiles.applyHit(e, this.dmg(4), { knockback: 60, critChance: g.buffs.stats.critChance }, p.x, p.y);
      }
      if (this.charge.t <= 0) this.charge = undefined;
    }

    if (this.fieldTime > 0) {
      this.fieldTime -= dt;
      this.fieldTick -= dt;
      if (this.fieldTick <= 0) {
        this.fieldTick = 0.35;
        const p = g.player;
        const near = g.effects.enemiesInRadius(p.x, p.y, 360);
        if (near.length) {
          const e = pick(near);
          g.fx.line(e.x, ARENA.y, e.x, e.y, 0xffffff, 6);
          g.effects.explode(e.x, e.y, 60, this.dmg(2.5), 0xffe14d);
          Sound.play('zap');
        }
      }
    }
  }
}
