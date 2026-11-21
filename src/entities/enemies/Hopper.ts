import { Enemy } from '../Enemy';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT } from '../../config';
import { TelegraphSystem } from '../../systems/TelegraphSystem';
import { clamp } from '../../utils';

/** 跳躍蘑菇：預警落點後跳過去砸地 */
export class Hopper extends Enemy {
  private attackTimer = 1.5 + Math.random() * 1.5;
  private jump?: { sx: number; sy: number; tx: number; ty: number; t: number; dur: number };

  protected act(dt: number): void {
    const p = this.game.player;
    if (this.jump) {
      const j = this.jump;
      j.t = Math.min(j.dur, j.t + dt);
      const k = j.t / j.dur;
      this.x = j.sx + (j.tx - j.sx) * k;
      this.y = j.sy + (j.ty - j.sy) * k;
      return;
    }
    this.moveToward(p.x, p.y, dt);
    this.attackTimer -= dt;
    if (this.attackTimer > 0) return;

    const r = Number(this.def.slamRadius ?? 72) * (this.elite ? 1.3 : 1);
    const tx = clamp(p.x, ARENA.x + r * 0.5, ARENA_RIGHT - r * 0.5);
    const ty = clamp(p.y, ARENA.y + r * 0.5, ARENA_BOTTOM - r * 0.5);
    const dur = Number(this.def.telegraph ?? 1);
    this.jump = { sx: this.x, sy: this.y, tx, ty, t: 0, dur };
    this.airborne = true;
    this.game.telegraphs.add({
      owner: this,
      duration: dur,
      shape: { kind: 'circle', x: tx, y: ty, r },
      onDone: (shape) => {
        this.airborne = false;
        this.jump = undefined;
        this.attackTimer = (Number(this.def.attackInterval ?? 3.5) * this.game.dungeon.attackMul);
        if (!this.alive || this.frozen) return; // 空中被冰凍：直接掉下來，不造成傷害
        this.x = tx;
        this.y = ty;
        this.game.fx.burst(tx, ty, r, 0xc08a4a);
        this.game.cameras.main.shake(80, 0.004);
        const pl = this.game.player;
        if (TelegraphSystem.hits(shape, pl.x, pl.y, pl.radius)) this.game.hurtPlayer(1);
      },
    });
  }

  protected liftOffset(): number {
    if (!this.jump) return 0;
    const k = this.jump.t / this.jump.dur;
    return Math.sin(k * Math.PI) * 80;
  }
}
