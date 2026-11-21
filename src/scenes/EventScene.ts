import Phaser from 'phaser';
import { isArtTexture } from '../utils';
import { COLORS, FONT, GAME_H, GAME_W } from '../config';
import { hexToInt } from '../data';
import { Sound } from '../systems/SoundSystem';
import { ConfirmPicker, guardInput, textButton } from '../ui/widgets';

export interface EventOption {
  label: string;
  desc: string;
  enabled: boolean;
  onPick: () => void;
}

export interface EventData {
  title: string;
  subtitle: string;
  color: string;
  options: EventOption[];
  onClose: () => void;
}

/** 祈願泉 / 流浪商人的選擇畫面 */
export class EventScene extends Phaser.Scene {
  constructor() {
    super('Event');
  }

  create(d: EventData): void {
    let done = false;
    const close = (fn?: () => void) => {
      if (done) return;
      done = true;
      this.scene.stop();
      d.onClose();
      fn?.();
    };
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05030a, 0.82).setInteractive();
    this.add.text(GAME_W / 2, 90, d.title, {
      fontFamily: FONT, fontSize: '48px', color: d.color, fontStyle: 'bold', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 145, d.subtitle, {
      fontFamily: FONT, fontSize: '22px', color: COLORS.text, align: 'center', lineSpacing: 8,
      wordWrap: { width: 1000, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    guardInput(this);
    const n = d.options.length;
    const cards: { card: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Rectangle }[] = [];
    const baseColor = hexToInt(d.color);
    const hint = this.add.text(GAME_W / 2, 560, '點選項查看，再點一次確認', {
      fontFamily: FONT, fontSize: '19px', color: '#c9c9c9',
    }).setOrigin(0.5);
    const picker = new ConfirmPicker((i, prev) => {
      if (prev >= 0) {
        cards[prev].bg.setStrokeStyle(4, baseColor, 1);
        this.tweens.add({ targets: cards[prev].card, scale: 1, duration: 120 });
      }
      cards[i].bg.setStrokeStyle(7, 0xffffff, 1);
      this.tweens.add({ targets: cards[i].card, scale: 1.06, duration: 140, ease: 'Back.Out' });
      hint.setText(`再點一次「${d.options[i].label}」確認`).setColor('#ffd166');
      Sound.play('card');
    });
    const gap = n > 4 ? 12 : 20;
    const cw = Math.min(n > 3 ? 270 : 330, (GAME_W - 40) / n - gap);
    d.options.forEach((o, i) => {
      const x = GAME_W / 2 + (i - (n - 1) / 2) * (cw + gap);
      const y = 400;
      const c = hexToInt(d.color);
      const art = isArtTexture(this, 'ui_dialog');
      const frame = art ? this.add.nineslice(0, -28, 'ui_dialog', undefined, cw + 24, 360, 60, 60, 90, 40) : this.add.rectangle(0, 0, 1, 1, 0, 0);
      const bg = this.add.rectangle(0, 8, art ? cw - 40 : cw, art ? 230 : 260, COLORS.panel, art ? 0 : 1)
        .setStrokeStyle(art ? 3 : 4, c, o.enabled ? (art ? 0.8 : 1) : 0.25);
      const label = this.add.text(0, -70, o.label, {
        fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold', align: 'center',
        wordWrap: { width: cw - 30, useAdvancedWrap: true },
      }).setOrigin(0.5);
      const desc = this.add.text(0, 30, o.desc, {
        fontFamily: FONT, fontSize: '19px', color: '#d8d0e6', align: 'center', wordWrap: { width: cw - 36, useAdvancedWrap: true },
      }).setOrigin(0.5);
      const card = this.add.container(x, y, [frame, bg, label, desc]).setSize(cw, 260).setAlpha(o.enabled ? 1 : 0.4);
      cards.push({ card, bg });
      if (o.enabled) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerup', () => picker.tap(i, () => {
          Sound.play('card');
          close(o.onPick);
        }, this));
      }
    });
    textButton(this, GAME_W / 2, 630, 260, 70, '離開', () => close());
  }
}
