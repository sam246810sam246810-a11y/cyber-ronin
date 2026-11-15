import Phaser from 'phaser';
import { UPGRADES, UpgradeDef, UpgradeId, upgradeCost } from '../config/balance';
import { T } from '../i18n/zh-TW';
import { COLORS, W, textStyle } from '../game/layout';
import { fancyTitle, makeButton, setupLogicalCamera } from '../game/ui';
import { CONTENT_BOTTOM, CONTENT_TOP, enter, lobbyBackground, tabBar, topBar } from '../game/chrome';

import { loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { vibrate } from '../game/haptics';

/** 天賦樹的三條分支（上面的節點要先學 1 級，下面的才會開放） */
const BRANCHES: { name: string; color: number; css: string; ids: UpgradeId[] }[] = [
  { name: '攻擊', color: 0xff3d81, css: '#ff6a9a', ids: ['might', 'growth'] },
  { name: '生存', color: 0x5dff7a, css: '#7dff8a', ids: ['hp', 'speed', 'pickup'] },
  { name: '戰術', color: 0x3df5ff, css: '#7fe9ff', ids: ['reroll', 'banish', 'lock'] },
];

/** 強化：天賦樹 */
export class ShopScene extends Phaser.Scene {
  private selected: UpgradeId = 'might';

  constructor() {
    super('Shop');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playMusic('bgm-menu');
    this.draw();
    enter(this);
  }

  private def(id: UpgradeId): UpgradeDef {
    return UPGRADES.find((u) => u.id === id)!;
  }

  /** 分支裡前一個節點至少 1 級才開放 */
  private open(id: UpgradeId): boolean {
    const s = loadSave();
    for (const b of BRANCHES) {
      const i = b.ids.indexOf(id);
      if (i > 0) return (s.upgrades[b.ids[i - 1]] ?? 0) > 0;
    }
    return true;
  }

  private draw(popId?: UpgradeId) {
    this.children.removeAll(true);
    this.tweens.killAll();
    lobbyBackground(this, 0.75);
    const save = loadSave();
    topBar(this, save);
    fancyTitle(this, W / 2, CONTENT_TOP + 22, T.shopTitle, 24, '#ffffff', '#ffc83d');
    tabBar(this, 'Shop');

    const detailTop = CONTENT_BOTTOM - 210;
    const top0 = CONTENT_TOP + 90;
    const rowGap = Math.min(150, (detailTop - top0 - 40) / 3);
    const g = this.add.graphics();
    BRANCHES.forEach((b, c) => {
      const x = W / 2 + (c - 1) * 170;
      this.add.text(x, top0 - 46, b.name, textStyle(18, b.css)).setOrigin(0.5).setStroke('#07060d', 4);
      b.ids.forEach((id, r) => {
        const y = top0 + r * rowGap;
        const u = this.def(id);
        const lv = save.upgrades[id] ?? 0;
        const open = this.open(id);
        // 連線
        if (r > 0) {
          g.lineStyle(4, open ? b.color : 0x2a2440, open ? 0.8 : 1);
          g.lineBetween(x, y - rowGap + 50, x, y - 50);
        }
        const sel = id === this.selected;
        const node = this.add.container(x, y);
        const ring = this.add.circle(0, 0, 46, 0x110d1f, 0.98).setStrokeStyle(sel ? 5 : 3, sel ? 0xffffff : open ? b.color : 0x3a3452);
        node.add(ring);
        if (lv > 0) node.add(this.add.circle(0, 0, 40, b.color, 0.15 + 0.1 * lv));
        if (this.textures.exists(u.icon)) {
          const img = this.add.image(0, 0, u.icon).setDisplaySize(56, 56);
          if (!open) img.setTint(0x3a3452);
          node.add(img);
        }
        // 等級圓點
        for (let k = 0; k < u.maxLevel; k++) {
          const a = Math.PI / 2 + (k - (u.maxLevel - 1) / 2) * 0.32;
          node.add(this.add.circle(Math.cos(a) * 52, Math.sin(a) * 52, 5, k < lv ? b.color : 0x2a2440).setStrokeStyle(1, 0x07060d));
        }
        node.add(this.add.text(0, 72, u.name, textStyle(14, open ? '#ffffff' : '#5a5678')).setOrigin(0.5).setStroke('#07060d', 3));
        node.setSize(100, 100).setInteractive({ useHandCursor: true });
        node.on('pointerup', () => {
          this.selected = id;
          Audio.play('sfx-click', 0.3);
          this.draw();
        });
        if (popId === id) {
          // 升級動畫：節點彈一下＋光圈擴散
          node.setScale(1.3);
          this.tweens.add({ targets: node, scale: 1, duration: 300, ease: 'Back.Out' });
          const burst = this.add.circle(x, y, 46).setStrokeStyle(6, b.color, 1);
          this.tweens.add({ targets: burst, scale: 2.2, alpha: 0, duration: 500, onComplete: () => burst.destroy() });
        }
      });
    });

    // 詳細與升級
    const u = this.def(this.selected);
    const lv = save.upgrades[u.id] ?? 0;
    const maxed = lv >= u.maxLevel;
    const cost = upgradeCost(u, lv);
    const open = this.open(u.id);
    const branch = BRANCHES.find((b) => b.ids.includes(u.id))!;
    this.add.rectangle(W / 2, (detailTop + CONTENT_BOTTOM) / 2, 510, CONTENT_BOTTOM - detailTop, 0x0b0916, 0.96).setStrokeStyle(2, branch.color, 0.7);
    this.add.text(36, detailTop + 18, `${u.name}　Lv ${lv} / ${u.maxLevel}`, textStyle(22)).setOrigin(0, 0);
    this.add.text(36, detailTop + 54, `每級：${u.desc}`, textStyle(15, '#c9c6e0', false)).setOrigin(0, 0);
    const prev = branch.ids[branch.ids.indexOf(u.id) - 1];
    this.add
      .text(36, detailTop + 82, open ? (maxed ? '已經學滿了' : `下一級花費：信用點 ${cost}`) : `需要先學會「${this.def(prev).name}」`, textStyle(14, open ? '#ffd84d' : '#ff8a5d', false))
      .setOrigin(0, 0);
    const btn = makeButton(this, W / 2, CONTENT_BOTTOM - 48, 300, 64, maxed ? T.maxed : `升級　◆ ${cost}`, maxed ? 0x555577 : COLORS.gold, () => {
      const s = loadSave();
      const cur = s.upgrades[u.id] ?? 0;
      const c = upgradeCost(u, cur);
      if (!this.open(u.id) || cur >= u.maxLevel || s.credits < c) return;
      s.credits -= c;
      s.upgrades[u.id] = cur + 1;
      writeSave(s);
      Audio.play('sfx-levelup', 0.45);
      vibrate(30);
      this.draw(u.id);
    }, 22);
    btn.setEnabled(open && !maxed && save.credits >= cost);
  }
}
