import { Enemy } from '../Enemy';
import { ARENA, ARENA_BOTTOM, ARENA_RIGHT } from '../../config';
import { TelegraphSystem } from '../../systems/TelegraphSystem';
import { Sound } from '../../systems/SoundSystem';
import { dist, rand } from '../../utils';

/** 雷靈：瞬移到別處，再朝玩家方向放出直線雷射 */
export class Wisp extends Enemy {
  private attackTimer = 1.5 + Math.random();
  private busy = false;

  protected act(dt: number): void {
    this.sprite.setAlpha(0.7 + 0.3 * Math.sin(this.game.time.now / 150));
    if (this.busy) return;
    this.attackTimer -= dt;
    if (this.attackTimer > 0) return;
    this.busy = true;
    this.blink();
    const p = this.game.player;
    const a = Math.atan2(p.y - this.y, p.x - this.x);
    const len = Number(this.def.beamLength ?? 640);
    const x2 = this.x + Math.cos(a) * len;
    const y2 = this.y + Math.sin(a) * len;
    this.game.telegraphs.add({
      owner: this,
      duration: Number(this.def.telegraph ?? 0.8),
      color: 0xc9a3ff,
      shape: { kind: 'line', x1: this.x, y1: this.y, x2, y2, width: Number(this.def.beamWidth ?? 34) * (this.elite ? 1.5 : 1) },
      onDone: (shape) => {
        this.busy = false;
        this.attackTimer = Number(this.def.attackInterval ?? 3.4);
        if (!this.alive || this.frozen) return;
        this.game.fx.line(this.x, this.y, x2, y2, 0xffe14d, 10);
        this.game.fx.line(this.x, this.y, x2, y2, 0xffffff, 4);
        Sound.play('zap');
        const pl = this.game.player;
        if (TelegraphSystem.hits(shape, pl.x, pl.y, pl.radius)) this.game.hurtPlayer(1);
      },
    });
  }

  private blink(): void {
    const p = this.game.player;
    this.game.fx.burst(this.x, this.y, 30, 0xc9a3ff);
    for (let i = 0; i < 10; i++) {
      const x = rand(ARENA.x + 60, ARENA_RIGHT - 60);
      const y = rand(ARENA.y + 60, ARENA_BOTTOM - 60);
      if (dist(x, y, p.x, p.y) > 240 && dist(x, y, p.x, p.y) < 480) {
        this.x = x;
        this.y = y;
        break;
      }
    }
    this.game.fx.burst(this.x, this.y, 30, 0xc9a3ff);
  }
}
