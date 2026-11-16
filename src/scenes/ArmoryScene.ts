import Phaser from 'phaser';
import { COLORS, W, textStyle } from '../game/layout';
import { makeButton, moduleIcon, setupLogicalCamera } from '../game/ui';
import { CONTENT_BOTTOM, CONTENT_TOP, enter, lobbyBackground, tabBar, topBar } from '../game/chrome';

import { loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { SKINS, applySkin, skinUnlocked } from '../game/skins';
import { AFF_LINES, AFF_MAX, AFF_PERKS, affinityLevel, affinityPoints, affinityProgress } from '../game/affinity';
import { dismantle, equippedStats, upgradeModule } from '../game/meta';
import { CHARACTERS, CHAR_ORDER, CharId } from '../config/balance';
import { CHAR_TALENTS } from '../config/gacha';
import { canLearnTalent, learnTalent, ownsChar, talentLevel } from '../game/gacha';
import { MAX_MOD_LEVEL, MODULE_BASES, MOD_RARITY, SLOT_NAME, Slot, StatKey, dismantleValue, fmtStat, mainValue, upgradeCost } from '../config/meta';

type Filter = 'all' | Slot;
type ArmoryTab = 'mods' | 'talent' | 'bond';

/** 義體：裝備、強化、分解模組 */
export class ArmoryScene extends Phaser.Scene {
  private filter: Filter = 'all';
  private page = 0;
  private selected: string | null = null;
  private tab: ArmoryTab = 'mods';
  private charIdx = 0;

  constructor() {
    super('Armory');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playLobby();
    this.page = 0;
    this.selected = null;
    this.charIdx = Math.max(0, CHAR_ORDER.indexOf(loadSave().lastChar));
    this.draw();
    enter(this);
  }

  private draw() {
    this.children.removeAll(true);
    this.tweens.killAll();
    lobbyBackground(this, 0.72);
    const s = loadSave();
    topBar(this, s);
    tabBar(this, 'Armory');

    // 分頁：義體／角色天賦
    (['mods', 'talent', 'bond'] as const).forEach((t, i) => {
      makeButton(this, W / 2 + (i - 1) * 166, CONTENT_TOP + 26, 154, 44, t === 'mods' ? '義體' : t === 'talent' ? '角色天賦' : '好感度', COLORS.cyan, () => {
        this.tab = t;
        this.draw();
      }, 17).setActive2(this.tab === t);
    });

    // 角色站在中間（左右切換）
    const id = CHAR_ORDER[this.charIdx];
    const top = CONTENT_TOP + 56;
    const heroH = 240;
    const ring = this.add.ellipse(W / 2, top + heroH - 6, 190, 40, COLORS.cyan, 0.16).setStrokeStyle(2, COLORS.cyan, 0.6);
    this.tweens.add({ targets: ring, alpha: 0.5, yoyo: true, repeat: -1, duration: 1300 });
    const key = this.textures.exists(`hd-${id}`) ? `hd-${id}` : `char-${id}`;
    const hero = this.add.image(W / 2, top + heroH, key).setOrigin(0.5, 1);
    hero.setScale(heroH / hero.texture.getSourceImage().height);
    if (!ownsChar(s, id)) hero.setTint(0x2a2440);
    else applySkin(hero, s, id);
    this.tweens.add({ targets: hero, scaleY: hero.scaleY * 1.012, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.InOut' });
    const nameY = top + heroH + 18;
    this.add.text(W / 2, nameY, CHARACTERS[id].name, textStyle(18, ownsChar(s, id) ? '#ffffff' : '#8a86a8')).setOrigin(0.5).setStroke('#07060d', 4);
    const arrow = (dx: number) =>
      makeButton(this, W / 2 + dx * 120, nameY, 40, 36, dx < 0 ? '<' : '>', COLORS.cyan, () => {
        this.charIdx = (this.charIdx + dx + CHAR_ORDER.length) % CHAR_ORDER.length;
        this.draw();
      }, 18);
    arrow(-1);
    arrow(1);

    if (this.tab === 'talent') {
      this.drawTalents(id, nameY + 34);
      return;
    }
    if (this.tab === 'bond') {
      this.drawBond(id, nameY + 34);
      return;
    }

    // 三個裝備欄圍繞角色
    const slots: [Slot, number, number][] = [
      ['head', W / 2 - 178, top + 64],
      ['body', W / 2 + 178, top + 64],
      ['arm', W / 2 - 178, top + 188],
    ];
    const g = this.add.graphics();
    for (const [slot, x, y] of slots) {
      g.lineStyle(1, COLORS.cyan, 0.35).lineBetween(x + (x < W / 2 ? 50 : -50), y, W / 2 + (x < W / 2 ? -40 : 40), y + 20);
      const uid = s.equipped[slot];
      const m = s.modules.find((q) => q.uid === uid);
      this.add.text(x, y - 60, SLOT_NAME[slot], textStyle(12, COLORS.dim, false)).setOrigin(0.5);
      if (m) {
        const icon = moduleIcon(this, x, y, 96, m, true);
        icon.setInteractive({ useHandCursor: true }).on('pointerup', () => {
          this.selected = m.uid;
          this.draw();
        });
      } else {
        this.add.rectangle(x, y, 96, 96, 0x0d0a18, 0.85).setStrokeStyle(2, 0x3a3060);
        this.add.text(x, y, '＋', textStyle(26, '#5a5680')).setOrigin(0.5);
      }
    }
    // 總加成（右下）
    const st = equippedStats(s);
    const lines = (Object.keys(st) as StatKey[]).map((k) => fmtStat(k, st[k]!));
    const bx = W / 2 + 178;
    const by0 = top + 188;
    this.add.rectangle(bx, by0, 150, 120, 0x0b0916, 0.9).setStrokeStyle(1, COLORS.cyan, 0.5);
    this.add.text(bx, by0 - 52, '義體加成', textStyle(12, '#7fd4ff')).setOrigin(0.5, 0);
    this.add
      .text(bx, by0 - 32, lines.length ? lines.slice(0, 6).join('\n') : '尚未裝備', { ...textStyle(11, '#c9c6e0', false), align: 'center', lineSpacing: 2 })
      .setOrigin(0.5, 0);

    // 篩選
    const fy = nameY + 44;
    const filters: [Filter, string][] = [
      ['all', '全部'],
      ['head', '頭部'],
      ['body', '軀幹'],
      ['arm', '手臂'],
    ];
    filters.forEach(([f, label], i) => {
      makeButton(this, 70 + i * 100, fy, 92, 38, label, COLORS.violet, () => {
        this.filter = f;
        this.page = 0;
        this.draw();
      }, 15).setActive2(this.filter === f);
    });
    const equippedSet = new Set(Object.values(s.equipped));
    const junk = s.modules.filter((m) => m.rarity === 0 && m.level === 0 && !equippedSet.has(m.uid));
    makeButton(this, W - 66, fy, 112, 38, `分解 N ×${junk.length}`, 0x888899, () => {
      const save = loadSave();
      const gain = dismantle(save, junk.map((m) => m.uid));
      writeSave(save);
      if (gain) Audio.play('sfx-chest', 0.4);
      this.selected = null;
      this.draw();
    }, 13).setEnabled(junk.length > 0);

    // 背包（依畫面高度決定一頁幾列）
    const list = s.modules
      .filter((m) => this.filter === 'all' || MODULE_BASES.find((b) => b.id === m.base)?.slot === this.filter)
      .sort((a, b) => b.rarity - a.rarity || b.level - a.level);
    const cell = 82;
    const gridTop = fy + 32;
    const detailTop = CONTENT_BOTTOM - 206;
    const rows = Math.max(1, Math.floor((detailTop - gridTop - 46) / (cell + 4)));
    const per = rows * 5;
    const pages = Math.max(1, Math.ceil(list.length / per));
    this.page = Math.min(this.page, pages - 1);
    list.slice(this.page * per, this.page * per + per).forEach((m, i) => {
      const x = W / 2 + ((i % 5) - 2) * (cell + 4);
      const y = gridTop + cell / 2 + Math.floor(i / 5) * (cell + 4);
      const icon = moduleIcon(this, x, y, cell - 6, m, equippedSet.has(m.uid));
      if (m.uid === this.selected) this.add.rectangle(x, y, cell, cell).setStrokeStyle(3, 0xffffff, 1);
      icon.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        this.selected = m.uid;
        Audio.play('sfx-click', 0.3);
        this.draw();
      });
    });
    if (list.length === 0) this.add.text(W / 2, gridTop + 50, '背包是空的', textStyle(16, COLORS.dim, false)).setOrigin(0.5);
    if (pages > 1) {
      const py = gridTop + rows * (cell + 4) + 18;
      makeButton(this, W / 2 - 90, py, 70, 34, '<', COLORS.cyan, () => {
        this.page = Math.max(0, this.page - 1);
        this.draw();
      }, 18).setEnabled(this.page > 0);
      this.add.text(W / 2, py, `${this.page + 1} / ${pages}`, textStyle(15, COLORS.dim, false)).setOrigin(0.5);
      makeButton(this, W / 2 + 90, py, 70, 34, '>', COLORS.cyan, () => {
        this.page = Math.min(pages - 1, this.page + 1);
        this.draw();
      }, 18).setEnabled(this.page < pages - 1);
    }

    this.drawDetail();
  }

  /** 角色天賦：5 個節點依序學習 */
  /** 好感度：等級、進度條、每級獎勵與解鎖的台詞 */
  private drawBond(id: CharId, y0: number) {
    const s = loadSave();
    const lv = affinityLevel(s, id);
    const pr = affinityProgress(s, id);
    const pts = affinityPoints(s, id);
    this.add.text(W / 2, y0, `好感度 Lv${lv}　（${pts} 點${pr.need ? `，下一級還差 ${pr.need}` : '，已滿級'}）`, textStyle(14, '#5dffb0')).setOrigin(0.5);
    const bw = 420;
    this.add.rectangle(W / 2, y0 + 24, bw, 10, 0x1a1430).setStrokeStyle(1, 0x2bd98a, 0.6);
    this.add.rectangle(W / 2 - bw / 2, y0 + 24, bw * pr.ratio, 10, 0x2bd98a).setOrigin(0, 0.5);
    this.add.text(W / 2, y0 + 44, '用這個角色出擊就會累積好感（存活越久越多，勝利額外 +15）', textStyle(11, COLORS.dim, false)).setOrigin(0.5);
    // 換色皮膚：好感度到對應等級解鎖
    const owned = ownsChar(s, id);
    const cur = s.skins?.[id] ?? 0;
    SKINS.forEach((sk, i) => {
      const x = W / 2 + (i - (SKINS.length - 1) / 2) * 96;
      const y = y0 + 80;
      const ok = owned && skinUnlocked(s, id, i);
      const chip = this.add.circle(x, y, 17, sk.tint || 0xffffff, ok ? 1 : 0.25).setStrokeStyle(i === cur ? 3 : 1, i === cur ? 0x5dffb0 : 0x3a3452);
      this.add.text(x + 24, y, ok ? sk.name : `Lv${i + 1}`, textStyle(12, ok ? (i === cur ? '#5dffb0' : '#ffffff') : '#55516e', false)).setOrigin(0, 0.5);
      if (ok)
        chip.setInteractive({ useHandCursor: true }).on('pointerup', () => {
          const sv = loadSave();
          sv.skins = { ...(sv.skins ?? {}), [id]: i };
          writeSave(sv);
          Audio.play('sfx-click', 0.4);
          this.draw();
        });
    });
    const lines = AFF_LINES[id];
    const top = y0 + 106;
    const rowH = Math.min(86, (CONTENT_BOTTOM - top - 6) / AFF_MAX);
    for (let i = 0; i < AFF_MAX; i++) {
      const y = top + i * rowH + rowH / 2;
      const got = i < lv;
      this.add.rectangle(W / 2, y, 510, rowH - 8, got ? 0x0c1f18 : COLORS.panel, 0.95).setStrokeStyle(1, got ? 0x2bd98a : 0x2e2650);
      this.add.circle(58, y, 20, got ? 0x2bd98a : 0x110d1f).setStrokeStyle(2, got ? 0xffffff : 0x3a3452);
      this.add.text(58, y, String(i + 1), textStyle(16, got ? '#07060d' : '#6a6688')).setOrigin(0.5);
      this.add.text(92, y - rowH / 2 + 12, `Lv${i + 1}　${AFF_PERKS[i]}`, textStyle(14, got ? '#ffffff' : '#6a6688')).setOrigin(0, 0);
      this.add
        .text(92, y - rowH / 2 + 34, got ? `「${lines[i]}」` : `好感度 Lv${i + 1} 解鎖台詞`, {
          ...textStyle(12, got ? '#c9e8dc' : '#55516e', false),
          wordWrap: { width: 400, useAdvancedWrap: true },
          lineSpacing: 2,
        })
        .setOrigin(0, 0);
    }
  }

  private drawTalents(id: CharId, y0: number) {
    const s = loadSave();
    const owned = ownsChar(s, id);
    const lv = talentLevel(s, id);
    this.add
      .text(W / 2, y0, owned ? `碎片 ${s.shards[id] ?? 0}　萬能碎片 ${s.wildShards}　信用點 ${s.credits}` : '尚未擁有這個角色', textStyle(13, owned ? '#ffd84d' : '#ff8a5d', false))
      .setOrigin(0.5);
    const rowH = Math.min(84, (CONTENT_BOTTOM - y0 - 30) / CHAR_TALENTS.length);
    const g = this.add.graphics();
    CHAR_TALENTS.forEach((t, i) => {
      const y = y0 + 30 + i * rowH + rowH / 2;
      const done = i < lv;
      const next = i === lv;
      if (i > 0) {
        g.lineStyle(3, done ? COLORS.gold : 0x2a2440, 1).lineBetween(64, y - rowH + 22, 64, y - 22);
      }
      this.add.rectangle(W / 2, y, 510, rowH - 8, done ? 0x1f1a08 : COLORS.panel, 0.95).setStrokeStyle(next ? 2 : 1, done ? COLORS.gold : next ? COLORS.cyan : 0x2e2650);
      this.add.circle(64, y, 22, done ? COLORS.gold : 0x110d1f).setStrokeStyle(2, done ? 0xffffff : next ? COLORS.cyan : 0x3a3452);
      this.add.text(64, y, String(i + 1), textStyle(18, done ? '#07060d' : '#ffffff')).setOrigin(0.5);
      this.add.text(100, y - 22, t.name, textStyle(17, done || next ? '#ffffff' : '#6a6688')).setOrigin(0, 0);
      this.add.text(100, y + 4, t.desc, textStyle(13, done || next ? '#c9c6e0' : '#55516e', false)).setOrigin(0, 0);
      if (done) this.add.text(W - 50, y, '已習得', textStyle(15, '#ffd84d')).setOrigin(1, 0.5);
      else if (next && owned) {
        const b = makeButton(this, W - 92, y, 136, rowH - 26, `碎片${t.shards}・◆${t.credits}`, COLORS.gold, () => {
          const sv = loadSave();
          if (!learnTalent(sv, id)) return;
          writeSave(sv);
          Audio.play('sfx-levelup', 0.5);
          this.draw();
        }, 12);
        b.setEnabled(canLearnTalent(s, id));
      } else this.add.text(W - 50, y, `碎片 ${t.shards}`, textStyle(13, '#55516e', false)).setOrigin(1, 0.5);
    });
  }

  private drawDetail() {
    const s = loadSave();
    const m = s.modules.find((q) => q.uid === this.selected);
    const top = CONTENT_BOTTOM - 206;
    this.add.rectangle(W / 2, (top + CONTENT_BOTTOM) / 2, 510, CONTENT_BOTTOM - top, 0x0b0916, 0.96).setStrokeStyle(1, COLORS.magenta, 0.5);
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
    const by = CONTENT_BOTTOM - 34;
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
