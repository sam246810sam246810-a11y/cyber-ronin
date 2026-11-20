import { Enemy } from '../Enemy';
import { dist } from '../../utils';

/** 噴刺花：原地不動，扇形預警後射出刺 */
export class Spitter extends Enemy {
  private attackTimer = 1 + Math.random() * 1.5;
  private attacking = false;

  protected act(dt: number): void {
    if (this.attacking) return;
    this.attackTimer -= dt;
    const p = this.game.player;
    const range = Number(this.def.range ?? 420);
    if (this.attackTimer > 0 || dist(this.x, this.y, p.x, p.y) > range * 1.6) return;

    this.attacking = true;
    const angle = Math.atan2(p.y - this.y, p.x - this.x);
    const spread = (Number(this.def.spread ?? 60) * Math.PI) / 180;
    this.game.telegraphs.add({
      owner: this,
      duration: Number(this.def.telegraph ?? 0.8),
      shape: { kind: 'sector', x: this.x, y: this.y, angle, spread, len: range },
      onDone: () => {
        this.attacking = false;
        this.attackTimer = Number(this.def.attackInterval ?? 3);
        if (!this.alive || this.frozen) return;
        this.fire(angle, spread);
      },
    });
  }

  private fire(angle: number, spread: number): void {
    const n = Number(this.def.thorns ?? 5) + (this.elite ? 2 : 0);
    const speed = Number(this.def.thornSpeed ?? 380);
    for (let i = 0; i < n; i++) {
      const a = angle - spread / 2 + (spread * i) / Math.max(1, n - 1);
      this.game.projectiles.fireEnemy(this.x, this.y, a, speed);
    }
  }
}
