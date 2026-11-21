import { Enemy } from '../Enemy';

/** 小跑鼠：追到附近 → 蓄力 0.5 秒（直線預警）→ 快速突刺。走路碰到不會痛，只有突刺會 */
export class Crawler extends Enemy {
  protected act(dt: number): void {
    const p = this.targetPoint();
    if (this.tryLunge(dt, { range: 190, wind: 0.5, dist: 230, dur: 0.22, cd: 1.6 })) return;
    this.moveToward(p.x, p.y, dt);
    this.sprite.setFlipX(p.x < this.x);
  }
}
