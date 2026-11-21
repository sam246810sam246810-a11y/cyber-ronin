import { Enemy } from '../Enemy';

/** 藤蔓爬蟲：直線追蹤玩家 */
export class Crawler extends Enemy {
  protected act(dt: number): void {
    const p = this.targetPoint();
    this.moveToward(p.x, p.y, dt);
    this.sprite.setFlipX(p.x < this.x);
  }
}
