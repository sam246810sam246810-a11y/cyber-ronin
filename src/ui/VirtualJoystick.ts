import Phaser from 'phaser';
import { joystickVector, type Vec2 } from '../systems/movement';
import { pointerToLogical } from './camera';

/**
 * 浮動虛擬搖桿（PRD 11.1）：手指按在左半邊哪裡，搖桿就從哪裡出現。
 * 只追蹤一根手指，其他手指留給右半邊的按鈕（M2）。
 */
export class VirtualJoystick {
  readonly radius = 36;
  vector: Vec2 = { x: 0, y: 0 };
  get active(): boolean { return this.pointerId !== null; }
  onFirstMove?: () => void;

  private pointerId: number | null = null;
  private baseX = 0;
  private baseY = 0;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;

  constructor(private readonly scene: Phaser.Scene, private readonly zoneWidth: () => number) {
    this.base = scene.add.circle(0, 0, this.radius, 0xf2e6c9, 0.12).setStrokeStyle(1.5, 0xf2e6c9, 0.5).setVisible(false);
    this.knob = scene.add.circle(0, 0, 14, 0xf2e6c9, 0.55).setVisible(false);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
    });
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const pt = pointerToLogical(this.scene, p);
    if (this.pointerId !== null || pt.x > this.zoneWidth()) return;
    this.pointerId = p.id;
    this.baseX = pt.x; this.baseY = pt.y;
    this.base.setPosition(pt.x, pt.y).setVisible(true);
    this.knob.setPosition(pt.x, pt.y).setVisible(true);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    const pt = pointerToLogical(this.scene, p);
    const dx = pt.x - this.baseX, dy = pt.y - this.baseY;
    this.vector = joystickVector(dx, dy, this.radius);
    const dist = Math.hypot(dx, dy);
    const k = dist > this.radius ? this.radius / dist : 1;
    this.knob.setPosition(this.baseX + dx * k, this.baseY + dy * k);
    if (this.vector.x !== 0 || this.vector.y !== 0) { this.onFirstMove?.(); this.onFirstMove = undefined; }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.vector = { x: 0, y: 0 };
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }
}
