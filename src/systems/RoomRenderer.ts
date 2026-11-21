import Phaser from 'phaser';
import { DEPTH, ySortDepth } from '../config';
import type { RegionTheme } from '../types';
import { WALL, type RoomLayout, type Rect } from './WorldSystem';
import type { Dir } from './DungeonSystem';

/**
 * 把 RoomLayout 畫出來（積木式拼接）：
 *   地板 → 後牆（含北拱門）→ 左右側牆（含側拱門）→ 走廊（盡頭漸暗）→ 牆塊／擺設／草叢（依 y 前後排序）→ 下緣矮樹籬
 * 各區積木 key 以 `${kit}_wall_back` 這種格式命名；沒有載入時退回程式畫的色塊，照樣能玩。
 */
export class RoomRenderer {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private barriers: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene) {}

  clear(): void {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.clearBarriers();
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private has(key: string): boolean {
    return this.scene.textures.exists(key);
  }

  /** tint：還沒有專屬積木的區域，先用溫室積木染成該區的色調 */
  build(l: RoomLayout, theme: RegionTheme, kit: string, tint?: number): void {
    this.clear();
    const s = this.scene;
    s.cameras.main.setBackgroundColor('#08060c');
    const i = l.interior;
    const kitFloor = this.has(`${kit}_floor`) ? `${kit}_floor` : undefined;
    const floorKey = kitFloor ?? (theme.floorTex && this.has(theme.floorTex) ? theme.floorTex : undefined);

    // ---- 地板：內部＋走廊 ----
    const floorRect = (r: Rect, tint = 0xc8c8c8) => {
      if (floorKey) {
        // 積木地板用原色（區域色調在最後統一染）；舊的區域地板沿用原本的壓暗
        const ts = kitFloor ? 0.62 : 0.5;
        this.add(s.add.tileSprite(r.x, r.y, r.w, r.h, floorKey).setOrigin(0, 0).setDepth(DEPTH.floor - 2)
          .setTileScale(ts, ts).setTilePosition(r.x / ts, r.y / ts).setTint(kitFloor ? (r === i ? 0xffffff : 0xb0a8a8) : theme.floorTint ?? tint));
      } else {
        this.add(s.add.rectangle(r.x, r.y, r.w, r.h, Phaser.Display.Color.HexStringToColor(theme.floor).color).setOrigin(0, 0).setDepth(DEPTH.floor - 2));
      }
    };
    floorRect(i);
    for (const c of l.corridors) floorRect(c, 0x9a9090);
    const floorCount = kitFloor ? 0 : this.objs.length;

    // 走廊盡頭漸暗：暗示「那邊還有路」
    for (const c of l.corridors) this.corridorFog(c.dir, c);

    // ---- 後牆（北） ----
    const wallBack = `${kit}_wall_back`;
    const top = i.y - WALL.back;
    const left = i.x - WALL.side;
    const right = i.x + i.w + WALL.side;
    const north = l.corridors.find((c) => c.dir === 'n');
    const segs: [number, number][] = north
      ? [[left, north.x], [north.x + north.w, right]]
      : [[left, right]];
    for (const [a, b] of segs) {
      if (b - a <= 2) continue;
      if (this.has(wallBack)) {
        const tex = s.textures.get(wallBack).getSourceImage() as HTMLImageElement;
        const sc = WALL.back / tex.height;
        this.add(s.add.tileSprite(a, top, b - a, WALL.back, wallBack).setOrigin(0, 0).setTileScale(sc, sc)
          .setTilePosition(a / sc, 0).setDepth(DEPTH.floor - 1));
      } else {
        this.add(s.add.rectangle(a, top, b - a, WALL.back, 0x3a3340).setOrigin(0, 0).setDepth(DEPTH.floor - 1));
      }
    }
    if (north) {
      // 北拱門：立在走廊開口上，拱門下方就是通往下一間的走廊
      const key = `${kit}_arch_n`;
      if (this.has(key)) {
        this.add(s.add.image(north.x + north.w / 2, i.y + 8, key).setOrigin(0.5, 1).setDisplaySize(north.w + 120, WALL.back + 120)
          .setDepth(DEPTH.floor));
      }
    }

    // ---- 左右側牆 ----
    const sideKey = `${kit}_wall_side`;
    const sideTop = top;
    const sideBottom = i.y + i.h + WALL.bottom;
    for (const dir of ['w', 'e'] as Dir[]) {
      const x = dir === 'w' ? i.x - WALL.side : i.x + i.w;
      const door = l.corridors.find((c) => c.dir === dir);
      const parts: [number, number][] = door ? [[sideTop, door.y], [door.y + door.h, sideBottom]] : [[sideTop, sideBottom]];
      for (const [a, b] of parts) this.sideWall(x, a, WALL.side, b - a, sideKey, dir === 'e');
      if (door) {
        const key = `${kit}_arch_side`;
        if (this.has(key)) {
          const img = this.add(s.add.image(x + WALL.side / 2, door.y + door.h + 30, key).setOrigin(0.5, 1)
            .setDisplaySize(WALL.side + 70, door.h + 150).setDepth(ySortDepth(door.y + door.h)));
          if (dir === 'e') img.setFlipX(true);
        }
      }
    }

    // ---- 走廊兩側的牆 ----
    for (const c of l.corridors) {
      if (c.dir === 'n' || c.dir === 's') {
        this.sideWall(c.x - WALL.side, c.y, WALL.side, c.h, sideKey, false);
        this.sideWall(c.x + c.w, c.y, WALL.side, c.h, sideKey, true);
      } else {
        // 東西向走廊：上方是牆面、下方是矮牆
        const yTop = c.y - WALL.back * 0.7;
        if (this.has(wallBack)) {
          const tex = s.textures.get(wallBack).getSourceImage() as HTMLImageElement;
          const h = WALL.back * 0.7;
          const sc = h / tex.height;
          this.add(s.add.tileSprite(c.x, yTop, c.w, h, wallBack).setOrigin(0, 0).setTileScale(sc, sc).setDepth(DEPTH.floor - 1));
        }
        this.hedge(c.x, c.y + c.h, c.w, kit);
      }
    }

    // ---- 下緣矮樹籬（南），南門留缺口 ----
    const south = l.corridors.find((c) => c.dir === 's');
    const by = i.y + i.h;
    if (south) {
      this.hedge(left, by, south.x - left, kit);
      this.hedge(south.x + south.w, by, right - south.x - south.w, kit);
    } else this.hedge(left, by, right - left, kit);

    // ---- 牆塊（L 形、十字形、石柱大廳） ----
    const blockKey = `${kit}_wall_block`;
    for (const b of l.walls) {
      const lift = 70;
      if (this.has(blockKey)) {
        this.add(s.add.nineslice(b.x + b.w / 2, b.y + b.h, blockKey, undefined, b.w + 16, b.h + lift, 40, 40, 50, 60)
          .setOrigin(0.5, 1).setDepth(ySortDepth(b.y + b.h)));
      } else {
        this.add(s.add.rectangle(b.x, b.y - lift, b.w, b.h + lift, 0x4a4250).setOrigin(0, 0).setDepth(ySortDepth(b.y + b.h)));
      }
    }

    // ---- 擺設 ----
    for (const p of l.props) {
      const key = `${kit}_${p.kind}`;
      const b = p.box;
      const flat = p.kind === 'pond';
      if (this.has(key)) {
        const img = s.add.image(b.x + b.w / 2, b.y + b.h + (flat ? 18 : 12), key).setOrigin(0.5, 1);
        const scale = (b.w * (flat ? 1.15 : 1.3)) / img.width;
        img.setScale(scale).setDepth(flat ? DEPTH.floor + 1 : ySortDepth(b.y + b.h));
        this.add(img);
      } else {
        this.add(s.add.rectangle(b.x, b.y - (flat ? 0 : 40), b.w, b.h + (flat ? 0 : 40), flat ? 0x2a5a8a : 0x6a4a30)
          .setOrigin(0, 0).setDepth(flat ? DEPTH.floor + 1 : ySortDepth(b.y + b.h)));
      }
    }

    // ---- 草叢：玩家走進去會被擋住一部分 ----
    const grassKey = this.has(`${kit}_grass`) ? `${kit}_grass` : 'ter_grass';
    for (const g of l.grass) {
      if (!this.has(grassKey)) continue;
      const img = s.add.image(g.x + g.w / 2, g.y + g.h + 14, grassKey).setOrigin(0.5, 1);
      img.setScale((g.w * 1.15) / img.width, ((g.h + 50) * 1.0) / img.height);
      img.setDepth(ySortDepth(g.y + g.h));
      this.add(img);
    }
    if (tint !== undefined) {
      this.objs.slice(floorCount).forEach((o) => {
        const t = o as unknown as { setTint?: (c: number) => void };
        if (t.setTint) t.setTint(tint);
      });
    }
  }

  /** 側牆（牆頂俯視）：可以垂直平鋪的牆頂貼圖 */
  private sideWall(x: number, y: number, w: number, h: number, key: string, flip: boolean): void {
    if (h <= 2) return;
    const s = this.scene;
    if (this.has(key)) {
      const tex = s.textures.get(key).getSourceImage() as HTMLImageElement;
      const sc = w / tex.width;
      const t = s.add.tileSprite(x, y, w, h, key).setOrigin(0, 0).setTileScale(sc, sc).setTilePosition(0, y / sc).setDepth(DEPTH.floor - 1);
      if (flip) t.setFlipX(true);
      this.add(t);
    } else {
      this.add(s.add.rectangle(x, y, w, h, 0x2e2834).setOrigin(0, 0).setDepth(DEPTH.floor - 1));
    }
  }

  /** 下緣矮樹籬：畫在角色前面（站在房間最下方時會擋到腳） */
  private hedge(x: number, y: number, w: number, kit: string): void {
    if (w <= 2) return;
    const s = this.scene;
    const key = `${kit}_hedge`;
    const h = WALL.bottom + 30;
    if (this.has(key)) {
      const tex = s.textures.get(key).getSourceImage() as HTMLImageElement;
      const sc = h / tex.height;
      this.add(s.add.tileSprite(x, y - 30, w, h, key).setOrigin(0, 0).setTileScale(sc, sc).setTilePosition(x / sc, 0)
        .setDepth(ySortDepth(y + 40)));
    } else {
      this.add(s.add.rectangle(x, y, w, WALL.bottom, 0x2a4a2a).setOrigin(0, 0).setDepth(ySortDepth(y + 40)));
    }
  }

  /** 走廊漸暗（越遠越黑） */
  private corridorFog(dir: Dir, c: Rect): void {
    const s = this.scene;
    const g = this.add(s.add.graphics().setDepth(DEPTH.floor - 1.5));
    const steps = 10;
    for (let k = 0; k < steps; k++) {
      const a = (k + 1) / steps;
      const alpha = Math.pow(a, 1.6) * 0.92;
      g.fillStyle(0x05030a, alpha / 2);
      const t = k / steps;
      if (dir === 'n') g.fillRect(c.x, c.y, c.w, c.h * (1 - t) * 0.7);
      if (dir === 's') g.fillRect(c.x, c.y + c.h * (0.3 + t * 0.7), c.w, c.h * (1 - t) * 0.7);
      if (dir === 'w') g.fillRect(c.x, c.y, c.w * (1 - t) * 0.7, c.h);
      if (dir === 'e') g.fillRect(c.x + c.w * (0.3 + t * 0.7), c.y, c.w * (1 - t) * 0.7, c.h);
    }
  }

  /** 戰鬥中封住走廊口：紅色符文柵欄 */
  setBarriers(l: RoomLayout | undefined, on: boolean): void {
    this.clearBarriers();
    if (!l || !on) return;
    const s = this.scene;
    const i = l.interior;
    for (const c of l.corridors) {
      const g = s.add.graphics().setDepth(ySortDepth(c.dir === 's' ? i.y + i.h : c.dir === 'n' ? i.y : c.y + c.h));
      g.fillStyle(0xff3b5a, 0.22);
      g.lineStyle(4, 0xff5a7a, 0.9);
      if (c.dir === 'n' || c.dir === 's') {
        const y = c.dir === 'n' ? i.y - 6 : i.y + i.h - 6;
        g.fillRect(c.x, y - 40, c.w, 52);
        for (let k = 0; k <= 6; k++) g.lineBetween(c.x + (k * c.w) / 6, y - 40, c.x + (k * c.w) / 6, y + 12);
      } else {
        const x = c.dir === 'w' ? i.x - 6 : i.x + i.w - 6;
        g.fillRect(x, c.y, 12, c.h);
        for (let k = 0; k <= 5; k++) g.lineBetween(x - 10, c.y + (k * c.h) / 5, x + 22, c.y + (k * c.h) / 5);
      }
      s.tweens.add({ targets: g, alpha: 0.55, duration: 500, yoyo: true, repeat: -1 });
      this.barriers.push(g);
    }
  }

  private clearBarriers(): void {
    this.barriers.forEach((b) => b.destroy());
    this.barriers = [];
  }
}
