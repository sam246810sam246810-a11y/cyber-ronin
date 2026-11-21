import { Enemy } from '../Enemy';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT } from '../../config';
import { TelegraphSystem } from '../../systems/TelegraphSystem';
import { clamp, rand } from '../../utils';
import type { EnemyDef } from '../../types';
import type { GameScene } from '../../scenes/GameScene';

type BossAttack = 'charge' | 'fan' | 'slam';

/** 食人巨花：輪流使用藤蔓衝刺 / 扇形彈幕 / 召喚＋砸地 */
export class FlowerBoss extends Enemy {
  private attackTimer = 2;
  private busy = false;
  private cycle: BossAttack[] = ['charge', 'fan', 'slam'];
  private cycleIndex = 0;
  private dash?: { sx: number; sy: number; tx: number; ty: number; t: number; dur: number };
  private volleys: { t: number; angle: number }[] = [];
  private homeX = (ARENA.x + ARENA_RIGHT) / 2;
  private homeY = ARENA.y + 200;

  constructor(game: GameScene, def: EnemyDef, x: number, y: number) {
    super(game, def, x, y, false, 'rat_king');
    this.freezeResist = 0.4;
    this.knockbackResist = 0;
  }

  get enraged(): boolean {
    return this.hp < this.maxHp * 0.5;
  }

  protected act(dt: number): void {
    // 扇形彈幕的後續波次
    for (const v of this.volleys) v.t -= dt;
    const ready = this.volleys.filter((v) => v.t <= 0);
    this.volleys = this.volleys.filter((v) => v.t > 0);
    ready.forEach((v) => this.fireFan(v.angle));

    if (this.dash) {
      const d = this.dash;
      d.t = Math.min(d.dur, d.t + dt);
      const k = d.t / d.dur;
      this.x = d.sx + (d.tx - d.sx) * k;
      this.y = d.sy + (d.ty - d.sy) * k;
      if (d.t >= d.dur) {
        this.dash = undefined;
        this.busy = false;
        this.game.cameras.main.shake(120, 0.006);
      }
      return;
    }

    if (!this.busy) {
      // 慢慢飄回上半場
      const tx = this.homeX + Math.sin(this.game.time.now / 1500) * 180;
      this.moveToward(tx, this.homeY, dt);
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) this.startAttack();
    }
    this.sprite.setRotation(Math.sin(this.game.time.now / 400) * 0.08);
  }

  private startAttack(): void {
    const attack = this.cycle[this.cycleIndex % this.cycle.length];
    this.cycleIndex++;
    this.busy = true;
    const interval = (Number(this.def.attackInterval ?? 2.6) * this.game.dungeon.attackMul) * (this.enraged ? 0.65 : 1);
    this.attackTimer = interval;
    const tele = Number(this.def.telegraph ?? 0.9) * (this.enraged ? 0.85 : 1);
    const p = this.game.player;

    if (attack === 'charge') {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      const len = 560;
      const tx = clamp(this.x + Math.cos(a) * len, ARENA.x + this.radius, ARENA_RIGHT - this.radius);
      const ty = clamp(this.y + Math.sin(a) * len, ARENA.y + this.radius, ARENA_BOTTOM - this.radius);
      this.game.telegraphs.add({
        owner: this,
        duration: tele,
        shape: { kind: 'line', x1: this.x, y1: this.y, x2: tx, y2: ty, width: this.radius * 1.8 },
        onDone: () => {
          if (!this.alive || this.frozen) {
            this.busy = false;
            return;
          }
          this.dash = { sx: this.x, sy: this.y, tx, ty, t: 0, dur: 0.4 };
        },
      });
    } else if (attack === 'fan') {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.game.telegraphs.add({
        owner: this,
        duration: tele,
        shape: { kind: 'sector', x: this.x, y: this.y, angle: a, spread: (70 * Math.PI) / 180, len: 520 },
        onDone: () => {
          this.busy = false;
          if (!this.alive || this.frozen) return;
          const waves = this.enraged ? 4 : 3;
          for (let i = 0; i < waves; i++) this.volleys.push({ t: i * 0.25, angle: a });
        },
      });
    } else {
      const spots = [
        { x: p.x, y: p.y },
        { x: p.x + rand(-140, 140), y: p.y + rand(-140, 140) },
        { x: p.x + rand(-140, 140), y: p.y + rand(-140, 140) },
      ];
      let remaining = spots.length;
      spots.forEach((s) => {
        const x = clamp(s.x, ARENA.x + 40, ARENA_RIGHT - 40);
        const y = clamp(s.y, ARENA.y + 40, ARENA_BOTTOM - 40);
        this.game.telegraphs.add({
          owner: this,
          duration: tele + 0.1,
          shape: { kind: 'circle', x, y, r: 80 },
          onDone: (shape) => {
            remaining--;
            if (remaining === 0) this.busy = false;
            if (!this.alive) return;
            this.game.fx.burst(x, y, 80, 0x9a2f6e);
            const pl = this.game.player;
            if (TelegraphSystem.hits(shape, pl.x, pl.y, pl.radius)) this.game.hurtPlayer(1);
          },
        });
      });
      const summon = this.enraged ? 4 : 3;
      for (let i = 0; i < summon; i++) {
        const a = (Math.PI * 2 * i) / summon;
        this.game.dungeon.spawnEnemy('crawler', this.x + Math.cos(a) * 90, this.y + Math.sin(a) * 90, false, 0.6);
      }
      this.game.cameras.main.shake(100, 0.004);
    }
  }

  private fireFan(angle: number): void {
    if (!this.alive) return;
    const n = 9;
    const spread = (70 * Math.PI) / 180;
    const jitter = rand(-0.05, 0.05);
    for (let i = 0; i < n; i++) {
      const a = angle - spread / 2 + (spread * i) / (n - 1) + jitter;
      this.game.projectiles.fireEnemy(this.x, this.y, a, 340);
    }
  }
}
