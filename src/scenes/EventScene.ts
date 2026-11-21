import Phaser from 'phaser';
import { COLORS, FONT, GAME_H, GAME_W } from '../config';
import { hexToInt } from '../data';
import { Sound } from '../systems/SoundSystem';
import { textButton } from '../ui/widgets';

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

    const n = d.options.length;
    const cw = n > 3 ? 270 : 330;
    const gap = 20;
    d.options.forEach((o, i) => {
      const x = GAME_W / 2 + (i - (n - 1) / 2) * (cw + gap);
      const y = 400;
      const c = hexToInt(d.color);
      const bg = this.add.rectangle(0, 0, cw, 260, COLORS.panel, 1).setStrokeStyle(4, c, o.enabled ? 1 : 0.25);
      const label = this.add.text(0, -70, o.label, {
        fontFamily: FONT, fontSize: '26px', color: '#ffffff', fontStyle: 'bold', align: 'center',
        wordWrap: { width: cw - 30, useAdvancedWrap: true },
      }).setOrigin(0.5);
      const desc = this.add.text(0, 30, o.desc, {
        fontFamily: FONT, fontSize: '19px', color: '#d8d0e6', align: 'center', wordWrap: { width: cw - 36, useAdvancedWrap: true },
      }).setOrigin(0.5);
      const card = this.add.container(x, y, [bg, label, desc]).setSize(cw, 260).setAlpha(o.enabled ? 1 : 0.4);
      if (o.enabled) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerup', () => {
          Sound.play('card');
          close(o.onPick);
        });
      }
    });
    textButton(this, GAME_W / 2, 630, 260, 70, '離開', () => close());
  }
}
