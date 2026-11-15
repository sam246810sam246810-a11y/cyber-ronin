import Phaser from 'phaser';
import { COLORS, H, W, textStyle } from '../game/layout';
import { header, makeButton, menuBackground, moduleIcon, setupLogicalCamera } from '../game/ui';
import { loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { dismantle, equippedStats, upgradeModule } from '../game/meta';
import { MAX_MOD_LEVEL, MODULE_BASES, MOD_RARITY, SLOT_NAME, Slot, StatKey, dismantleValue, fmtStat, mainValue, upgradeCost } from '../config/meta';

type Filter = 'all' | Slot;
const PER_PAGE = 15;

/** 義體：裝備、強化、分解模組 */
export class ArmoryScene extends Phaser.Scene {
  private filter: Filter = 'all';
  private page = 0;
  private selected: string | null = null;

  constructor() {
    super('Armory');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playMusic('bgm-menu');
    this.page = 0;
    this.selected = null;
    this.draw();
  }

  private draw() {
    this.children.removeAll(true);
    menuBackground(this);
    const s = loadSave();
    const hd = header(this, '義體', null, () => this.scene.start('Menu'));
    hd.credits.setText(`零件 ${s.parts}`).setColor('#7fd4ff');

    // 裝備欄
    const slots: Slot[] = ['head', 'body', 'arm'];
    slots.forEach((slot, i) => {
      const x = W / 2 + (i - 1) * 160;
      const y = 150;
      const uid = s.equipped[slot];
      const m = s.modules.find((q) => q.uid === uid);
      this.add.text(x, y - 66, SLOT_NAME[slot], textStyle(14, COLORS.dim, false)).setOrigin(0.5);
      if (m) {
        const icon = moduleIcon(this, x, y, 104, m, true);
        icon.setInteractive({ useHandCursor: true }).on('pointerup', () => {
          this.selected = m.uid;
          this.draw();
        });
      } else {
        this.add.rectangle(x, y, 104, 104, 0x0d0a18, 0.8).setStrokeStyle(1, 0x3a3060);
        this.add.text(x, y, '空', textStyle(16, '#5a5680', false)).setOrigin(0.5);
      }
    });

    // 總加成
    const st = equippedStats(s);
    const lines = (Object.keys(st) as StatKey[]).map((k) => fmtStat(k, st[k]!));
    this.add
      .text(W / 2, 222, lines.length ? lines.join('　') : '尚未裝備模組。打倒 Boss 或抽卡可以取得。', {
        ...textStyle(13, '#a9e8ff', false),
        align: 'center',
        wordWrap: { width: 500 },
      })
      .setOrigin(0.5, 0);

    // 篩選
    const filters: [Filter, string][] = [
      ['all', '全部'],
      ['head', '頭部'],
      ['body', '軀幹'],
      ['arm', '手臂'],
    ];
    filters.forEach(([f, label], i) => {
      makeButton(this, 70 + i * 100, 300, 92, 40, label, COLORS.violet, () => {
        this.filter = f;
        this.page = 0;
        this.draw();
      }, 15).setActive2(this.filter === f);
    });
    const equippedSet = new Set(Object.values(s.equipped));
    const junk = s.modules.filter((m) => m.rarity === 0 && m.level === 0 && !equippedSet.has(m.uid));
    makeButton(this, W - 66, 300, 112, 40, `分解 N ×${junk.length}`, 0x888899, () => {
      const save = loadSave();
      const gain = dismantle(save, junk.map((m) => m.uid));
      writeSave(save);
      if (gain) Audio.play('sfx-chest', 0.4);
      this.selected = null;
      this.draw();
    }, 13).setEnabled(junk.length > 0);

    // 背包
    const list = s.modules
      .filter((m) => this.filter === 'all' || MODULE_BASES.find((b) => b.id === m.base)?.slot === this.filter)
      .sort((a, b) => b.rarity - a.rarity || b.level - a.level);
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const cell = 96;
    list.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE).forEach((m, i) => {
      const x = W / 2 + ((i % 5) - 2) * (cell + 4);
      const y = 380 + Math.floor(i / 5) * (cell + 4);
      const icon = moduleIcon(this, x, y, cell - 6, m, equippedSet.has(m.uid));
      if (m.uid === this.selected) this.add.rectangle(x, y, cell, cell).setStrokeStyle(3, 0xffffff, 1);
      icon.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        this.selected = m.uid;
        Audio.play('sfx-click', 0.3);
        this.draw();
      });
    });
    if (list.length === 0) this.add.text(W / 2, 430, '背包是空的', textStyle(16, COLORS.dim, false)).setOrigin(0.5);
    if (pages > 1) {
      const py = 380 + 3 * (cell + 4) - 20;
      makeButton(this, W / 2 - 90, py, 70, 36, '<', COLORS.cyan, () => {
        this.page = Math.max(0, this.page - 1);
        this.draw();
      }, 18).setEnabled(this.page > 0);
      this.add.text(W / 2, py, `${this.page + 1} / ${pages}`, textStyle(15, COLORS.dim, false)).setOrigin(0.5);
      makeButton(this, W / 2 + 90, py, 70, 36, '>', COLORS.cyan, () => {
        this.page = Math.min(pages - 1, this.page + 1);
        this.draw();
      }, 18).setEnabled(this.page < pages - 1);
    }

    this.drawDetail();
  }

  private drawDetail() {
    const s = loadSave();
    const m = s.modules.find((q) => q.uid === this.selected);
    const top = Math.max(720, H - 250);
    this.add.rectangle(W / 2, (top + H) / 2, 510, H - top - 16, 0x0b0916, 0.96).setStrokeStyle(1, COLORS.magenta, 0.5);
    if (!m) {
      this.add.text(W / 2, top + 40, '點選模組查看詳細資料', textStyle(15, COLORS.dim, false)).setOrigin(0.5);
      return;
    }
    const base = MODULE_BASES.find((b) => b.id === m.base)!;
    const r = MOD_RARITY[m.rarity];
    moduleIcon(this, 70, top + 62, 88, m);
    this.add.text(126, top + 22, `${base.name}  +${m.level}`, textStyle(21)).setOrigin(0, 0);
    this.add.text(W - 30, top + 24, `${r.name}　${SLOT_NAME[base.slot]}`, textStyle(14, r.css)).setOrigin(1, 0);
    const lines = [`主屬性：${fmtStat(base.main, mainValue(m))}`, ...m.subs.map((x) => `・${fmtStat(x.key, x.value * (1 + 0.05 * m.level))}`)];
    if (m.subs.length === 0) lines.push(`（${r.name} 沒有副屬性）`);
    this.add.text(126, top + 56, lines.join('\n'), { ...textStyle(14, '#c9c6e0', false), lineSpacing: 4 }).setOrigin(0, 0);

    const equipped = s.equipped[base.slot] === m.uid;
    const by = H - 44;
    makeButton(this, W / 2 - 165, by, 150, 50, equipped ? '卸下' : '裝備', COLORS.cyan, () => {
      const save = loadSave();
      save.equipped[base.slot] = equipped ? null : m.uid;
      writeSave(save);
      Audio.play('sfx-click', 0.4);
      this.draw();
    }, 18);
    const cost = upgradeCost(m);
    const maxed = m.level >= MAX_MOD_LEVEL;
    makeButton(this, W / 2, by, 150, 50, maxed ? '已滿級' : `強化 ${cost} 零件`, COLORS.gold, () => {
      const save = loadSave();
      if (upgradeModule(save, m.uid)) {
        writeSave(save);
        Audio.play('sfx-levelup', 0.4);
      }
      this.draw();
    }, 15).setEnabled(!maxed && s.parts >= cost);
    makeButton(this, W / 2 + 165, by, 150, 50, `分解 +${dismantleValue(m)}`, 0x888899, () => {
      const save = loadSave();
      dismantle(save, [m.uid]);
      writeSave(save);
      Audio.play('sfx-chest', 0.4);
      this.selected = null;
      this.draw();
    }, 15).setEnabled(!equipped);
  }
}
