import { Enemy } from '../Enemy';
import type { EnemyDef } from '../../types';
import type { GameScene } from '../../scenes/GameScene';

/** 分裂史萊姆：死亡時分裂成較小的史萊姆（最多分裂 2 代） */
export class Splitter extends Enemy {
  constructor(game: GameScene, def: EnemyDef, x: number, y: number, elite: boolean, texture: string, readonly gen = 0) {
    super(game, def, x, y, elite, texture);
    if (gen > 0) {
      const k = Math.pow(0.65, gen);
      this.radius *= k;
      this.maxHp = this.hp = this.maxHp * Math.pow(0.4, gen);
      this.speed *= 1 + 0.3 * gen;
      this.sprite.setDisplaySize(this.radius * 3.4, this.radius * 3.4);
    }
  }

  protected act(dt: number): void {
    const p = this.targetPoint();
    const wobble = 1 + 0.15 * Math.sin(this.game.time.now / 120 + this.x);
    this.moveToward(p.x, p.y, dt, this.speed * wobble);
  }

  protected die(): void {
    const maxGen = Number(this.def.generations ?? 2);
    if (this.gen < maxGen) {
      const n = Number(this.def.splits ?? 2);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const child = new Splitter(this.game, this.def, this.x + Math.cos(a) * 14, this.y + Math.sin(a) * 14,
          false, 'yarn', this.gen + 1);
        child.knockback(this.x, this.y, 40);
        this.game.addEnemy(child);
      }
    }
    super.die();
  }
}
