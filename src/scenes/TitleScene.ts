import Phaser from 'phaser';
import classes from '../data/classes.json';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES } from '../config';
import { useLogicalCamera } from '../ui/camera';
import { getOverlay } from '../ui/dom/GameOverlay';
import { deserialize, latestSave, type SaveFile } from '../systems/save';
import { setGameState } from '../systems/gameState';

export class TitleScene extends Phaser.Scene {
  constructor() { super(SCENES.title); }

  create(): void {
    const cx = GAME_WIDTH / 2;
    useLogicalCamera(this).setBackgroundColor('#14121c');

    for (let i = 0; i < 14; i++) {
      const fire = this.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), Phaser.Math.Between(1, 3), 0x7fd8ff, 0.7);
      this.tweens.add({ targets: fire, y: fire.y - Phaser.Math.Between(20, 50), alpha: 0.1, duration: Phaser.Math.Between(1800, 3200), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    this.add.text(cx, 82, '狐火行', { fontFamily: FONT_FAMILY, fontSize: '48px', color: '#f2e6c9', fontStyle: 'bold' })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setShadow(0, 3, '#c23b2f', 0, false, true);
    this.add.text(cx, 122, 'KITSUNEBI', { fontFamily: FONT_FAMILY, fontSize: '10px', color: '#a39fb8', letterSpacing: 6 })
      .setOrigin(0.5).setResolution(RENDER_SCALE);
    this.add.text(GAME_WIDTH - 6, GAME_HEIGHT - 6, '第一章試玩版', { fontFamily: FONT_FAMILY, fontSize: '9px', color: '#6b6780' })
      .setOrigin(1, 1).setResolution(RENDER_SCALE);

    const latest = latestSave();
    if (!latest) {
      const hint = this.add.text(cx, 190, '點擊畫面開始', { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#f2e6c9' }).setOrigin(0.5).setResolution(RENDER_SCALE);
      this.tweens.add({ targets: hint, alpha: 0.25, duration: 800, yoyo: true, repeat: -1 });
      this.input.once('pointerdown', () => this.go(() => this.scene.start(SCENES.classSelect)));
      return;
    }

    const f = latest.file;
    this.button(cx, 162, `繼續遊戲　燈・${classes[f.state.classId].name} Lv.${f.state.level}・${f.areaName}`, true, () => this.loadSave(f));
    this.button(cx, 194, '新遊戲', false, () => this.go(() => this.scene.start(SCENES.classSelect)));
    this.button(cx, 226, '讀取存檔', false, () => getOverlay().openLoad((file) => this.loadSave(file), () => {}));
  }

  private button(x: number, y: number, label: string, primary: boolean, onTap: () => void): void {
    const t = this.add.text(x, y, label, { fontFamily: FONT_FAMILY, fontSize: primary ? '12px' : '11px', color: primary ? '#14121c' : '#f2e6c9', fontStyle: primary ? 'bold' : 'normal' })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(2);
    const bg = this.add.rectangle(x, y, Math.max(140, t.width + 32), 24, primary ? 0xe8823a : 0x2a2640).setStrokeStyle(1, 0xf2e6c9, primary ? 0 : 0.4)
      .setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => { if (!getOverlay().isOpen) onTap(); });
  }

  private loadSave(file: SaveFile): void {
    const r = deserialize(file);
    if (!r) return;
    setGameState(r.state);
    this.go(() => this.scene.start(SCENES.world, { map: r.map, spawn: r.spawn }));
  }

  private go(next: () => void): void {
    this.cameras.main.fadeOut(300, 20, 18, 28);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, next);
  }
}
