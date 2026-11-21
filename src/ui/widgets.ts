import Phaser from 'phaser';
import { COLORS, FONT } from '../config';

/** 共用的長方形文字按鈕 */
export function textButton(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void,
  color: number = COLORS.panelLight,
): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, w, h, color, 1).setStrokeStyle(3, COLORS.accent, 0.8);
  const text = scene.add.text(0, 0, label, {
    fontFamily: FONT, fontSize: `${Math.round(h * 0.38)}px`, color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, text]).setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => scene.tweens.add({ targets: c, scale: 0.95, duration: 60, yoyo: true }));
  c.on('pointerup', onClick);
  return c;
}

/** 全螢幕切換（不支援的環境回傳 false，例如 iPhone 或部分 App 內瀏覽器） */
export function canFullscreen(): boolean {
  return !!document.fullscreenEnabled;
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o.lock?.('landscape').catch(() => undefined);
    }
  } catch {
    /* 不支援就算了 */
  }
}

/**
 * 兩段式確認：第一次點只選中（呼叫 onSelect 顯示「再點一次確認」），
 * 同一個選項再點一次才執行。避免沒看清楚就選了。
 */
export class ConfirmPicker {
  private selected = -1;

  constructor(private onSelect: (index: number, prev: number) => void) {}

  tap(index: number, confirm: () => void, scene?: Phaser.Scene): void {
    if (scene && guarded(scene)) return;
    if (this.selected === index) {
      confirm();
      return;
    }
    const prev = this.selected;
    this.selected = index;
    this.onSelect(index, prev);
  }

  get current(): number {
    return this.selected;
  }
}

/** 選單剛打開的一小段時間不接受點擊（避免沿用打開選單的那一下） */
export function guardInput(scene: Phaser.Scene, ms = 350): void {
  const until = performance.now() + ms;
  // 在輸入外掛最前面攔截：保護期內的點擊直接丟掉
  const block = (pointer: Phaser.Input.Pointer) => {
    if (performance.now() < until) pointer.event?.stopImmediatePropagation?.();
  };
  scene.input.on('pointerdown', block);
  (scene as unknown as { __guardUntil: number }).__guardUntil = until;
}

/** 檢查目前是否仍在輸入保護期（給互動處理器用） */
export function guarded(scene: Phaser.Scene): boolean {
  return performance.now() < ((scene as unknown as { __guardUntil?: number }).__guardUntil ?? 0);
}
