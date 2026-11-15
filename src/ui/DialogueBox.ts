import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../config';
import type { DialogueRequest } from '../systems/events';

const CPS = 40; // 每秒顯示的字數

/** 畫面下方的對話框：逐字顯示，點一下顯示全部／下一句。 */
export class DialogueBox {
  private readonly root: Phaser.GameObjects.Container;
  private readonly name: Phaser.GameObjects.Text;
  private readonly nameBg: Phaser.GameObjects.Rectangle;
  private readonly body: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private req?: DialogueRequest;
  private index = 0;
  private shown = 0;
  private full = '';
  private openedAt = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const x = 12, w = GAME_WIDTH - 24, h = 74, y = GAME_HEIGHT - h - 10;
    const bg = scene.add.rectangle(x, y, w, h, 0x14121c, 0.92).setOrigin(0).setStrokeStyle(1, 0xf2e6c9, 0.8);
    this.nameBg = scene.add.rectangle(x + 10, y - 9, 10, 18, 0xc23b2f).setOrigin(0);
    this.name = scene.add.text(x + 18, y - 8, '', { fontFamily: FONT_FAMILY, fontSize: '11px', color: '#f8f0e0', fontStyle: 'bold' }).setResolution(RENDER_SCALE);
    this.body = scene.add.text(x + 14, y + 16, '', {
      fontFamily: FONT_FAMILY, fontSize: '13px', color: '#f2e6c9', lineSpacing: 4,
      wordWrap: { width: w - 28, useAdvancedWrap: true },
    }).setResolution(RENDER_SCALE);
    this.next = scene.add.text(x + w - 14, y + h - 8, '▼', { fontFamily: FONT_FAMILY, fontSize: '9px', color: '#e8823a' }).setOrigin(1).setResolution(RENDER_SCALE);
    scene.tweens.add({ targets: this.next, y: this.next.y + 2, duration: 400, yoyo: true, repeat: -1 });
    this.root = scene.add.container(0, 0, [bg, this.nameBg, this.name, this.body, this.next]).setDepth(1000).setVisible(false);

    scene.input.on('pointerdown', () => this.tap());
  }

  get isOpen(): boolean { return !!this.req; }

  open(req: DialogueRequest): void {
    this.req = req;
    this.index = 0;
    this.openedAt = this.scene.time.now;
    this.root.setVisible(true);
    this.showLine();
  }

  /** 直接關閉（換地圖時），不觸發 onDone。 */
  close(): void {
    this.req = undefined;
    this.root.setVisible(false);
  }

  private showLine(): void {
    const [speaker, text] = this.req!.lines[this.index];
    this.name.setText(speaker);
    this.nameBg.setSize(this.name.width + 16, 18);
    this.full = text;
    this.shown = 0;
    this.body.setText('');
    this.next.setVisible(false);
  }

  private tap(): void {
    if (!this.req || this.scene.time.now - this.openedAt < 200) return;
    if (this.shown < this.full.length) { this.shown = this.full.length; return; }
    this.index++;
    if (this.index < this.req.lines.length) { this.showLine(); return; }
    const done = this.req.onDone;
    this.req = undefined;
    this.root.setVisible(false);
    done();
  }

  update(dt: number): void {
    if (!this.req) return;
    if (this.shown < this.full.length) this.shown = Math.min(this.full.length, this.shown + (dt / 1000) * CPS);
    const n = Math.floor(this.shown);
    if (this.body.text.length !== n) this.body.setText(this.full.slice(0, n));
    this.next.setVisible(n >= this.full.length);
  }
}
