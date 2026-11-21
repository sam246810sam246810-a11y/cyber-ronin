import Phaser from 'phaser';
import { isArtTexture } from '../utils';
import { ARENA, COLORS, DEPTH, FONT, GAME_W, RARITY, RIGHT, SAFE_X } from '../config';

const RARITY_COLORS = RARITY.map((r) => r.color);
import type { Player } from '../entities/Player';
import { formatTime } from '../utils';

/** 頂部 HUD：愛心、波數、時間、暫停、Boss 血條、橫幅、提示 */
export class HUD {
  private hearts: Phaser.GameObjects.Image[] = [];
  private waveText: Phaser.GameObjects.Text;
  private timeText: Phaser.GameObjects.Text;
  private bossBar: Phaser.GameObjects.Graphics;
  private coinText: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private sandText!: Phaser.GameObjects.Text;
  private hpPill!: Phaser.GameObjects.Graphics;
  private hpPanel?: Phaser.GameObjects.NineSlice;
  private dangerText: Phaser.GameObjects.Text;
  private bossName: Phaser.GameObjects.Text;
  private banner: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Container;
  private toastText: Phaser.GameObjects.Text;
  private toastSub: Phaser.GameObjects.Text;
  private toastBg: Phaser.GameObjects.Rectangle;

  constructor(private scene: Phaser.Scene, maxHp: number, onPause: () => void) {
    // 左上：血量＋金幣（半透明膠囊底，疊在地圖上）
    this.hpPill = scene.add.graphics().setDepth(DEPTH.ui - 1);
    if (isArtTexture(scene, 'ui_panel')) {
      // 黃銅木頭面板（九宮格拉伸，角落花紋不變形）
      this.hpPanel = scene.add.nineslice(0, 0, 'ui_panel', undefined, 200, 90, 46, 46, 40, 40)
        .setOrigin(0, 0).setDepth(DEPTH.ui - 1).setAlpha(0.92);
    }
    // 右上：暫停
    const pause = scene.add.container(RIGHT - 44, 44, isArtTexture(scene, 'ui_pause')
      ? [scene.add.image(0, 0, 'ui_pause').setDisplaySize(62, 62)]
      : [
        scene.add.circle(0, 0, 28, 0x120d18, 0.6).setStrokeStyle(2, COLORS.accent, 0.6),
        scene.add.rectangle(-7, 0, 6, 22, 0xffffff),
        scene.add.rectangle(7, 0, 6, 22, 0xffffff),
      ]).setDepth(DEPTH.ui).setSize(60, 60).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', onPause);

    this.coinIcon = scene.add.image(0, 0, 'coin').setDisplaySize(22, 22).setDepth(DEPTH.ui);
    this.coinText = scene.add.text(0, 0, '0', {
      fontFamily: FONT, fontSize: '21px', color: '#ffd166', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(DEPTH.ui);
    this.sandText = scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '18px', color: '#9fe3ff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(DEPTH.ui);
    this.ensureHearts(maxHp);
    // 小地圖下方的小字：樓層＋危險度
    this.waveText = scene.add.text(RIGHT - 12, 0, '', {
      fontFamily: FONT, fontSize: '15px', color: '#e8e0f0', stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(DEPTH.ui);
    this.timeText = scene.add.text(0, 0, '').setVisible(false);
    this.dangerText = scene.add.text(RIGHT - 12, 0, '', {
      fontFamily: FONT, fontSize: '14px', color: '#c9c9c9', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(DEPTH.ui);
    this.bossBar = scene.add.graphics().setDepth(DEPTH.ui);
    this.bossName = scene.add.text(GAME_W / 2, 30, '', {
      fontFamily: FONT, fontSize: '16px', color: '#ffd1ec', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.ui + 1);

    this.banner = scene.add.text(GAME_W / 2, ARENA.y + ARENA.h * 0.38, '', {
      fontFamily: FONT, fontSize: '50px', color: '#ffffff', fontStyle: 'bold', stroke: '#2a1a3a', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(DEPTH.overlay).setAlpha(0);

    const toastBg = this.toastBg = scene.add.rectangle(0, 0, 720, 96, 0x2a1a3a, 0.95).setStrokeStyle(3, COLORS.gold, 1);
    this.toastText = scene.add.text(0, -24, '', {
      fontFamily: FONT, fontSize: '26px', color: '#ffd166', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.toastSub = scene.add.text(0, 18, '', {
      fontFamily: FONT, fontSize: '16px', color: '#ffffff', align: 'center',
      wordWrap: { width: 680, useAdvancedWrap: true }, lineSpacing: 2,
    }).setOrigin(0.5);
    this.toast = scene.add.container(GAME_W / 2, 120, [toastBg, this.toastText, this.toastSub])
      .setDepth(DEPTH.overlay).setAlpha(0);
  }

  /** 小地圖底部的 y，樓層字跟在下面 */
  setInfoY(y: number): void {
    this.waveText.setY(y + 4);
    this.dangerText.setY(y + 24);
  }

  private relicIcons: Phaser.GameObjects.GameObject[] = [];
  private lastMaxHp = 5;

  /** 左上膠囊內的聖物圖示列 */
  setRelics(relics: { icon: string; rarity: number }[]): void {
    this.relicIcons.forEach((o) => o.destroy());
    this.relicIcons = [];
    this.relicCount = relics.length;
    this.layoutTopLeft(this.lastMaxHp);
    const rows = Math.ceil(this.lastMaxHp / 7);
    const y = 28 + rows * 32 + 26;
    relics.forEach((r, i) => {
      const x = SAFE_X + 30 + i * 30;
      const c = parseInt(RARITY_COLORS[r.rarity].replace('#', ''), 16);
      this.relicIcons.push(
        this.scene.add.circle(x, y, 13, c, 0.35).setStrokeStyle(2, c, 1).setDepth(DEPTH.ui),
        this.scene.add.text(x, y, r.icon, { fontSize: '15px' }).setOrigin(0.5).setDepth(DEPTH.ui + 1),
      );
    });
  }

  private relicCount = 0;

  /** 大廳：只顯示時之砂總數 */
  setLobbySand(n: number): void {
    this.coinIcon.setVisible(false);
    this.coinText.setText(`⌛ 時之砂 ${n}`).setColor('#9fe3ff');
    this.waveText.setText('');
    this.dangerText.setText('');
  }

  /** 時之砂（本局） */
  setSand(n: number): void {
    this.sandText.setText(n ? `⌛${n}` : '');
  }

  private layoutTopLeft(maxHp: number): void {
    this.lastMaxHp = maxHp;
    const perRow = 7;
    const rows = Math.ceil(maxHp / perRow);
    const w = Math.min(maxHp, perRow) * 29 + 16;
    const x0 = SAFE_X + 18;
    const coinY = 28 + rows * 32;
    const relicRow = this.relicCount ? 30 : 0;
    this.hpPill.clear();
    const pw = Math.max(w, 30 * this.relicCount + 16, 150);
    const ph = coinY + 14 + relicRow;
    if (this.hpPanel) this.hpPanel.setPosition(x0 - 16, 2).setSize(pw + 30, ph + 14);
    else this.hpPill.fillStyle(0x120d18, 0.5).fillRoundedRect(x0 - 8, 8, pw, ph, 14);
    this.coinIcon.setPosition(x0 + 12, coinY - 6);
    this.coinText.setPosition(x0 + 28, coinY - 6);
    this.sandText?.setPosition(x0 + 86, coinY - 6);
  }

  /** 最大血量會成長，最多 14 顆，每排 7 顆 */
  private ensureHearts(n: number): void {
    if (this.hearts.length >= n) return;
    while (this.hearts.length < n) {
      const i = this.hearts.length;
      this.hearts.push(this.scene.add.image(SAFE_X + 30 + (i % 7) * 29, 30 + Math.floor(i / 7) * 32, 'heart')
        .setDepth(DEPTH.ui).setDisplaySize(25, 23));
    }
    this.layoutTopLeft(n);
  }

  update(player: Player, label: string, time: number, boss?: { hp: number; maxHp: number; name: string; alive: boolean }): void {
    this.ensureHearts(player.maxHp);
    this.hearts.forEach((h, i) => h.setVisible(i < player.maxHp).setAlpha(i < player.hp ? 1 : 0.2));
    this.waveText.setText(label);
    this.timeText.setText(formatTime(time));

    this.bossBar.clear();
    if (boss && boss.alive) {
      const w = 640;
      const x = (GAME_W - w) / 2;
      const y = 44;
      this.bossBar.fillStyle(0x000000, 0.7).fillRect(x - 2, y, w + 4, 22);
      this.bossBar.fillStyle(0xd03a8a, 1).fillRect(x, y + 2, w * (boss.hp / boss.maxHp), 18);
      this.bossName.setText(`${boss.name}  ${Math.ceil(boss.hp)}/${boss.maxHp}`);
    } else {
      this.bossName.setText('');
    }
  }

  private dangerShown = '';

  /** 危險度：敵人血量倍率與每擊傷害 */
  setDanger(hpMul: number, dmg: number): void {
    const t = `☠ ×${hpMul < 10 ? hpMul.toFixed(1) : Math.round(hpMul)}${dmg > 1 ? `　💔${dmg}` : ''}`;
    if (t === this.dangerShown) return;
    this.dangerShown = t;
    this.dangerText.setText(t).setColor(hpMul >= 6 ? '#ff5a6a' : hpMul >= 3 ? '#ffb86b' : '#c9c9c9');
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
    this.toast.setAlpha(0).setY(100);
    this.scene.tweens.add({
      targets: this.toast, alpha: 1, y: 124, duration: 250, ease: 'Back.Out',
      onComplete: () => this.scene.tweens.add({ targets: this.toast, alpha: 0, delay: legendary ? 2400 : 1400, duration: 300 }),
    });
  }
}
