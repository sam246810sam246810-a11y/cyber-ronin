import Phaser from 'phaser';
import { FONT_FAMILY, RENDER_SCALE } from '../config';
import { pointerToLogical } from './camera';

export interface TouchButtonOptions {
  x: number; y: number; r: number; label: string; color?: number; fontSize?: number;
  onDown?: () => void; onUp?: () => void;
}

/**
 * 圓形觸控按鈕：支援按住／放開（弓術師蓄力）、冷卻扇形遮罩、MP 不足變暗。
 * 按下後即使手指滑出按鈕，放開時仍會觸發 onUp。
 */
export class TouchButton {
  private readonly circle: Phaser.GameObjects.Arc;
  private readonly text: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private readonly cd: Phaser.GameObjects.Graphics;
  private pointerId: number | null = null;
  private enabled = true;
  private readonly color: number;

  constructor(private readonly scene: Phaser.Scene, private readonly o: TouchButtonOptions) {
    this.color = o.color ?? 0x2a2640;
    this.circle = scene.add.circle(o.x, o.y, o.r, this.color, 0.7).setStrokeStyle(1.5, 0xf2e6c9, 0.6).setDepth(900);
    this.cd = scene.add.graphics().setDepth(901);
    this.text = scene.add.text(o.x, o.y, o.label, { fontFamily: FONT_FAMILY, fontSize: `${o.fontSize ?? 10}px`, color: '#f2e6c9', fontStyle: 'bold' })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(902);
    this.sub = scene.add.text(o.x, o.y + o.r * 0.55, '', { fontFamily: FONT_FAMILY, fontSize: '7px', color: '#9fd8ff' })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(902);

    scene.input.on('pointerdown', this.down, this);
    scene.input.on('pointerup', this.up, this);
    scene.input.on('pointerupoutside', this.up, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.down, this);
      scene.input.off('pointerup', this.up, this);
      scene.input.off('pointerupoutside', this.up, this);
    });
  }

  private down(p: Phaser.Input.Pointer): void {
    if (!this.circle.visible || this.pointerId !== null) return;
    const pt = pointerToLogical(this.scene, p);
    // 判定範圍比按鈕大 6px，比較好按
    if (Math.hypot(pt.x - this.o.x, pt.y - this.o.y) > this.o.r + 6) return;
    this.pointerId = p.id;
    this.circle.setScale(0.9); this.text.setScale(0.9);
    this.o.onDown?.();
  }

  private up(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.circle.setScale(1); this.text.setScale(1);
    this.o.onUp?.();
  }

  setLabel(label: string, highlight = false): void {
    this.text.setText(label);
    this.circle.setFillStyle(highlight ? 0xc23b2f : this.color, highlight ? 0.9 : 0.7);
  }

  setSub(s: string): void { this.sub.setText(s); }

  /** cooldown：剩餘比例 0..1；enabled=false 時變暗（例如 MP 不足） */
  setState(cooldown: number, enabled = true): void {
    this.enabled = enabled;
    this.cd.clear();
    if (cooldown > 0) {
      this.cd.fillStyle(0x000000, 0.55).slice(this.o.x, this.o.y, this.o.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cooldown, false).fillPath();
    }
    const a = this.enabled ? 1 : 0.4;
    this.text.setAlpha(a); this.sub.setAlpha(a);
  }

  /** 設定裡的按鈕透明度 */
  setOpacity(a: number): void { [this.circle, this.text, this.sub, this.cd].forEach((g) => g.setAlpha(a)); }

  setVisible(v: boolean): void {
    [this.circle, this.text, this.sub, this.cd].forEach((g) => g.setVisible(v));
    if (!v && this.pointerId !== null) { this.pointerId = null; this.o.onUp?.(); }
  }
}
