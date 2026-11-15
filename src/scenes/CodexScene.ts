import Phaser from 'phaser';
import { BOSSES, ENEMIES, EVOLUTIONS, PASSIVES, PASSIVE_POOL, UNLOCKS, WEAPONS, WEAPON_POOL, WeaponId } from '../config/balance';
import { T } from '../i18n/zh-TW';
import { COLORS, H, W, textStyle } from '../game/layout';
import { header, makeButton, menuBackground, setupLogicalCamera } from '../game/ui';
import { loadSave } from '../game/storage';
import { Audio } from '../game/audio';

type Tab = 'weapons' | 'items' | 'enemies';

interface Entry {
  icon: string;
  name: string;
  desc: string;
  seen: boolean;
  hint?: string;
  big?: boolean;
}

export class CodexScene extends Phaser.Scene {
  private tab: Tab = 'weapons';
  private selected = 0;

  constructor() {
    super('Codex');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playMusic('bgm-menu');
    this.selected = 0;
    this.draw();
  }

  private entries(): Entry[] {
    const s = loadSave();
    const hintFor = (id: string) => {
      const u = UNLOCKS.find((x) => x.id === id);
      return u && !s.unlocked.includes(u.id) ? T.unlockHint(u.hint) : undefined;
    };
    if (this.tab === 'weapons') {
      const evolved: WeaponId[] = EVOLUTIONS.map((e) => e.result);
      return [...WEAPON_POOL, ...evolved].map((id) => {
        const w = WEAPONS[id];
        const evo = EVOLUTIONS.find((e) => e.result === id);
        const desc = evo ? `${w.desc}\n${T.evolution}：${WEAPONS[evo.weapon].name} 滿級 ＋ ${PASSIVES[evo.passive].name}` : w.desc;
        return { icon: `icon-${id}`, name: w.name, desc, seen: s.seenWeapons.includes(id), hint: hintFor(id) };
      });
    }
    if (this.tab === 'items') {
      return PASSIVE_POOL.map((id) => {
        const p = PASSIVES[id];
        return { icon: `icon-${id}`, name: p.name, desc: `每級：${p.desc}（最高 Lv ${p.maxLevel}）`, seen: s.seenPassives.includes(id), hint: hintFor(id) };
      });
    }
    const grunts = (['drone', 'thug', 'husk', 'gunner', 'elite'] as const).map((k) => {
      const e = ENEMIES[k];
      return { icon: e.tex, name: e.name, desc: e.desc, seen: s.seenEnemies.includes(k) };
    });
    const bosses = BOSSES.map((b) => ({ icon: b.tex, name: b.title, desc: `BOSS　${b.desc}`, seen: s.seenEnemies.includes(`boss-${b.variant}`), big: true }));
    return [...grunts, ...bosses];
  }

  private draw() {
    this.children.removeAll(true);
    menuBackground(this);
    header(this, T.codexTitle, null, () => this.scene.start('Menu'));

    const tabs: [Tab, string][] = [
      ['weapons', T.tabWeapons],
      ['items', T.tabItems],
      ['enemies', T.tabEnemies],
    ];
    tabs.forEach(([t, label], i) => {
      makeButton(this, W / 2 + (i - 1) * 164, 116, 150, 46, label, COLORS.violet, () => {
        this.tab = t;
        this.selected = 0;
        this.draw();
      }, 18).setActive2(this.tab === t);
    });

    const list = this.entries();
    const found = list.filter((e) => e.seen).length;
    this.add.text(W / 2, 156, `${found} / ${list.length}`, textStyle(14, COLORS.dim, false)).setOrigin(0.5);

    const cols = 4;
    const cell = 118;
    const x0 = W / 2 - (cols * cell) / 2 + cell / 2;
    const y0 = 176 + cell / 2;
    list.forEach((e, i) => {
      const x = x0 + (i % cols) * cell;
      const y = y0 + Math.floor(i / cols) * cell;
      const sel = i === this.selected;
      const bg = this.add.rectangle(x, y, cell - 10, cell - 10, sel ? 0x1c1838 : COLORS.panel, 0.95).setStrokeStyle(sel ? 2 : 1, sel ? COLORS.cyan : 0x2e2650);
      if (this.textures.exists(e.icon)) {
        const img = this.add.image(x, y - 10, e.icon);
        const src = img.texture.getSourceImage();
        const s = 70 / Math.max(src.width, src.height);
        img.setScale(s);
        if (!e.seen) img.setTintFill(0x1a1630);
      }
      this.add.text(x, y + cell / 2 - 22, e.seen ? e.name : T.unknown, textStyle(12, e.seen ? '#e9f6ff' : COLORS.dim, false)).setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerup', () => {
        this.selected = i;
        Audio.play('sfx-click', 0.3);
        this.draw();
      });
    });

    // 詳細說明
    const e = list[this.selected];
    if (e) {
      const rows = Math.ceil(list.length / cols);
      const py = Math.min(H - 110, y0 + rows * cell - cell / 2 + 20);
      const ph = H - py - 20;
      this.add.rectangle(W / 2, py + ph / 2, 510, ph, 0x0b0916, 0.95).setStrokeStyle(1, COLORS.magenta, 0.6);
      this.add.text(36, py + 16, e.seen ? e.name : T.unknown, textStyle(22)).setOrigin(0, 0);
      const desc = e.seen ? e.desc : e.hint ?? '尚未遇見。';
      this.add.text(36, py + 52, desc, { ...textStyle(16, '#c9c6e0', false), wordWrap: { width: 470, useAdvancedWrap: true }, lineSpacing: 6 }).setOrigin(0, 0);
    }
  }
}
