import Phaser from 'phaser';
import { DEPTH, RIGHT } from '../config';
import { DIRS, type Dir, type DungeonSystem, type Room } from '../systems/DungeonSystem';
import type { RoomType } from '../types';
import { hasIcon } from '../utils';

/** 小地圖上特殊房間的圖示（icons 圖集） */
const ROOM_ICON: Partial<Record<RoomType, string>> = {
  exit: 'room_exit', boss: 'room_boss', treasure: 'room_treasure', shop: 'room_shop', event: 'room_event', elite: 'room_elite',
  rift_past: 'room_rift', rift_future: 'room_rift',
};

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
  /** 小地圖底部 y（樓層字放在下面） */
  bottom = 120;
  private readonly cell = 26;
  private readonly gap = 7;

  /** 黃銅圓形小地圖（有美術時） */
  private frame?: Phaser.GameObjects.Image;
  private icons: Phaser.GameObjects.Image[] = [];
  private readonly art: boolean;
  private readonly R = 84;
  private readonly cxm: number;
  private readonly cym: number;

  constructor(private scene: Phaser.Scene, private dungeon: DungeonSystem) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.ui + 5);
    this.art = scene.textures.exists('ui_minimap') && hasIcon(scene, 'room_boss');
    this.cxm = RIGHT - 18 - this.R;
    this.cym = 84 + this.R;
    if (this.art) {
      this.frame = scene.add.image(this.cxm, this.cym, 'ui_minimap').setDisplaySize(this.R * 2, this.R * 2).setDepth(DEPTH.ui + 4);
      const maskShape = scene.make.graphics({}, false).fillCircle(this.cxm, this.cym, this.R * 0.8);
      this.gfx.setMask(maskShape.createGeometryMask());
      this.bottom = this.cym + this.R;
    }
  }

  setVisible(v: boolean): void {
    this.hidden = !v;
    this.gfx.setVisible(v);
    this.frame?.setVisible(v);
    this.icons.forEach((i) => i.setVisible(v));
  }

  private hidden = false;

  draw(): void {
    if (this.art) {
      this.drawArt();
      return;
    }
    const g = this.gfx;
    g.clear();
    if (this.hidden) return;
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
    const ox = RIGHT - 12 - w;
    const oy = 84;
    const h = (Math.max(...ys) - minY + 1) * step + this.gap;
    this.bottom = oy + h;
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

  /** 以目前房間為中心，房間是小圓角磚，特殊房間放圖示 */
  private drawArt(): void {
    const g = this.gfx;
    g.clear();
    this.icons.forEach((i) => i.destroy());
    this.icons = [];
    if (this.hidden) return;
    const cur = this.dungeon.current;
    if (!cur) return;
    const known = new Set<Room>();
    for (const r of this.dungeon.rooms) {
      if (!r.visited) continue;
      known.add(r);
      for (const [dir, d] of Object.entries(DIRS) as [Dir, typeof DIRS.n][]) {
        if (!r.doors[dir]) continue;
        const n = this.dungeon.roomAt(r.gx + d.dx, r.gy + d.dy);
        if (n) known.add(n);
      }
    }
    const step = 30;
    const cell = 22;
    const pos = (r: Room) => ({ x: this.cxm + (r.gx - cur.gx) * step, y: this.cym + (r.gy - cur.gy) * step });
    g.lineStyle(4, 0xe0b060, 0.55);
    for (const r of known) {
      if (!r.visited) continue;
      const a = pos(r);
      for (const [dir, d] of Object.entries(DIRS) as [Dir, typeof DIRS.n][]) {
        if (!r.doors[dir]) continue;
        const n = this.dungeon.roomAt(r.gx + d.dx, r.gy + d.dy);
        if (!n || !known.has(n)) continue;
        const b = pos(n);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    const inside = (x: number, y: number) => Math.hypot(x - this.cxm, y - this.cym) < this.R * 0.72;
    for (const r of known) {
      const { x, y } = pos(r);
      const isCur = r === cur;
      g.fillStyle(r.visited ? (isCur ? 0xfff1c0 : 0x8a6a48) : 0x2a2235, r.visited ? 1 : 0.85)
        .fillRoundedRect(x - cell / 2, y - cell / 2, cell, cell, 5);
      g.lineStyle(2, isCur ? 0xffd166 : 0xc9a35a, isCur ? 1 : 0.7).strokeRoundedRect(x - cell / 2, y - cell / 2, cell, cell, 5);
      const frame = ROOM_ICON[r.type];
      const done = r.type === 'treasure' && r.used;
      if (frame && !done && inside(x, y)) {
        this.icons.push(this.scene.add.image(x, y, 'icons', frame).setDisplaySize(20, 20).setDepth(DEPTH.ui + 6));
      } else if (r.visited && !r.cleared && (r.type === 'combat' || r.type === 'elite') && inside(x, y)) {
        g.fillStyle(0xff3b3b, 1).fillCircle(x + cell / 2 - 4, y - cell / 2 + 4, 3.5);
      }
    }
  }
}
