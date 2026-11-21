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
    gen('square', 16, 16, () => g.fillStyle(0xffffff).fillRect(0, 0, 16, 16));
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
    gen('ing_F', 64, 64, () => {
      g.fillStyle(0xff8a3d);
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        g.fillCircle(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 12);
      }
      g.fillStyle(0xffd166).fillCircle(32, 32, 9);
      g.fillStyle(0xff4d1a).fillTriangle(32, 2, 40, 18, 24, 18);
    });
    gen('ing_T', 64, 64, () => {
      g.fillStyle(0xfff4c2).fillRect(26, 32, 12, 26);
      g.fillStyle(0xffe14d).fillEllipse(32, 28, 58, 34);
      g.fillStyle(0x6a4a00).fillTriangle(34, 14, 24, 32, 32, 32);
      g.fillTriangle(30, 30, 40, 30, 28, 46);
    });
    gen('snail', 64, 64, () => {
      g.fillStyle(0xffffff).fillEllipse(30, 46, 60, 26);
      g.fillStyle(0xdddddd).fillCircle(36, 30, 22);
      g.lineStyle(4, 0x999999).strokeCircle(36, 30, 13);
      g.fillStyle(0xffffff).fillRect(6, 22, 5, 18).fillRect(14, 20, 5, 20);
    });
    gen('slime', 64, 64, () => {
      g.fillStyle(0xffffff).fillEllipse(32, 40, 60, 44);
      g.fillStyle(0xdddddd).fillCircle(22, 34, 5).fillCircle(42, 34, 5);
    });
    gen('beetle', 64, 64, () => {
      g.fillStyle(0xffffff).fillEllipse(32, 34, 50, 58);
      g.lineStyle(3, 0x888888).lineBetween(32, 8, 32, 62);
      g.fillStyle(0xcccccc).fillCircle(32, 8, 9);
    });
    gen('bomb', 64, 64, () => {
      g.fillStyle(0xffffff).fillCircle(32, 36, 26);
      g.fillStyle(0xffd166).fillTriangle(30, 2, 38, 12, 26, 12);
      g.fillStyle(0xaaaaaa).fillRect(28, 8, 8, 6);
    });
    gen('wisp', 64, 64, () => {
      g.fillStyle(0xffffff).fillCircle(32, 28, 20);
      g.fillTriangle(12, 30, 52, 30, 32, 64);
      g.fillStyle(0x777777).fillCircle(25, 26, 4).fillCircle(39, 26, 4);
    });
    gen('chest', 64, 64, () => {
      g.fillStyle(0x8a5a2a).fillRect(6, 24, 52, 34);
      g.fillStyle(0xa86a32).fillRoundedRect(6, 10, 52, 20, 8);
      g.fillStyle(0xffd166).fillRect(6, 26, 52, 5).fillRect(28, 20, 8, 16);
    });
    gen('fountain', 64, 64, () => {
      g.fillStyle(0x8aa0b8).fillEllipse(32, 50, 60, 22);
      g.fillStyle(0x7ed4ff).fillEllipse(32, 46, 48, 14);
      g.fillStyle(0xb8d8f0).fillRect(28, 14, 8, 32);
      g.fillStyle(0x7ed4ff).fillCircle(32, 12, 9);
    });
    gen('merchant', 64, 64, () => {
      g.fillStyle(0x6a4a9a).fillTriangle(32, 4, 56, 60, 8, 60);
      g.fillStyle(0xf4d8b0).fillCircle(32, 26, 10);
      g.fillStyle(0xffd166).fillCircle(46, 48, 8);
    });
    gen('altar', 64, 64, () => {
      g.fillStyle(0x5a4a6a).fillRect(10, 40, 44, 20);
      g.fillStyle(0x7a6a8a).fillRect(18, 20, 28, 22);
      g.fillStyle(0xb36bff).fillCircle(32, 14, 10);
    });
    gen('stairs', 64, 64, () => {
      g.fillStyle(0x1a1420).fillRoundedRect(4, 4, 56, 56, 10);
      for (let i = 0; i < 4; i++) g.fillStyle(0xffd166, 0.4 + i * 0.15).fillRect(10 + i * 6, 14 + i * 11, 44 - i * 12, 8);
      g.lineStyle(3, 0xffd166).strokeRoundedRect(4, 4, 56, 56, 10);
    });
    gen('coin', 32, 32, () => {
      g.fillStyle(0xffc43d).fillCircle(16, 16, 14);
      g.fillStyle(0xffe58a).fillCircle(13, 13, 6);
      g.lineStyle(2, 0xb07a10).strokeCircle(16, 16, 14);
    });
    // 角色佔位圖（白色可上色）
    gen('hero', 64, 64, () => {
      g.fillStyle(0xffffff).fillCircle(32, 36, 24);
      g.fillTriangle(10, 22, 54, 22, 32, -6);
      g.fillStyle(0xcccccc).fillRect(8, 20, 48, 6);
    });
    g.destroy();

    this.scene.start('MainMenu');
  }
}
