import Phaser from 'phaser';
import { ENEMIES, PASSIVES, WEAPONS } from '../config/balance';

/** 貼圖以 2 倍解析度產生，顯示時縮小一半，在高解析度手機上比較銳利 */
export const TEX = 2;

function poly(_g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, sides: number, rot = 0) {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function make(scene: Phaser.Scene, key: string, size: number, draw: (g: Phaser.GameObjects.Graphics, s: number) => void) {
  if (scene.textures.exists(key)) return;
  const s = size * TEX;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g, s);
  g.generateTexture(key, s, s);
  g.destroy();
}

export function createTextures(scene: Phaser.Scene): void {
  // 玩家：深色核心＋青色外框
  make(scene, 'player', 32, (g, s) => {
    const c = s / 2;
    g.fillStyle(0x3df5ff, 0.25);
    g.fillCircle(c, c, c);
    g.fillStyle(0x0c1620, 1);
    g.fillCircle(c, c, c * 0.78);
    g.lineStyle(3 * TEX, 0x3df5ff, 1);
    g.strokeCircle(c, c, c * 0.72);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c, c, c * 0.22);
  });
  // 面向指示
  make(scene, 'facing', 16, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(s, s / 2, 0, 0, 0, s);
  });

  const enemyShape: Record<string, number> = { drone: 4, thug: 4, husk: 0, gunner: 5, elite: 6, boss: 8 };
  for (const def of Object.values(ENEMIES)) {
    const size = def.radius * 2 + 4;
    make(scene, `e-${def.kind}`, size, (g, s) => {
      const c = s / 2;
      const r = c - 2 * TEX;
      const sides = enemyShape[def.kind];
      g.fillStyle(0x12060e, 1);
      g.lineStyle(2.5 * TEX, def.color, 1);
      if (sides === 0) {
        g.fillCircle(c, c, r);
        g.strokeCircle(c, c, r);
      } else {
        const rot = def.kind === 'drone' ? 0 : def.kind === 'thug' ? Math.PI / 4 : Math.PI / sides;
        const pts = poly(g, c, c, r, sides, rot);
        g.fillPoints(pts, true);
        g.strokePoints(pts, true, true);
      }
      // 眼睛
      g.fillStyle(def.color, 1);
      if (def.kind === 'boss') {
        g.fillTriangle(c - r * 0.55, c - r * 0.25, c - r * 0.15, c - r * 0.05, c - r * 0.5, c + r * 0.05);
        g.fillTriangle(c + r * 0.55, c - r * 0.25, c + r * 0.15, c - r * 0.05, c + r * 0.5, c + r * 0.05);
        g.fillRect(c - r * 0.35, c + r * 0.3, r * 0.7, r * 0.12);
        g.lineStyle(1.5 * TEX, def.color, 0.6);
        g.strokeCircle(c, c, r * 0.8);
      } else if (def.kind === 'elite') {
        g.fillRect(c - r * 0.5, c - r * 0.15, r, r * 0.22);
      } else {
        g.fillCircle(c - r * 0.3, c - r * 0.1, Math.max(1.5 * TEX, r * 0.16));
        g.fillCircle(c + r * 0.3, c - r * 0.1, Math.max(1.5 * TEX, r * 0.16));
      }
    });
  }

  const gem = (key: string, color: number, size: number) =>
    make(scene, key, size, (g, s) => {
      const c = s / 2;
      const pts = poly(g, c, c, c - TEX, 4, 0);
      g.fillStyle(color, 1);
      g.fillPoints(pts, true);
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(c - c * 0.2, c - c * 0.2, c * 0.2);
    });
  gem('gem1', 0x3df5ff, 10);
  gem('gem2', 0x7dff6a, 13);
  gem('gem3', 0xff7ad9, 17);

  make(scene, 'heal', 20, (g, s) => {
    g.fillStyle(0x0b2a14, 1);
    g.fillRoundedRect(0, 0, s, s, 4 * TEX);
    g.fillStyle(0x5dff7a, 1);
    g.fillRect(s * 0.4, s * 0.15, s * 0.2, s * 0.7);
    g.fillRect(s * 0.15, s * 0.4, s * 0.7, s * 0.2);
  });
  make(scene, 'magnet', 20, (g, s) => {
    const c = s / 2;
    g.lineStyle(4 * TEX, 0x4da6ff, 1);
    g.beginPath();
    g.arc(c, c, c * 0.6, Math.PI, 0, true);
    g.strokePath();
    g.fillStyle(0xff5a5a, 1);
    g.fillRect(c - c * 0.85, c, c * 0.5, c * 0.4);
    g.fillRect(c + c * 0.35, c, c * 0.5, c * 0.4);
  });
  make(scene, 'chest', 26, (g, s) => {
    g.fillStyle(0x2a1d05, 1);
    g.fillRoundedRect(TEX, s * 0.2, s - 2 * TEX, s * 0.7, 3 * TEX);
    g.lineStyle(2.5 * TEX, 0xffc83d, 1);
    g.strokeRoundedRect(TEX * 2, s * 0.2, s - 4 * TEX, s * 0.7, 3 * TEX);
    g.fillStyle(0xffc83d, 1);
    g.fillRect(TEX * 2, s * 0.45, s - 4 * TEX, 2 * TEX);
    g.fillRect(s * 0.42, s * 0.38, s * 0.16, s * 0.2);
  });
  make(scene, 'credit', 12, (g, s) => {
    const c = s / 2;
    g.fillStyle(0xffd84d, 1);
    g.fillCircle(c, c, c - TEX);
    g.fillStyle(0x7a5a00, 1);
    g.fillRect(c - TEX, c - c * 0.5, 2 * TEX, c);
  });
  make(scene, 'shuriken', 18, (g, s) => {
    const c = s / 2;
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? c - TEX : c * 0.35;
      pts.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
    }
    g.fillStyle(0xffe14d, 1);
    g.fillPoints(pts, true);
    g.fillStyle(0x0c1620, 1);
    g.fillCircle(c, c, c * 0.18);
  });
  make(scene, 'drone', 16, (g, s) => {
    const c = s / 2;
    g.fillStyle(0x7dff6a, 1);
    g.fillTriangle(s - TEX, c, TEX, TEX, s * 0.35, c);
    g.fillTriangle(s - TEX, c, TEX, s - TEX, s * 0.35, c);
  });
  make(scene, 'ring', 128, (g, s) => {
    const c = s / 2;
    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(c, c, c - 2 * TEX);
    g.lineStyle(3 * TEX, 0xffffff, 0.9);
    g.strokeCircle(c, c, c - 2 * TEX);
  });
  make(scene, 'spark', 8, (g, s) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(s / 2, s / 2, s / 2);
  });
  make(scene, 'bullet', 14, (g, s) => {
    const c = s / 2;
    g.fillStyle(0xff2244, 1);
    g.fillCircle(c, c, c);
    g.fillStyle(0xffd0d8, 1);
    g.fillCircle(c, c, c * 0.45);
  });

  // 道具圖示（升級卡片與 HUD 用）
  for (const w of Object.values(WEAPONS)) iconTexture(scene, `icon-${w.id}`, w.color, w.id);
  for (const p of Object.values(PASSIVES)) iconTexture(scene, `icon-${p.id}`, p.color, p.id);
  for (const c of ['jin', 'zero', 'tetsu']) {
    if (!scene.textures.exists(`char-${c}`)) make(scene, `char-${c}`, 32, (g, s) => {
      g.fillStyle(0x3df5ff, 1);
      g.fillCircle(s / 2, s / 2, s / 2 - TEX);
    });
  }
  iconTexture(scene, 'icon-heal', 0x5dff7a, 'heal');
  iconTexture(scene, 'icon-credits', 0xffd84d, 'credits');
}

