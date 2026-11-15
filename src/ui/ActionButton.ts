import Phaser from 'phaser';
import { FONT_FAMILY, RENDER_SCALE } from '../config';

/** 右下角的調查／對話鈕。附近有東西可以互動時才會亮起。 */
export class ActionButton {
  private readonly circle: Phaser.GameObjects.Arc;
  private readonly text: Phaser.GameObjects.Text;
  private enabled = false;

  constructor(scene: Phaser.Scene, x: number, y: number, onPress: () => void) {
    this.circle = scene.add.circle(x, y, 26, 0xc23b2f, 0.35).setStrokeStyle(1.5, 0xf2e6c9, 0.5).setDepth(900);
    this.text = scene.add.text(x, y, '調查', { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#f2e6c9', fontStyle: 'bold' })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(901).setAlpha(0.5);
    // 判定範圍比按鈕本身大一點，手指比較好按
    this.circle.setInteractive(new Phaser.Geom.Circle(26, 26, 36), Phaser.Geom.Circle.Contains);
    this.circle.on('pointerdown', () => {
      scene.tweens.add({ targets: [this.circle, this.text], scale: 0.88, duration: 60, yoyo: true });
      if (this.enabled) onPress();
    });
  }

  set(enabled: boolean, label: string): void {
    this.enabled = enabled;
    this.text.setText(label).setAlpha(enabled ? 1 : 0.5);
    this.circle.setFillStyle(0xc23b2f, enabled ? 0.85 : 0.35);
  }

  setVisible(v: boolean): void { this.circle.setVisible(v); this.text.setVisible(v); }
}
