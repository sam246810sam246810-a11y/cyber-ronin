import Phaser from 'phaser';
import { COLORS, DEPTH, FONT, GAME_W } from '../config';
import type { Player } from '../entities/Player';
import { formatTime } from '../utils';

/** 頂部 HUD：愛心、波數、時間、暫停、Boss 血條、橫幅、提示 */
export class HUD {
  private hearts: Phaser.GameObjects.Image[] = [];
  private waveText: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;
  private bossBar: Phaser.GameObjects.Graphics;
  private bossName: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Container;
  private toastText: Phaser.GameObjects.Text;
  private toastSub: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, maxHp: number, onPause: () => void) {
    scene.add.rectangle(GAME_W / 2, 44, GAME_W, 88, 0x000000, 0.35).setDepth(DEPTH.ui - 1);
    for (let i = 0; i < maxHp; i++) {
      this.hearts.push(scene.add.image(36 + i * 38, 32, 'heart').setDepth(DEPTH.ui).setDisplaySize(32, 30));
    }
    this.waveText = scene.add.text(GAME_W / 2, 30, '', {
      fontFamily: FONT, fontSize: '28px', color: COLORS.text, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH.ui);
    this.timeText = scene.add.text(GAME_W / 2, 64, '00:00', {
      fontFamily: FONT, fontSize: '20px', color: COLORS.textDim,
    }).setOrigin(0.5).setDepth(DEPTH.ui);

    const pause = scene.add.container(GAME_W - 44, 44, [
      scene.add.rectangle(0, 0, 64, 64, COLORS.panelLight, 0.9).setStrokeStyle(2, COLORS.accent, 0.6),
      scene.add.rectangle(-9, 0, 8, 26, 0xffffff),
      scene.add.rectangle(9, 0, 8, 26, 0xffffff),
    ]).setDepth(DEPTH.ui).setSize(64, 64).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', onPause);

    this.bossBar = scene.add.graphics().setDepth(DEPTH.ui);
    this.bossName = scene.add.text(GAME_W / 2, 104, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffd1ec', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.ui + 1);

    this.banner = scene.add.text(GAME_W / 2, 420, '', {
      fontFamily: FONT, fontSize: '52px', color: '#ffffff', fontStyle: 'bold', stroke: '#2a1a3a', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(DEPTH.overlay).setAlpha(0);

    const toastBg = scene.add.rectangle(0, 0, 440, 96, 0x2a1a3a, 0.95).setStrokeStyle(3, COLORS.gold, 1);
    this.toastText = scene.add.text(0, -16, '', {
      fontFamily: FONT, fontSize: '30px', color: '#ffd166', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.toastSub = scene.add.text(0, 22, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5);
    this.toast = scene.add.container(GAME_W / 2, 200, [toastBg, this.toastText, this.toastSub])
      .setDepth(DEPTH.overlay).setAlpha(0);
  }

  update(player: Player, label: string, time: number, boss?: { hp: number; maxHp: number; name: string; alive: boolean }): void {
    this.hearts.forEach((h, i) => h.setAlpha(i < player.hp ? 1 : 0.2));
    this.waveText.setText(label);
    this.timeText.setText(formatTime(time));

    this.bossBar.clear();
    if (boss && boss.alive) {
      const w = 560;
      const x = (GAME_W - w) / 2;
      this.bossBar.fillStyle(0x000000, 0.7).fillRect(x - 2, 94, w + 4, 22);
      this.bossBar.fillStyle(0xd03a8a, 1).fillRect(x, 96, w * (boss.hp / boss.maxHp), 18);
      this.bossName.setText(`${boss.name}  ${Math.ceil(boss.hp)}/${boss.maxHp}`);
    } else {
      this.bossName.setText('');
    }
  }

  showBanner(text: string): void {
    this.banner.setText(text).setAlpha(0).setScale(0.6);
    this.scene.tweens.killTweensOf(this.banner);
    this.scene.tweens.add({
      targets: this.banner, alpha: 1, scale: 1, duration: 250, ease: 'Back.Out',
      onComplete: () => this.scene.tweens.add({ targets: this.banner, alpha: 0, delay: 900, duration: 300 }),
    });
  }

  showToast(title: string, sub: string): void {
    this.toastText.setText(title);
    this.toastSub.setText(sub);
    this.scene.tweens.killTweensOf(this.toast);
    this.toast.setAlpha(0).setY(170);
    this.scene.tweens.add({
      targets: this.toast, alpha: 1, y: 200, duration: 250, ease: 'Back.Out',
      onComplete: () => this.scene.tweens.add({ targets: this.toast, alpha: 0, delay: 1600, duration: 300 }),
    });
  }
}
