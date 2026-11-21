import Phaser from 'phaser';

/**
 * 用 Graphics 畫的佔位角色：貓咪煉金術師與時空鼠軍團。
 * 之後換正式美術時，在 PreloadScene 用 this.load.image() 載入同名 key 即可。
 */
type G = Phaser.GameObjects.Graphics;

interface CatStyle {
  fur: number;
  inner: number;
  eye: number;
  extra?: (g: G) => void;
}

/** 正面 Q 版貓咪頭像（64×64） */
function drawCat(g: G, s: CatStyle): void {
  // 尾巴
  g.lineStyle(7, s.fur, 1);
  g.beginPath();
  g.arc(50, 52, 10, Math.PI * 0.9, Math.PI * 1.9, false);
  g.strokePath();
  // 耳朵
  g.fillStyle(s.fur).fillTriangle(9, 4, 6, 32, 28, 18).fillTriangle(55, 4, 58, 32, 36, 18);
  g.fillStyle(s.inner).fillTriangle(11, 10, 10, 28, 23, 19).fillTriangle(53, 10, 54, 28, 41, 19);
  // 頭
  g.fillStyle(s.fur).fillEllipse(32, 37, 52, 46);
  // 額外花紋（在臉之前畫，眼睛蓋在上面）
  s.extra?.(g);
  // 臉頰紅暈
  g.fillStyle(0xff8fa8, 0.55).fillCircle(17, 43, 5).fillCircle(47, 43, 5);
  // 眼睛
  g.fillStyle(0x1a1420).fillEllipse(23, 35, 10, 12).fillEllipse(41, 35, 10, 12);
  g.fillStyle(s.eye).fillCircle(23, 36, 3).fillCircle(41, 36, 3);
  g.fillStyle(0xffffff).fillCircle(21, 32, 2).fillCircle(39, 32, 2);
  // 鼻子與嘴
  g.fillStyle(0xff7a9a).fillTriangle(29, 42, 35, 42, 32, 45);
  g.lineStyle(2, 0x1a1420, 1);
  g.beginPath();
  g.arc(29, 45, 3, 0, Math.PI, false);
  g.strokePath();
  g.beginPath();
  g.arc(35, 45, 3, 0, Math.PI, false);
  g.strokePath();
  // 鬍鬚
  g.lineStyle(1.5, 0x1a1420, 0.7);
  g.lineBetween(12, 42, 1, 39).lineBetween(12, 46, 1, 48).lineBetween(52, 42, 63, 39).lineBetween(52, 46, 63, 48);
}

/** 白底老鼠（會被敵人顏色上色） */
function drawMouse(g: G, extra?: (g: G) => void): void {
  g.lineStyle(4, 0xdddddd, 1);
  g.beginPath();
  g.arc(52, 54, 9, Math.PI * 1.0, Math.PI * 2.1, false);
  g.strokePath();
  g.fillStyle(0xffffff).fillCircle(15, 17, 12).fillCircle(49, 17, 12);
  g.fillStyle(0xf0c0c8).fillCircle(15, 17, 7).fillCircle(49, 17, 7);
  g.fillStyle(0xffffff).fillEllipse(32, 38, 46, 42);
  extra?.(g);
  g.fillStyle(0x1a1420).fillCircle(24, 35, 4).fillCircle(40, 35, 4);
  g.fillStyle(0xff3b3b).fillCircle(24, 35, 1.5).fillCircle(40, 35, 1.5);
  g.fillStyle(0xff7a9a).fillCircle(32, 45, 3.5);
  g.lineStyle(1.5, 0x555555, 0.8).lineBetween(26, 46, 12, 44).lineBetween(38, 46, 52, 44);
}

