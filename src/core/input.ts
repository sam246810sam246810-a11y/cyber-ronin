// 單指浮動搖桿 + 鍵盤（WASD / 方向鍵）
export class Input {
  active = false;
  ox = 0; oy = 0;   // 搖桿原點（螢幕像素）
  cx = 0; cy = 0;   // 目前手指位置
  pointerId = -1;
  keys = new Set<string>();
  maxR = 70;        // 搖桿半徑（螢幕像素，會依縮放重設）
  enabled = false;

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.pointerId !== -1) return;
      this.pointerId = e.pointerId;
      this.active = true;
      this.ox = this.cx = e.clientX;
      this.oy = this.cy = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.cx = e.clientX; this.cy = e.clientY;
      // 浮動搖桿：手指拉太遠時原點跟著走
      const dx = this.cx - this.ox, dy = this.cy - this.oy;
      const d = Math.hypot(dx, dy);
      if (d > this.maxR) {
        this.ox = this.cx - (dx / d) * this.maxR;
        this.oy = this.cy - (dy / d) * this.maxR;
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = -1;
      this.active = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.reset(); });
  }

  reset() { this.active = false; this.pointerId = -1; }

  /** 回傳 -1..1 的移動向量 */
  move(): { x: number; y: number } {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (x || y) { const d = Math.hypot(x, y); return { x: x / d, y: y / d }; }
    if (!this.active) return { x: 0, y: 0 };
    const dx = this.cx - this.ox, dy = this.cy - this.oy;
    const d = Math.hypot(dx, dy);
    const dead = this.maxR * 0.12;
    if (d < dead) return { x: 0, y: 0 };
    const m = Math.min(1, (d - dead) / (this.maxR * 0.6));
    return { x: (dx / d) * m, y: (dy / d) * m };
  }
}
