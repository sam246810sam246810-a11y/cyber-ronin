import Phaser from 'phaser';
import { CHARACTERS, CHAR_ORDER, CharId, WEAPONS } from '../config/balance';
import { WANTED_RULES, wantedMods } from '../config/expansion';
import { T } from '../i18n/zh-TW';
import { COLORS, H, W, textStyle } from '../game/layout';
import { header, makeButton, menuBackground, setupLogicalCamera } from '../game/ui';
import { loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';

export class CharSelectScene extends Phaser.Scene {
  private selected: CharId = 'jin';
  private wanted = 0;

  constructor() {
    super('CharSelect');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playMusic('bgm-menu');
    const save = loadSave();
    this.selected = save.chars.includes(save.lastChar) ? save.lastChar : 'jin';
    this.wanted = Math.min(this.wanted, save.wantedUnlocked ?? 0);
    this.draw();
  }

  private draw() {
    this.children.removeAll(true);
    menuBackground(this);
    const save = loadSave();
    header(this, T.selectChar, save.credits, () => this.scene.start('Menu'));

    const cardH = Math.min(190, (H - 330) / 3 - 12);
    CHAR_ORDER.forEach((id, i) => {
      const c = CHARACTERS[id];
      const owned = save.chars.includes(id);
      const sel = owned && id === this.selected;
      const y = 96 + i * (cardH + 12) + cardH / 2;
      const card = this.add.container(W / 2, y);
      const bg = this.add.rectangle(0, 0, 500, cardH, sel ? 0x17223a : COLORS.panel, 0.95).setStrokeStyle(sel ? 3 : 1, sel ? COLORS.cyan : 0x2e2650);
      const pk = this.textures.exists(`portrait-${id}`) ? `portrait-${id}` : `char-${id}`;
      const img = this.add.image(-250 + cardH / 2 + 4, 0, pk).setDisplaySize(cardH - 16, cardH - 16);
      if (!owned) img.setTint(0x222233);
      const x0 = -250 + cardH + 14;
      const name = this.add.text(x0, -cardH / 2 + 16, c.name, textStyle(24, owned ? '#ffffff' : '#8a86a8')).setOrigin(0, 0);
      const role = this.add.text(250 - 14, -cardH / 2 + 20, c.role, textStyle(14, '#8fe9ff', false)).setOrigin(1, 0);
      const w = WEAPONS[c.weapon];
      const wIcon = this.add.image(x0 + 14, -cardH / 2 + 66, `icon-${c.weapon}`).setDisplaySize(28, 28);
      const wName = this.add.text(x0 + 34, -cardH / 2 + 66, `${T.startWeapon}：${w.name}`, textStyle(15, '#c9c6e0', false)).setOrigin(0, 0.5);
      const trait = this.add
        .text(x0, -cardH / 2 + 88, `${T.trait}：${c.trait}`, { ...textStyle(15, '#ffc83d', false), wordWrap: { width: 500 - cardH - 30, useAdvancedWrap: true } })
        .setOrigin(0, 0);
      card.add([bg, img, name, role, wIcon, wName, trait]);
      if (!owned) {
        const can = save.credits >= c.cost;
        const btn = makeButton(this, 250 - 92, cardH / 2 - 30, 160, 42, T.unlockFor(c.cost), COLORS.gold, () => {
          const s = loadSave();
          if (s.credits < c.cost) return;
          s.credits -= c.cost;
          s.chars.push(id);
          s.lastChar = id;
          writeSave(s);
          this.selected = id;
          Audio.play('sfx-chest', 0.5);
          this.draw();
        }, 14).setEnabled(can);
        card.add(btn);
      } else {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerup', () => {
          this.selected = id;
          Audio.play('sfx-click', 0.35);
          this.draw();
        });
      }
    });

    // 通緝等級（通關後解鎖）
    const maxW = save.wantedUnlocked ?? 0;
    const wy = H - 172;
    this.add.rectangle(W / 2, wy, 500, 84, 0x1a0b10, 0.95).setStrokeStyle(1, 0xff6a3d, 0.7);
    if (maxW === 0) {
      this.add.text(W / 2, wy, '通緝等級：通關一次後解鎖', textStyle(17, '#8a86a8', false)).setOrigin(0.5);
    } else {
      const mods = wantedMods(this.wanted);
      this.add.text(W / 2, wy - 22, this.wanted === 0 ? '通緝等級 0（標準）' : `通緝等級 ${this.wanted}　獎勵 ×${mods.reward.toFixed(1)}`, textStyle(19, '#ff8a5d')).setOrigin(0.5);
      const rules = this.wanted === 0 ? '沒有額外規則' : WANTED_RULES.slice(0, this.wanted).slice(-2).join('、') + (this.wanted > 2 ? ' 等' : '');
      this.add.text(W / 2, wy + 12, rules, { ...textStyle(14, '#c9a9a0', false), align: 'center', wordWrap: { width: 330 } }).setOrigin(0.5, 0);
      makeButton(this, W / 2 - 212, wy, 60, 60, '-', 0xff6a3d, () => {
        this.wanted = Math.max(0, this.wanted - 1);
        this.draw();
      }, 26).setEnabled(this.wanted > 0);
      makeButton(this, W / 2 + 212, wy, 60, 60, '+', 0xff6a3d, () => {
        this.wanted = Math.min(maxW, this.wanted + 1);
        this.draw();
      }, 26).setEnabled(this.wanted < maxW);
    }

    const c = CHARACTERS[this.selected];
    makeButton(this, W / 2, H - 70, 360, 76, T.startWith(c.name), COLORS.cyan, () => {
      const s = loadSave();
      s.lastChar = this.selected;
      writeSave(s);
      Audio.stopMusic();
      this.scene.start('Game', { char: this.selected, wanted: this.wanted });
    }, 26);
  }
}
