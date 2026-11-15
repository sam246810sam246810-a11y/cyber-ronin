import Phaser from 'phaser';
import { COLORS, H, W, textStyle } from '../game/layout';
import { fancyTitle, makeButton, moduleIcon, setupLogicalCamera } from '../game/ui';
import { CONTENT_TOP, enter, goTo, lobbyBackground, tabBar, topBar } from '../game/chrome';

import { loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { vibrate } from '../game/haptics';
import { pull } from '../game/meta';
import { GACHA, MOD_RARITY, MODULE_BASES, ModuleItem, fmtStat, mainValue } from '../config/meta';

/** 抽卡：黑市義體販賣機 */
export class GachaScene extends Phaser.Scene {
  private busy = false;

  constructor() {
    super('Gacha');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playMusic('bgm-menu');
    this.busy = false;
    this.draw();
    enter(this);
  }

  private draw() {
    this.children.removeAll(true);
    this.tweens.killAll();
    lobbyBackground(this, 0.6);
    const s = loadSave();
    topBar(this, s);
    fancyTitle(this, W / 2, CONTENT_TOP + 24, '黑市販賣機', 26, '#ffffff', '#ff3d81');
    tabBar(this, 'Gacha');

    const my = CONTENT_TOP + 230;
    this.add.ellipse(W / 2, my + 175, 300, 50, COLORS.magenta, 0.15);
    const machine = this.add.image(W / 2, my, this.textures.exists('gacha-machine') ? 'gacha-machine' : 'pickup-chest');
    const src = machine.texture.getSourceImage();
    machine.setScale(360 / Math.max(src.width, src.height)).setName('machine');
    this.tweens.add({ targets: machine, y: my - 4, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.InOut' });

    this.add.text(W / 2, my + 210, `距離保底 SSR 還有 ${GACHA.pity - s.pity} 抽`, textStyle(17, '#ffd84d')).setOrigin(0.5);
    this.add.text(W / 2, my + 238, '十連抽保證至少一個 SR 以上', textStyle(14, COLORS.dim, false)).setOrigin(0.5);

    const by = my + 290;
    makeButton(this, W / 2 - 120, by, 210, 70, `單抽  ${GACHA.single}`, COLORS.cyan, () => this.doPull(1), 22).setEnabled(s.chips >= GACHA.single);
    makeButton(this, W / 2 + 120, by, 210, 70, `十連  ${GACHA.ten}`, COLORS.magenta, () => this.doPull(10), 22).setEnabled(s.chips >= GACHA.ten);

    makeButton(this, W / 2 - 90, by + 86, 160, 44, '機率說明', 0x888899, () => this.showRates(), 15);
    makeButton(this, W / 2 + 90, by + 86, 160, 44, '前往義體', COLORS.cyan, () => goTo(this, 'Armory'), 15);
    this.add
      .text(W / 2, by + 130, '晶片可從每日任務、成就、每日挑戰與擊敗 Boss 取得', { ...textStyle(13, '#8a86a8', false), align: 'center', wordWrap: { width: 460 } })
      .setOrigin(0.5, 0);
  }

  private doPull(n: 1 | 10) {
    if (this.busy) return;
    const s = loadSave();
    const res = pull(s, n);
    if (!res) return;
    writeSave(s);
    this.busy = true;
    const best = Math.max(...res.map((m) => m.rarity));
    const machine = this.children.getByName('machine') as Phaser.GameObjects.Image;
    Audio.play('sfx-chest', 0.5);
    vibrate(40);
    // 機器搖晃 → 膠囊掉出 → 光柱
    this.tweens.add({ targets: machine, angle: { from: -4, to: 4 }, yoyo: true, repeat: 3, duration: 70, onComplete: () => machine.setAngle(0) });
    const capKey = `capsule-${best}`;
    const cap = this.add.image(W / 2, 420, this.textures.exists(capKey) ? capKey : 'gem3').setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: cap, alpha: 1, y: 520, scale: 1.4, delay: 350, duration: 450, ease: 'Bounce.Out' });
    const col = MOD_RARITY[best].color;
    this.time.delayedCall(850, () => {
      const pillar = this.add.rectangle(W / 2, H / 2, best >= 2 ? 180 : 90, H, col, 0.6);
      this.tweens.add({ targets: pillar, alpha: 0, scaleX: best === 3 ? 4 : 2, duration: 700 });
      if (best === 3) {
        this.cameras.main.flash(400, 255, 210, 80);
        Audio.play('sfx-levelup', 0.7);
        vibrate(150);
      }
      this.time.delayedCall(450, () => this.showResults(res));
    });
  }

  private showResults(res: ModuleItem[]) {
    const layer = this.add.container(0, 0);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.9).setInteractive());
    layer.add(this.add.text(W / 2, 150, res.length === 1 ? '抽卡結果' : '十連結果', textStyle(30, '#ffd84d')).setOrigin(0.5));
    const cols = res.length === 1 ? 1 : 5;
    const size = res.length === 1 ? 150 : 92;
    res.forEach((m, i) => {
      const x = W / 2 + ((i % cols) - (cols - 1) / 2) * (size + 8);
      const y = (res.length === 1 ? 320 : 260) + Math.floor(i / cols) * (size + 46);
      const icon = moduleIcon(this, x, y, size, m);
      icon.setScale(0);
      this.tweens.add({ targets: icon, scale: 1, delay: i * 90, duration: 220, ease: 'Back.Out' });
      const base = MODULE_BASES.find((b) => b.id === m.base)!;
      const t = this.add.text(x, y + size / 2 + 6, base.name, textStyle(12, MOD_RARITY[m.rarity].css, false)).setOrigin(0.5, 0);
      layer.add([icon, t]);
      if (res.length === 1) {
        const lines = [fmtStat(base.main, mainValue(m)), ...m.subs.map((x2) => fmtStat(x2.key, x2.value))];
        layer.add(this.add.text(W / 2, y + size / 2 + 34, lines.join('\n'), { ...textStyle(15, '#c9c6e0', false), align: 'center' }).setOrigin(0.5, 0));
      }
    });
    const ok = makeButton(this, W / 2, H - 110, 260, 64, '確定', COLORS.cyan, () => {
      this.busy = false;
      this.draw();
    }, 22);
    layer.add(ok);
  }

  private showRates() {
    const layer = this.add.container(0, 0);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.92).setInteractive());
    layer.add(this.add.text(W / 2, 200, '機率說明', textStyle(28, '#ffd84d')).setOrigin(0.5));
    const rows = MOD_RARITY.map((r, i) => `${r.name}　${(GACHA.rates[i] * 100).toFixed(1)}%　（副屬性 ${r.subs} 條）`);
    layer.add(
      this.add
        .text(
          W / 2,
          250,
          [
            ...rows,
            '',
            `・十連抽保證至少一個 SR 以上`,
            `・連續 ${GACHA.pity} 抽沒有 SSR 時，第 ${GACHA.pity} 抽必定是 SSR`,
            '・保底計數在抽到 SSR 後歸零',
            '・模組種類（12 種）平均機率',
          ].join('\n'),
          { ...textStyle(17, '#c9c6e0', false), align: 'left', lineSpacing: 10 },
        )
        .setOrigin(0.5, 0),
    );
    const ok = makeButton(this, W / 2, H - 140, 220, 58, '關閉', COLORS.cyan, () => layer.destroy(), 20);
    layer.add(ok);
  }
}
