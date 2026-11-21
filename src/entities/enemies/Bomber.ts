import { Enemy } from '../Enemy';
import { TelegraphSystem } from '../../systems/TelegraphSystem';
import { Sound } from '../../systems/SoundSystem';
import { dist } from '../../utils';

/** 自爆熔岩球：衝向玩家，靠近後預警並自爆；被打死時會炸傷周圍敵人 */
export class Bomber extends Enemy {
  private arming = false;

  protected act(dt: number): void {
    if (this.arming) return;
    const p = this.targetPoint();
    this.moveToward(p.x, p.y, dt);
    const trigger = Number(this.def.triggerRange ?? 90);
    if (dist(this.x, this.y, p.x, p.y) < trigger) {
      this.arming = true;
      const r = Number(this.def.blastRadius ?? 85) * (this.elite ? 1.3 : 1);
      this.game.telegraphs.add({
        owner: this,
        duration: Number(this.def.telegraph ?? 0.7),
        shape: { kind: 'circle', x: this.x, y: this.y, r },
        onDone: (shape) => {
          if (!this.alive) return;
          if (this.frozen) {
            this.arming = false;
            return;
          }
          const pl = this.game.player;
          if (!this.game.playerHidden && TelegraphSystem.hits(shape, pl.x, pl.y, pl.radius)) this.game.hurtPlayer(1);
          this.game.fx.burst(this.x, this.y, r, 0xff5a2a);
          Sound.play('explode');
          this.selfDestruct = true;
          this.takeDamage(99999, { flash: false });
        },
      });
    }
  }

  /** 自爆時不觸發「被打爆」的連鎖 */
  private selfDestruct = false;

  protected die(): void {
    if (!this.selfDestruct) {
      // 被玩家打爆：炸傷周圍敵人
      const x = this.x;
      const y = this.y;
      this.game.effects.delay(0.05, () => this.game.effects.explode(x, y, 70, 3, 0xff8a3d));
    }
    super.die();
  }

  protected sync(dt: number): void {
    super.sync(dt);
    if (this.arming) this.sprite.setScale(this.sprite.scaleX * (1 + 0.01 * Math.sin(this.game.time.now / 30)));
  }
}
