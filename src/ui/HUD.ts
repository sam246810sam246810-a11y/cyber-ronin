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
  private coinText: Phaser.GameObjects.Text;
  private bossName: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Container;
  private toastText: Phaser.GameObjects.Text;
  private toastSub: Phaser.GameObjects.Text;
  private toastBg: Phaser.GameObjects.Rectangle;

  constructor(private scene: Phaser.Scene, maxHp: number, onPause: () => void) {
    scene.add.rectangle(GAME_W / 2, 44, GAME_W, 88, 0x000000, 0.35).setDepth(DEPTH.ui - 1);
    this.ensureHearts(maxHp);
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

    scene.add.image(530, 30, 'coin').setDisplaySize(24, 24).setDepth(DEPTH.ui);
    this.coinText = scene.add.text(548, 30, '0', {
      fontFamily: FONT, fontSize: '24px', color: '#ffd166', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(DEPTH.ui);
    this.bossBar = scene.add.graphics().setDepth(DEPTH.ui);
    this.bossName = scene.add.text(GAME_W / 2, 104, '', {
      fontFamily: FONT, fontSize: '18px', color: '#ffd1ec', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.ui + 1);

    this.banner = scene.add.text(GAME_W / 2, 420, '', {
      fontFamily: FONT, fontSize: '52px', color: '#ffffff', fontStyle: 'bold', stroke: '#2a1a3a', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(DEPTH.overlay).setAlpha(0);

    const toastBg = this.toastBg = scene.add.rectangle(0, 0, 660, 124, 0x2a1a3a, 0.95).setStrokeStyle(3, COLORS.gold, 1);
    this.toastText = scene.add.text(0, -34, '', {
      fontFamily: FONT, fontSize: '30px', color: '#ffd166', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.toastSub = scene.add.text(0, 16, '', {
      fontFamily: FONT, fontSize: '17px', color: '#ffffff', align: 'center',
      wordWrap: { width: 620, useAdvancedWrap: true }, lineSpacing: 2,
    }).setOrigin(0.5);
    this.toast = scene.add.container(GAME_W / 2, 200, [toastBg, this.toastText, this.toastSub])
      .setDepth(DEPTH.overlay).setAlpha(0);
  }

  /** 最大血量會成長，最多 14 顆，每排 7 顆 */
  private ensureHearts(n: number): void {
    while (this.hearts.length < n) {
      const i = this.hearts.length;
      this.hearts.push(this.scene.add.image(26 + (i % 7) * 29, 26 + Math.floor(i / 7) * 32, 'heart')
        .setDepth(DEPTH.ui).setDisplaySize(25, 23));
    }
  }

  update(player: Player, label: string, time: number, boss?: { hp: number; maxHp: number; name: string; alive: boolean }): void {
    this.ensureHearts(player.maxHp);
    this.hearts.forEach((h, i) => h.setVisible(i < player.maxHp).setAlpha(i < player.hp ? 1 : 0.2));
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

  setCoins(n: number): void {
    this.coinText.setText(String(n));
  }

  showBanner(text: string): void {
    this.banner.setText(text).setAlpha(0).setScale(0.6);
    this.scene.tweens.killTweensOf(this.banner);
    this.scene.tweens.add({
      targets: this.banner, alpha: 1, scale: 1, duration: 250, ease: 'Back.Out',
      onComplete: () => this.scene.tweens.add({ targets: this.banner, alpha: 0, delay: 900, duration: 300 }),
    });
  }

  /** color：稀有度顏色（有傳入時加粗外框並延長顯示） */
  showToast(title: string, sub: string, color?: string): void {
    const legendary = !!color;
    const c = color ? parseInt(color.replace('#', ''), 16) : COLORS.gold;
    this.toastBg.setStrokeStyle(legendary ? 5 : 3, c, 1);
    this.toastBg.setFillStyle(0x1e1428, 0.96);
    this.toastText.setColor(color ?? '#ffd166');
    this.toastText.setText(title);
    this.toastSub.setText(sub);
    this.scene.tweens.killTweensOf(this.toast);
    this.toast.setAlpha(0).setY(170);
    this.scene.tweens.add({
      targets: this.toast, alpha: 1, y: 200, duration: 250, ease: 'Back.Out',
      onComplete: () => this.scene.tweens.add({ targets: this.toast, alpha: 0, delay: legendary ? 2400 : 1400, duration: 300 }),
    });
  }
}
