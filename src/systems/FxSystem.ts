import Phaser from 'phaser';
import { DEPTH, FONT } from '../config';

/** 佔位用的簡單特效 */
export class FxSystem {
  private numberPool: Phaser.GameObjects.Text[] = [];
  private activeNumbers = 0;

  constructor(private scene: Phaser.Scene) {}

  /** 傷害數字（物件池，同時最多 40 個） */
  damageNumber(x: number, y: number, amount: number, crit: boolean): void {
    if (this.activeNumbers >= 40) return;
    let t = this.numberPool.pop();
    if (!t) {
      t = this.scene.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(DEPTH.fx + 6);
    }
    this.activeNumbers++;
    const v = amount >= 10 ? Math.round(amount) : Math.round(amount * 10) / 10;
    t.setText(crit ? `${v}!` : String(v))
      .setFontSize(crit ? 28 : 18)
      .setColor(crit ? '#ffe14d' : '#ffffff')
      .setPosition(x + (Math.random() - 0.5) * 20, y)
      .setAlpha(1).setScale(crit ? 1.4 : 1).setVisible(true);
    this.scene.tweens.add({
      targets: t, y: y - 36, scale: 1, duration: 420, ease: 'Quad.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: t, alpha: 0, duration: 160,
          onComplete: () => {
            t!.setVisible(false);
            this.numberPool.push(t!);
            this.activeNumbers--;
          },
        });
      },
    });
  }

  /** 死亡碎片 */
  shatter(x: number, y: number, color: number, r: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const d = r * (1.2 + Math.random());
      const sz = 5 + Math.random() * 7;
      const p = this.scene.add.image(x, y, 'square').setTint(color).setDisplaySize(sz, sz).setDepth(DEPTH.fx)
        .setRotation(Math.random() * 3);
      this.scene.tweens.add({
        targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, angle: 360, alpha: 0, duration: 380 + Math.random() * 200,
        ease: 'Quad.Out', onComplete: () => p.destroy(),
      });
    }
  }

  /** 擴散圓圈爆炸 */
  burst(x: number, y: number, r: number, color: number, duration = 260): void {
    const fill = this.scene.add.image(x, y, 'circle').setTint(color).setAlpha(0.55).setDepth(DEPTH.fx)
      .setDisplaySize(r * 0.6, r * 0.6);
    this.scene.tweens.add({
      targets: fill,
      displayWidth: r * 2,
      displayHeight: r * 2,
      alpha: 0,
      duration,
      ease: 'Quad.Out',
      onComplete: () => fill.destroy(),
    });
    const ring = this.scene.add.image(x, y, 'ring').setTint(color).setAlpha(0.9).setDepth(DEPTH.fx)
      .setDisplaySize(r * 0.8, r * 0.8);
    this.scene.tweens.add({
      targets: ring,
      displayWidth: r * 2.1,
      displayHeight: r * 2.1,
      alpha: 0,
      duration: duration + 80,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });
  }

  sparks(x: number, y: number, color: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 20 + Math.random() * 30;
      const s = this.scene.add.image(x, y, 'circle').setTint(color).setDisplaySize(6, 6).setDepth(DEPTH.fx);
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        duration: 300,
        onComplete: () => s.destroy(),
      });
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, color: number, width = 4): void {
    const g = this.scene.add.graphics().setDepth(DEPTH.fx);
    g.lineStyle(width, color, 1).lineBetween(x1, y1, x2, y2);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  floatText(x: number, y: number, text: string, color = '#ffffff', size = 22): void {
    const t = this.scene.add.text(x, y, text, {
      fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.fx + 5);
    this.scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }
}
