export interface Rect { x: number; y: number; w: number; h: number }

/** 物件池：避免每幀大量建立物件造成 GC 卡頓 */
export class Pool<T> {
  active: T[] = [];
  private free: T[] = [];
  constructor(private make: () => T) {}
  obtain(): T {
    const o = this.free.pop() ?? this.make();
    this.active.push(o);
    return o;
  }
  /** 以 swap-pop 移除；請由後往前迭代 */
  release(i: number) {
    const o = this.active[i];
    const last = this.active.pop()!;
    if (i < this.active.length) this.active[i] = last;
    this.free.push(o);
  }
  clear() {
    for (const o of this.active) this.free.push(o);
    this.active.length = 0;
  }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const dist2 = (x1: number, y1: number, x2: number, y2: number) => (x1 - x2) ** 2 + (y1 - y2) ** 2;

export function fmtNum(n: number): string {
  n = Math.round(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
