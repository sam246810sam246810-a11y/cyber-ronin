import Phaser from 'phaser';
import { BASE_SPEED } from '../config';
import { facingFromVector, velocityFrom, type Facing, type Vec2 } from '../systems/movement';

const ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };

export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = 'down';
  speed = BASE_SPEED;

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

  move(input: Vec2): void {
    const v = velocityFrom(input, this.speed);
    this.setVelocity(v.x, v.y);
    this.facing = facingFromVector(input, this.facing);
    const moving = v.x !== 0 || v.y !== 0;
    this.anims.play(`${moving ? 'walk' : 'idle'}-${this.facing}`, true);
    // 推得越用力走越快，動畫也跟著加快。
    this.anims.timeScale = moving ? 0.6 + 0.4 * Math.min(1, Math.hypot(input.x, input.y)) : 1;
    // 用 y 座標排序，讓角色走到物件後面時被正確遮住（之後加物件精靈時用得到）。
    this.setDepth(this.y);
  }
}
