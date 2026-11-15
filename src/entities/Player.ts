import Phaser from 'phaser';
import { BASE_SPEED } from '../config';
import { facingFromVector, velocityFrom, type Facing, type Vec2 } from '../systems/movement';

const ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };
export const FACING_VEC: Record<Facing, Vec2> = { down: { x: 0, y: 1 }, up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = 'down';
  speed = BASE_SPEED;
  /** 瞄準方向（單位向量）：最後一次移動的方向，可以是斜的 */
  aim: Vec2 = { x: 0, y: 1 };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // 碰撞框只放在腳下，讓角色能走到牆壁和樹木前面一點。
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 7).setOffset(3, 9);
    this.setCollideWorldBounds(true);
  }

  static createAnims(scene: Phaser.Scene): void {
    (Object.keys(ROW) as Facing[]).forEach((f) => {
      const r = ROW[f] * 3;
      scene.anims.create({ key: `walk-${f}`, frames: scene.anims.generateFrameNumbers('player', { frames: [r + 1, r, r + 2, r] }), frameRate: 8, repeat: -1 });
      scene.anims.create({ key: `idle-${f}`, frames: [{ key: 'player', frame: r }] });
    });
  }

  get center(): Vec2 { const b = this.body as Phaser.Physics.Arcade.Body; return { x: b.center.x, y: b.center.y }; }

  setFacing(f: Facing): void { this.facing = f; this.aim = { ...FACING_VEC[f] }; }

  /** 一般移動。speedMult 用在攻擊時減速等情況。 */
  move(input: Vec2, speedMult = 1): void {
    const v = velocityFrom(input, this.speed * speedMult);
    this.setVelocity(v.x, v.y);
    const moving = v.x !== 0 || v.y !== 0;
    if (moving) {
      this.facing = facingFromVector(input, this.facing);
      const len = Math.hypot(input.x, input.y);
      this.aim = { x: input.x / len, y: input.y / len };
    }
    this.anims.play(`${moving ? 'walk' : 'idle'}-${this.facing}`, true);
    this.anims.timeScale = moving ? 0.6 + 0.4 * Math.min(1, Math.hypot(input.x, input.y)) : 1;
    this.setDepth(this.y);
  }

  /** 由外部決定速度（閃避、擊退、突刺），動畫維持走路。 */
  drive(vx: number, vy: number): void {
    this.setVelocity(vx, vy);
    this.anims.play(`walk-${this.facing}`, true);
    this.setDepth(this.y);
  }
}
