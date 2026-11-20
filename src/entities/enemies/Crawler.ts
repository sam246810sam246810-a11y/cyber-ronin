import { Enemy } from '../Enemy';

/** 藤蔓爬蟲：直線追蹤玩家 */
export class Crawler extends Enemy {
  protected act(dt: number): void {
    const p = this.game.player;
    this.moveToward(p.x, p.y, dt);
    this.sprite.setRotation(Math.atan2(p.y - this.y, p.x - this.x) + Math.PI / 2);
  }
}
