import { Enemy } from '../Enemy';
import { dist } from '../../utils';

/** 噴刺花：原地不動，扇形預警後射出刺 */
export class Spitter extends Enemy {
  private attackTimer = 1 + Math.random() * 1.5;
  private attacking = false;

  private strafe = Math.random() < 0.5 ? 1 : -1;
  private strafeT = 0;

  protected act(dt: number): void {
    if (this.attacking) return;
    this.attackTimer -= dt;
    const p = this.targetPoint();
    const range = Number(this.def.range ?? 420);
    const d = dist(this.x, this.y, p.x, p.y);
    // 吹箭鼠：保持在射程內的舒適距離，太遠就靠近、太近就後退，平常繞著玩家橫移
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = 1.2 + Math.random() * 1.2;
      if (Math.random() < 0.4) this.strafe *= -1;
    }
    const a = Math.atan2(p.y - this.y, p.x - this.x);
    const want = range * 0.75;
    const tx = d > want + 60 ? p.x : d < want - 80 ? this.x - Math.cos(a) * 100 : this.x + Math.cos(a + this.strafe * Math.PI / 2) * 100;
    const ty = d > want + 60 ? p.y : d < want - 80 ? this.y - Math.sin(a) * 100 : this.y + Math.sin(a + this.strafe * Math.PI / 2) * 100;
    this.moveToward(tx, ty, dt, this.speed * (d > want + 60 ? 1 : 0.55));
    this.sprite.setFlipX(p.x < this.x);
    if (this.attackTimer > 0 || d > range * 1.1) return;

    this.attacking = true;
    const angle = Math.atan2(p.y - this.y, p.x - this.x);
    const spread = (Number(this.def.spread ?? 60) * Math.PI) / 180;
    this.game.telegraphs.add({
      owner: this,
      duration: Number(this.def.telegraph ?? 0.8),
      shape: { kind: 'sector', x: this.x, y: this.y, angle, spread, len: range },
      onDone: () => {
        this.attacking = false;
        this.attackTimer = (Number(this.def.attackInterval ?? 3) * this.game.dungeon.attackMul);
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
      this.game.projectiles.fireEnemy(this.x, this.y, a, speed, 1, 'proj_dart');
    }
  }
}
