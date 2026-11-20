import Phaser from 'phaser';
import { COLORS, DEPTH } from '../config';
import { angleDiff, dist, distToSegment } from '../utils';

export type TelegraphShape =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'sector'; x: number; y: number; angle: number; spread: number; len: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number };

export interface TelegraphOptions {
  shape: TelegraphShape;
  duration: number;
  owner?: object;
  color?: number;
  onDone?: (shape: TelegraphShape) => void;
}

interface Telegraph extends TelegraphOptions {
  elapsed: number;
  gfx: Phaser.GameObjects.Graphics;
  color: number;
}

/**
 * 敵人攻擊預警。以遊戲時間（dt）推進，所以暫停時也會一起停。
 */
export class TelegraphSystem {
  private list: Telegraph[] = [];

  constructor(private scene: Phaser.Scene) {}

  add(opts: TelegraphOptions): void {
    const gfx = this.scene.add.graphics().setDepth(DEPTH.telegraph);
    this.list.push({ ...opts, elapsed: 0, gfx, color: opts.color ?? COLORS.telegraph });
  }

  cancelOwner(owner: object): void {
    this.list = this.list.filter((t) => {
      if (t.owner === owner) {
        t.gfx.destroy();
        return false;
      }
      return true;
    });
  }

  clear(): void {
    this.list.forEach((t) => t.gfx.destroy());
    this.list = [];
  }

  update(dt: number): void {
    const done: Telegraph[] = [];
    for (const t of this.list) {
      t.elapsed += dt;
      const p = Math.min(1, t.elapsed / t.duration);
      this.draw(t, p);
      if (t.elapsed >= t.duration) done.push(t);
    }
    if (done.length) {
      this.list = this.list.filter((t) => !done.includes(t));
      for (const t of done) {
        t.gfx.destroy();
        t.onDone?.(t.shape);
      }
    }
  }

  private draw(t: Telegraph, p: number): void {
    const g = t.gfx;
    g.clear();
    const s = t.shape;
    const pulse = 0.6 + 0.4 * Math.sin(t.elapsed * 30);
    g.lineStyle(3, t.color, 0.9 * pulse);
    g.fillStyle(t.color, 0.12);
    switch (s.kind) {
      case 'circle':
        g.fillCircle(s.x, s.y, s.r);
        g.strokeCircle(s.x, s.y, s.r);
        g.fillStyle(t.color, 0.3);
        g.fillCircle(s.x, s.y, s.r * p);
        break;
      case 'sector': {
        const a0 = s.angle - s.spread / 2;
        const a1 = s.angle + s.spread / 2;
        g.slice(s.x, s.y, s.len, a0, a1, false);
        g.fillPath();
        g.strokePath();
        g.fillStyle(t.color, 0.3);
        g.slice(s.x, s.y, s.len * p, a0, a1, false);
        g.fillPath();
        break;
      }
      case 'line': {
        const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        const len = dist(s.x1, s.y1, s.x2, s.y2);
        const nx = Math.cos(ang + Math.PI / 2) * (s.width / 2);
        const ny = Math.sin(ang + Math.PI / 2) * (s.width / 2);
        const pts = (l: number) => [
          new Phaser.Math.Vector2(s.x1 + nx, s.y1 + ny),
          new Phaser.Math.Vector2(s.x1 + Math.cos(ang) * l + nx, s.y1 + Math.sin(ang) * l + ny),
          new Phaser.Math.Vector2(s.x1 + Math.cos(ang) * l - nx, s.y1 + Math.sin(ang) * l - ny),
          new Phaser.Math.Vector2(s.x1 - nx, s.y1 - ny),
        ];
        g.fillPoints(pts(len), true);
        g.strokePoints(pts(len), true);
        g.fillStyle(t.color, 0.3);
        g.fillPoints(pts(len * p), true);
        break;
      }
    }
  }

  /** 判定一個圓（例如玩家）是否在預警範圍內 */
  static hits(s: TelegraphShape, px: number, py: number, pr: number): boolean {
    switch (s.kind) {
      case 'circle':
        return dist(s.x, s.y, px, py) <= s.r + pr * 0.5;
      case 'sector': {
        const d = dist(s.x, s.y, px, py);
        if (d > s.len + pr * 0.5) return false;
        const a = Math.atan2(py - s.y, px - s.x);
        return Math.abs(angleDiff(a, s.angle)) <= s.spread / 2;
      }
      case 'line':
        return distToSegment(px, py, s.x1, s.y1, s.x2, s.y2) <= s.width / 2 + pr * 0.5;
    }
  }
}
