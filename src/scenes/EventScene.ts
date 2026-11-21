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
    this.add.text(GAME_W / 2, 200, d.title, {
      fontFamily: FONT, fontSize: '48px', color: d.color, fontStyle: 'bold', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(GAME_W / 2, 270, d.subtitle, {
      fontFamily: FONT, fontSize: '22px', color: COLORS.text, align: 'center', lineSpacing: 8,
      wordWrap: { width: 620, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    const step = d.options.length > 3 ? 148 : 170;
    const h = d.options.length > 3 ? 128 : 140;
    d.options.forEach((o, i) => {
      const y = (d.options.length > 3 ? 420 : 460) + i * step;
      const c = hexToInt(d.color);
      const bg = this.add.rectangle(0, 0, 600, h, COLORS.panel, 1).setStrokeStyle(4, c, o.enabled ? 1 : 0.25);
      const label = this.add.text(-270, -28, o.label, { fontFamily: FONT, fontSize: '32px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
      const desc = this.add.text(-270, 26, o.desc, {
        fontFamily: FONT, fontSize: '22px', color: '#d8d0e6', wordWrap: { width: 540, useAdvancedWrap: true },
      }).setOrigin(0, 0.5);
      const card = this.add.container(GAME_W / 2, y, [bg, label, desc]).setSize(600, h).setAlpha(o.enabled ? 1 : 0.4);
      if (o.enabled) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerup', () => {
          Sound.play('card');
          close(o.onPick);
        });
      }
    });
    textButton(this, GAME_W / 2, d.options.length > 3 ? 1050 : 1020, 300, 76, '離開', () => close());
  }
}
