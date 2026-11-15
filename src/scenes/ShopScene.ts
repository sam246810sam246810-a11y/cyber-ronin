import Phaser from 'phaser';
import { UPGRADES, upgradeCost } from '../config/balance';
import { T } from '../i18n/zh-TW';
import { COLORS, W, textStyle } from '../game/layout';
import { fancyTitle, makeButton, setupLogicalCamera } from '../game/ui';
import { CONTENT_BOTTOM, CONTENT_TOP, enter, lobbyBackground, tabBar, topBar } from '../game/chrome';

import { loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';

export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playMusic('bgm-menu');
    this.draw();
    enter(this);
  }

  private draw() {
    this.children.removeAll(true);
    this.tweens.killAll();
    lobbyBackground(this, 0.72);
    const save = loadSave();
    topBar(this, save);
    fancyTitle(this, W / 2, CONTENT_TOP + 22, T.shopTitle, 24, '#ffffff', '#ffc83d');
    tabBar(this, 'Shop');

    const top0 = CONTENT_TOP + 50;
    const rowH = Math.min(90, (CONTENT_BOTTOM - top0) / UPGRADES.length - 6);
    UPGRADES.forEach((u, i) => {
      const lv = save.upgrades[u.id] ?? 0;
      const maxed = lv >= u.maxLevel;
      const cost = upgradeCost(u, lv);
      const y = top0 + i * (rowH + 6) + rowH / 2;
      this.add.rectangle(W / 2, y, 510, rowH, COLORS.panel, 0.95).setStrokeStyle(1, 0x2e2650);
      this.add.image(32 + 18, y, u.icon).setDisplaySize(rowH - 30, rowH - 30);
      this.add.text(92, y - rowH / 2 + 12, u.name, textStyle(19)).setOrigin(0, 0);
      this.add.text(92, y + 2, u.desc, textStyle(14, '#a9a5c8', false)).setOrigin(0, 0);
      // 等級格
      for (let k = 0; k < u.maxLevel; k++) {
        this.add.rectangle(92 + k * 20 + 7, y + rowH / 2 - 14, 14, 6, k < lv ? COLORS.cyan : 0x2a2440);
      }
      const btn = makeButton(this, W - 84, y, 130, rowH - 26, maxed ? T.maxed : `◆ ${cost}`, maxed ? 0x555577 : COLORS.gold, () => {
        const s = loadSave();
        const cur = s.upgrades[u.id] ?? 0;
        const c = upgradeCost(u, cur);
        if (cur >= u.maxLevel || s.credits < c) return;
        s.credits -= c;
        s.upgrades[u.id] = cur + 1;
        writeSave(s);
        Audio.play('sfx-levelup', 0.4);
        this.draw();
      }, 18);
      btn.setEnabled(!maxed && save.credits >= cost);
    });
  }
}
