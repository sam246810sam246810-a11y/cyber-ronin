import Phaser from 'phaser';
import { ARENA, ARENA_RIGHT, DEPTH } from '../config';
import { DIRS, type Dir, type DungeonSystem, type Room } from '../systems/DungeonSystem';
import type { RoomType } from '../types';

const TYPE_COLOR: Partial<Record<RoomType, number>> = {
  exit: 0xffd166,
  boss: 0xff4d6d,
  treasure: 0xffe14d,
  shop: 0x7eff8a,
  event: 0x7ed4ff,
  elite: 0xb36bff,
};

/** 右上角小地圖：走過的房間實心、相鄰的房間空心，特殊房間顯示顏色點 */
export class Minimap {
  private gfx: Phaser.GameObjects.Graphics;
  private readonly cell = 26;
  private readonly gap = 7;

  constructor(scene: Phaser.Scene, private dungeon: DungeonSystem) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.ui + 5);
  }

  draw(): void {
    const g = this.gfx;
    g.clear();
    const rooms = this.dungeon.rooms;
    const known = new Set<Room>();
    for (const r of rooms) {
      if (!r.visited) continue;
      known.add(r);
      for (const [dir, d] of Object.entries(DIRS) as [Dir, typeof DIRS.n][]) {
        if (!r.doors[dir]) continue;
        const n = this.dungeon.roomAt(r.gx + d.dx, r.gy + d.dy);
        if (n) known.add(n);
      }
    }
    const xs = [...known].map((r) => r.gx);
    const ys = [...known].map((r) => r.gy);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const step = this.cell + this.gap;
    const w = (maxX - minX + 1) * step + this.gap;
    const ox = ARENA_RIGHT - 10 - w;
    const oy = ARENA.y + 10;
    const h = (Math.max(...ys) - minY + 1) * step + this.gap;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(ox, oy, w, h, 6);
    const pos = (r: Room) => ({ x: ox + this.gap + (r.gx - minX) * step, y: oy + this.gap + (r.gy - minY) * step });

    // 通道
    g.lineStyle(3, 0xffffff, 0.35);
    for (const r of known) {
      if (!r.visited) continue;
      const a = pos(r);
      for (const [dir, d] of Object.entries(DIRS) as [Dir, typeof DIRS.n][]) {
        if (!r.doors[dir]) continue;
        const n = this.dungeon.roomAt(r.gx + d.dx, r.gy + d.dy);
        if (!n || !known.has(n)) continue;
        const b = pos(n);
        g.lineBetween(a.x + this.cell / 2, a.y + this.cell / 2, b.x + this.cell / 2, b.y + this.cell / 2);
      }
    }
    for (const r of known) {
      const { x, y } = pos(r);
      const cur = r === this.dungeon.current;
      if (r.visited) g.fillStyle(cur ? 0xffffff : 0x8a7aa8, cur ? 1 : 0.9).fillRect(x, y, this.cell, this.cell);
      else g.fillStyle(0x2a2235, 0.9).fillRect(x, y, this.cell, this.cell);
      g.lineStyle(2, cur ? 0xffd166 : 0xc9a3ff, cur ? 1 : 0.6).strokeRect(x, y, this.cell, this.cell);
      const c = TYPE_COLOR[r.type];
      if (c !== undefined && !(r.type === 'treasure' && r.used)) g.fillStyle(c, 1).fillCircle(x + this.cell / 2, y + this.cell / 2, 6.5);
      if (r.visited && !r.cleared && (r.type === 'combat' || r.type === 'elite')) {
        g.fillStyle(0xff3b3b, 1).fillCircle(x + this.cell - 5, y + 5, 3.5);
      }
    }
  }
}
