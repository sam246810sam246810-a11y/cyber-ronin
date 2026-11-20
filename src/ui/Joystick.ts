import Phaser from 'phaser';
import { DEPTH } from '../config';

/** 浮動虛擬搖桿：在指定區域內按下就出現 */
export class Joystick {
  x = 0;
  y = 0;
  private pointerId: number | null = null;
  private ox = 0;
  private oy = 0;
  private readonly base: Phaser.GameObjects.Image;
  private readonly knob: Phaser.GameObjects.Image;
  private readonly radius = 70;

  constructor(
    scene: Phaser.Scene,
    private zone: Phaser.Geom.Rectangle,
    private restX: number,
    private restY: number,
  ) {
    this.base = scene.add.image(restX, restY, 'ring').setDepth(DEPTH.ui).setAlpha(0.35)
      .setDisplaySize(this.radius * 2, this.radius * 2);
    this.knob = scene.add.image(restX, restY, 'circle').setDepth(DEPTH.ui + 1).setAlpha(0.5).setTint(0xc9a3ff)
      .setDisplaySize(56, 56);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once('shutdown', () => {
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
    });
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.pointerId !== null || over.length > 0) return;
    if (!this.zone.contains(p.x, p.y)) return;
    this.pointerId = p.id;
    this.ox = p.x;
    this.oy = p.y;
    this.base.setPosition(p.x, p.y).setAlpha(0.6);
    this.knob.setPosition(p.x, p.y).setAlpha(0.9);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    let dx = p.x - this.ox;
    let dy = p.y - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx = (dx / d) * this.radius;
      dy = (dy / d) * this.radius;
    }
    this.knob.setPosition(this.ox + dx, this.oy + dy);
    // 小死區
    const mag = Math.min(1, d / this.radius);
    this.x = mag < 0.12 ? 0 : dx / this.radius;
    this.y = mag < 0.12 ? 0 : dy / this.radius;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.x = this.y = 0;
    this.base.setPosition(this.restX, this.restY).setAlpha(0.35);
    this.knob.setPosition(this.restX, this.restY).setAlpha(0.5);
  }
}
