import Phaser from 'phaser';

/**
 * 第一階段：所有圖都用 Graphics 動態產生的幾何佔位圖。
 * 第二階段接 Higgsfield 美術時，在 preload() 用 this.load.image() 載入同名 key 即可替換。
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const gen = (key: string, w: number, h: number, draw: () => void) => {
      if (this.textures.exists(key)) return;
      g.clear();
      draw();
      g.generateTexture(key, w, h);
    };

    gen('circle', 64, 64, () => g.fillStyle(0xffffff).fillCircle(32, 32, 32));
    gen('ring', 64, 64, () => g.lineStyle(5, 0xffffff).strokeCircle(32, 32, 29));
    gen('triangle', 64, 64, () => g.fillStyle(0xffffff).fillTriangle(32, 2, 62, 60, 2, 60));
    gen('shadow', 64, 24, () => g.fillStyle(0x000000).fillEllipse(32, 12, 64, 24));
    gen('thorn', 16, 32, () => g.fillStyle(0xffffff).fillTriangle(8, 0, 16, 32, 0, 32));
    gen('flower', 64, 64, () => {
      g.fillStyle(0xffffff);
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        g.fillCircle(32 + Math.cos(a) * 18, 32 + Math.sin(a) * 18, 13);
      }
      g.fillStyle(0xdddddd).fillCircle(32, 32, 14);
    });
    gen('mushroom', 64, 64, () => {
      g.fillStyle(0xeeeeee).fillRect(22, 30, 20, 30);
      g.fillStyle(0xffffff).fillEllipse(32, 26, 64, 44);
      g.fillStyle(0xbbbbbb).fillCircle(20, 20, 5).fillCircle(42, 16, 6).fillCircle(36, 32, 4);
    });
    gen('flask', 52, 64, () => {
      g.fillStyle(0xffffff).fillCircle(26, 40, 22);
      g.fillRect(19, 6, 14, 22);
      g.fillStyle(0xcccccc).fillRect(16, 2, 20, 7);
      g.fillStyle(0xffffff, 0.6).fillCircle(18, 34, 6);
    });
    gen('heart', 64, 60, () => {
      g.fillStyle(0xff4d6d).fillCircle(18, 20, 17).fillCircle(46, 20, 17);
      g.fillTriangle(2, 26, 62, 26, 32, 58);
    });
    gen('slot', 80, 80, () => {
      g.fillStyle(0x000000, 0.45).fillRoundedRect(2, 2, 76, 76, 14);
      g.lineStyle(4, 0xffffff, 0.8).strokeRoundedRect(2, 2, 76, 76, 14);
    });
    gen('cauldron', 290, 100, () => {
      g.fillStyle(0xffffff, 0.35).fillRoundedRect(4, 10, 282, 86, 36);
      g.lineStyle(4, 0xffffff, 0.6).strokeRoundedRect(4, 10, 282, 86, 36);
    });
    // 藥材圖示（直接上色，不使用 tint）
    gen('ing_J', 64, 64, () => {
      g.fillStyle(0xff7eb6).fillCircle(32, 36, 24);
      g.fillStyle(0xffb3d4).fillCircle(24, 28, 8);
      g.lineStyle(3, 0x9a2f6e).strokeCircle(32, 36, 24);
    });
    gen('ing_I', 64, 64, () => {
      g.fillStyle(0x7ed4ff).fillPoints([
        new Phaser.Math.Vector2(32, 2), new Phaser.Math.Vector2(54, 32),
        new Phaser.Math.Vector2(32, 62), new Phaser.Math.Vector2(10, 32),
      ], true);
      g.fillStyle(0xd6f3ff).fillTriangle(32, 8, 44, 32, 32, 32);
      g.lineStyle(3, 0x2a6a9a).strokePoints([
        new Phaser.Math.Vector2(32, 2), new Phaser.Math.Vector2(54, 32),
        new Phaser.Math.Vector2(32, 62), new Phaser.Math.Vector2(10, 32),
      ], true);
    });
    gen('ing_S', 64, 64, () => {
      g.fillStyle(0x7eff8a).fillCircle(32, 32, 22);
      g.fillStyle(0x3a9a46).fillCircle(24, 26, 5).fillCircle(40, 30, 6).fillCircle(30, 42, 4);
      g.fillStyle(0x7eff8a).fillCircle(12, 14, 6).fillCircle(54, 50, 5).fillCircle(52, 12, 4);
    });
    g.destroy();

    this.scene.start('MainMenu');
  }
}
