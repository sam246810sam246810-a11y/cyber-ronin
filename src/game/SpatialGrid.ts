export interface Positioned {
  x: number;
  y: number;
}

/** 均勻格網，用來加速大量敵人的碰撞查詢 */
export class SpatialGrid<T extends Positioned> {
  private map = new Map<number, T[]>();
  private pool: T[][] = [];

  constructor(private cell: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 100000) * 200000 + (cy + 100000);
  }

  clear(): void {
    for (const arr of this.map.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.map.clear();
  }

  insert(item: T): void {
    const k = this.key(Math.floor(item.x / this.cell), Math.floor(item.y / this.cell));
    let arr = this.map.get(k);
    if (!arr) {
      arr = this.pool.pop() ?? [];
      this.map.set(k, arr);
    }
    arr.push(item);
  }

  /** 把範圍內「可能」碰到的物件放進 out（呼叫端自行精確判斷距離） */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell);
    const x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell);
    const y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.map.get(this.key(cx, cy));
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    }
    return out;
  }
}