function iconTexture(scene: Phaser.Scene, key: string, color: number, kind: string) {
  make(scene, key, 48, (g, s) => {
    const c = s / 2;
    g.fillStyle(0x0d0a18, 1);
    g.fillRoundedRect(0, 0, s, s, 8 * TEX);
    g.lineStyle(2 * TEX, color, 1);
    g.strokeRoundedRect(TEX, TEX, s - 2 * TEX, s - 2 * TEX, 8 * TEX);
    g.fillStyle(color, 1);
    g.lineStyle(3 * TEX, color, 1);
    switch (kind) {
      case 'katana':
        g.lineBetween(s * 0.25, s * 0.78, s * 0.78, s * 0.22);
        g.lineBetween(s * 0.2, s * 0.62, s * 0.38, s * 0.8);
        break;
      case 'sakura':
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          g.fillCircle(c + Math.cos(a) * s * 0.18, c + Math.sin(a) * s * 0.18, s * 0.12);
        }
        g.fillStyle(0xffffff, 1);
        g.fillCircle(c, c, s * 0.07);
        break;
      case 'drones':
        g.strokeCircle(c, c, s * 0.26);
        g.fillCircle(c + s * 0.26, c, s * 0.08);
        g.fillCircle(c - s * 0.26, c, s * 0.08);
        break;
      case 'shuriken': {
        const pts: Phaser.Types.Math.Vector2Like[] = [];
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = i % 2 === 0 ? s * 0.32 : s * 0.11;
          pts.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r });
        }
        g.fillPoints(pts, true);
        break;
      }
      case 'field':
        g.strokeCircle(c, c, s * 0.3);
        g.lineStyle(1.5 * TEX, color, 0.7);
        g.strokeCircle(c, c, s * 0.18);
        break;
      case 'might':
        g.fillTriangle(c, s * 0.2, s * 0.25, s * 0.6, s * 0.75, s * 0.6);
        g.fillRect(s * 0.42, s * 0.55, s * 0.16, s * 0.25);
        break;
      case 'haste':
        g.lineBetween(s * 0.55, s * 0.18, s * 0.35, s * 0.52);
        g.lineBetween(s * 0.35, s * 0.52, s * 0.62, s * 0.5);
        g.lineBetween(s * 0.62, s * 0.5, s * 0.42, s * 0.84);
        break;
      case 'armor':
        g.fillPoints(
          [
            { x: c, y: s * 0.18 },
            { x: s * 0.78, y: s * 0.3 },
            { x: s * 0.72, y: s * 0.62 },
            { x: c, y: s * 0.84 },
            { x: s * 0.28, y: s * 0.62 },
            { x: s * 0.22, y: s * 0.3 },
          ],
          true,
        );
        break;
      case 'magnet':
        g.beginPath();
        g.arc(c, c, s * 0.22, Math.PI, 0, true);
        g.strokePath();
        g.fillRect(s * 0.22, c - TEX, s * 0.12, s * 0.2);
        g.fillRect(s * 0.66, c - TEX, s * 0.12, s * 0.2);
        break;
      case 'heal':
        g.fillRect(s * 0.42, s * 0.22, s * 0.16, s * 0.56);
        g.fillRect(s * 0.22, s * 0.42, s * 0.56, s * 0.16);
        break;
      case 'credits':
        g.fillCircle(c, c, s * 0.26);
        g.fillStyle(0x0d0a18, 1);
        g.fillRect(c - TEX * 1.5, s * 0.34, TEX * 3, s * 0.32);
        break;
    }
  });
}
