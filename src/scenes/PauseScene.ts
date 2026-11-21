import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W, MYTHIC, RIGHT, SAFE_X } from '../config';
import { ELEMENTS, hexToInt } from '../data';
import type { RunSummary } from './GameScene';
import { canFullscreen, textButton, toggleFullscreen } from '../ui/widgets';
import { Sound } from '../systems/SoundSystem';

/** 暫停：左欄數值、中欄藥水被動、右欄按鈕 */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(d: RunSummary): void {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.9).setInteractive();
    this.add.text(SAFE_X + 60, 30, '暫停', { fontFamily: FONT, fontSize: '40px', color: '#ffffff', fontStyle: 'bold' });
    this.add.text(SAFE_X + 190, 44, `${d.character}・${d.region}　已喝 ${d.drinks} 瓶`, { fontFamily: FONT, fontSize: '20px', color: COLORS.textDim });
    ELEMENTS.forEach((e, i) => {
      const x = SAFE_X + 80 + i * 110;
      this.add.image(x - 16, 110, `ing_${e.id}`).setDisplaySize(26, 26);
      this.add.text(x + 2, 110, String(Math.round(d.elements[e.id] * 10) / 10), {
        fontFamily: FONT, fontSize: '19px', color: e.color, fontStyle: 'bold',
      }).setOrigin(0, 0.5);
    });

    this.add.text(SAFE_X + 60, 150, '角色數值', { fontFamily: FONT, fontSize: '21px', color: '#7ed4ff', fontStyle: 'bold' });
    d.stats.forEach(([k, v], i) => {
      const y = 186 + i * 32;
      this.add.text(SAFE_X + 60, y, k, { fontFamily: FONT, fontSize: '18px', color: COLORS.textDim });
      this.add.text(SAFE_X + 330, y, v, { fontFamily: FONT, fontSize: '18px', color: '#ffffff' }).setOrigin(1, 0);
    });

    this.add.text(SAFE_X + 390, 150, '藥水被動', { fontFamily: FONT, fontSize: '21px', color: '#ffd166', fontStyle: 'bold' });
    if (!d.passives.length) this.add.text(SAFE_X + 390, 186, '（還沒喝過藥水）', { fontFamily: FONT, fontSize: '18px', color: COLORS.textDim });
    d.passives.slice(0, 12).forEach((p, i) => {
      const y = 186 + i * 32;
      this.add.circle(SAFE_X + 400, y + 11, 7, hexToInt(p.color));
      this.add.text(SAFE_X + 414, y, p.name, { fontFamily: FONT, fontSize: '18px', color: p.mythic ? MYTHIC.color : '#ffffff' });
      this.add.text(SAFE_X + 690, y, `Lv.${Math.round(p.stacks * 10) / 10}`, { fontFamily: FONT, fontSize: '18px', color: '#c9a3ff' }).setOrigin(1, 0);
    });

    this.add.text(SAFE_X + 60, 590, `武器：${d.weapons.map((w) => w.name).join(' ／ ')}　　技能：${d.skill}`, {
      fontFamily: FONT, fontSize: '18px', color: '#ffd166',
    });
    const muts = d.mutations.length ? d.mutations.map((m) => `${m.icon}${m.name} ${m.value}`).join('　') : '（還沒有）';
    this.add.text(SAFE_X + 60, 630, `突變卡：${muts}`, {
      fontFamily: FONT, fontSize: '17px', color: '#ffffff', wordWrap: { width: 740, useAdvancedWrap: true },
    });

    const bx = RIGHT - 260;
    textButton(this, bx, 200, 360, 90, '繼續', () => this.resumeGame(), 0x7a4fc0);
    textButton(this, bx, 305, 360, 76, '配方圖鑑', () => {
      this.scene.launch('Codex', { returnTo: 'Pause' });
      this.scene.pause();
    });
    const mute = textButton(this, bx, 400, 360, 70, Sound.muted ? '🔇 音效：關' : '🔊 音效：開', () => {
      const m = Sound.toggleMute();
      (mute.list[1] as Phaser.GameObjects.Text).setText(m ? '🔇 音效：關' : '🔊 音效：開');
    });
    textButton(this, bx, 500, 360, 76, '回主選單', () => {
      this.scene.stop('Game');
      this.scene.start('MainMenu');
    }, 0x5a2a3a);
    if (canFullscreen()) textButton(this, bx, 630, 360, 60, '⛶ 全螢幕', () => void toggleFullscreen());
    this.input.keyboard?.on('keydown-ESC', () => this.resumeGame());
  }

  private resumeGame(): void {
    this.scene.stop();
    this.scene.resume('Game');
  }
}