export function generateSprites(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const gen = (key: string, w: number, h: number, draw: () => void) => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };

  // ---- 貓咪們 ----
  gen('cat_apprentice', 64, 64, () => drawCat(g, {
    fur: 0xffa64d, inner: 0xffd1a8, eye: 0x7a4a10,
    extra: (gg) => {
      gg.fillStyle(0xd9741a).fillRect(29, 15, 6, 9).fillRect(21, 17, 4, 7).fillRect(39, 17, 4, 7);
      gg.fillStyle(0xfff0dc).fillEllipse(32, 50, 26, 14);
    },
  }));
  gen('cat_frost_archer', 64, 64, () => drawCat(g, {
    fur: 0xf6f8ff, inner: 0xffd6e0, eye: 0x3aa0ff,
    extra: (gg) => {
      gg.fillStyle(0x7ed4ff).fillRoundedRect(12, 54, 40, 9, 4);
      gg.fillStyle(0xb8f0ff).fillTriangle(32, 6, 36, 16, 28, 16).fillTriangle(32, 24, 36, 16, 28, 16);
    },
  }));
  gen('cat_lava_knight', 64, 64, () => drawCat(g, {
    fur: 0x3a3a44, inner: 0xff8a3d, eye: 0xffa040,
    extra: (gg) => {
      gg.fillStyle(0xff8a3d).fillTriangle(32, 14, 36, 24, 28, 24);
      gg.fillStyle(0xff5a2a, 0.8).fillRect(14, 26, 6, 3).fillRect(44, 26, 6, 3);
      gg.fillStyle(0x5a5a66).fillEllipse(32, 51, 24, 12);
    },
  }));
  gen('cat_storm_sage', 64, 64, () => drawCat(g, {
    fur: 0xfaf6ee, inner: 0xffd1a8, eye: 0x4ac06a,
    extra: (gg) => {
      gg.fillStyle(0xff9a3d).fillEllipse(19, 30, 18, 16);
      gg.fillStyle(0x2a2a30).fillEllipse(46, 28, 16, 14);
      // 頭上的雷菇
      gg.fillStyle(0xfff4c2).fillRect(29, 6, 6, 10);
      gg.fillStyle(0xffe14d).fillEllipse(32, 6, 26, 12);
      gg.fillStyle(0x6a4a00).fillTriangle(33, 1, 29, 7, 32, 7).fillTriangle(31, 6, 35, 6, 30, 11);
    },
  }));
  gen('cat_gray', 64, 64, () => drawCat(g, {
    fur: 0x9a9aaa, inner: 0xd8c0d0, eye: 0xc9a3ff,
    extra: (gg) => {
      gg.fillStyle(0x6a4a9a).fillTriangle(32, -2, 46, 16, 18, 16);
      gg.fillStyle(0xffd166).fillCircle(32, 6, 3);
    },
  }));
  gen('cat_merchant', 64, 64, () => drawCat(g, {
    fur: 0x2a2a34, inner: 0x7ed4ff, eye: 0x7ed4ff,
    extra: (gg) => {
      gg.fillStyle(0x1a1a24).fillRect(20, 2, 24, 14).fillRect(14, 14, 36, 4);
      gg.fillStyle(0x7ed4ff).fillRect(20, 10, 24, 3);
    },
  }));

  // ---- 時空鼠軍團 ----
  gen('mouse', 64, 64, () => drawMouse(g));
  gen('mouse_dart', 64, 64, () => drawMouse(g, (gg) => {
    gg.fillStyle(0x888888).fillRect(29, 46, 6, 18);
    gg.fillStyle(0xffffff).fillCircle(32, 46, 5);
  }));
  gen('mouse_bomb', 64, 64, () => {
    g.fillStyle(0xffffff).fillCircle(15, 16, 10).fillCircle(49, 16, 10);
    g.fillStyle(0xffffff).fillCircle(32, 38, 24);
    g.fillStyle(0xbbbbbb).fillRect(28, 8, 8, 7);
    g.lineStyle(3, 0x8a6a3a).lineBetween(32, 8, 38, 1);
    g.fillStyle(0xffd166).fillCircle(39, 2, 3);
    g.fillStyle(0x1a1420).fillCircle(24, 36, 4).fillCircle(40, 36, 4);
    g.fillStyle(0xff3b3b).fillCircle(24, 36, 1.5).fillCircle(40, 36, 1.5);
  });
  gen('mouse_armor', 64, 64, () => drawMouse(g, (gg) => {
    gg.fillStyle(0xbfc4cc).fillEllipse(32, 24, 44, 18);
    gg.lineStyle(2, 0x7a7f88).strokeEllipse(32, 24, 44, 18);
    gg.fillStyle(0x7a7f88).fillRect(30, 14, 4, 18);
  }));
  gen('frog', 64, 64, () => {
    g.fillStyle(0xffffff).fillEllipse(32, 40, 54, 40);
    g.fillStyle(0xffffff).fillCircle(18, 20, 11).fillCircle(46, 20, 11);
    g.fillStyle(0x1a1420).fillCircle(18, 20, 5).fillCircle(46, 20, 5);
    g.fillStyle(0xffffff).fillCircle(16, 18, 2).fillCircle(44, 18, 2);
    g.lineStyle(2, 0x555555).beginPath();
    g.arc(32, 40, 12, 0.2, Math.PI - 0.2, false);
    g.strokePath();
    g.fillStyle(0xdddddd).fillEllipse(12, 58, 18, 8).fillEllipse(52, 58, 18, 8);
  });
  gen('yarn', 64, 64, () => {
    g.fillStyle(0xffffff).fillCircle(32, 34, 26);
    g.lineStyle(3, 0xc8c8c8);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(32 + (i - 2) * 6, 34, 22 - Math.abs(i - 2) * 3, -1.2, 1.2, false);
      g.strokePath();
    }
    g.lineStyle(3, 0xffffff).lineBetween(52, 50, 62, 62);
    g.fillStyle(0x1a1420).fillCircle(24, 30, 3.5).fillCircle(40, 30, 3.5);
  });
  gen('clock_ghost', 64, 64, () => {
    g.fillStyle(0xffffff).fillCircle(32, 26, 22).fillRect(10, 26, 44, 24);
    g.fillTriangle(10, 50, 20, 50, 15, 62).fillTriangle(27, 50, 37, 50, 32, 62).fillTriangle(44, 50, 54, 50, 49, 62);
    g.fillStyle(0xe8e0ff).fillCircle(32, 30, 13);
    g.lineStyle(2, 0x555577).strokeCircle(32, 30, 13);
    g.lineStyle(3, 0x333355).lineBetween(32, 30, 32, 21).lineBetween(32, 30, 39, 33);
    g.fillStyle(0x1a1420).fillCircle(24, 14, 3).fillCircle(40, 14, 3);
  });
  gen('rat_king', 64, 64, () => drawMouse(g, (gg) => {
    gg.fillStyle(0xffd166).fillTriangle(18, 18, 24, 4, 28, 18).fillTriangle(26, 18, 32, 2, 38, 18).fillTriangle(36, 18, 40, 4, 46, 18);
    gg.fillStyle(0xffd166).fillRect(18, 14, 28, 6);
    gg.fillStyle(0xff7eb6).fillCircle(32, 10, 3);
    gg.fillStyle(0x7eff8a).fillEllipse(32, 58, 34, 8);
  }));
  gen('doctor_rat', 64, 64, () => drawMouse(g, (gg) => {
    gg.fillStyle(0xf4f4ff).fillTriangle(10, 64, 32, 46, 54, 64);
    gg.fillStyle(0x333344).fillRect(14, 28, 36, 5);
    gg.fillStyle(0x7ed4ff).fillCircle(24, 31, 7).fillCircle(40, 31, 7);
    gg.lineStyle(2, 0x333344).strokeCircle(24, 31, 7).strokeCircle(40, 31, 7);
    gg.fillStyle(0xffe14d).fillTriangle(30, 6, 38, 6, 28, 18);
  }));
  g.destroy();
}
