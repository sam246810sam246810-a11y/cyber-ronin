import Phaser from 'phaser';
import { PASSIVES, WEAPONS } from '../config/balance';
import { T } from '../i18n/zh-TW';
import { COLORS, H, W, textStyle } from '../game/layout';
import { makeButton, setupLogicalCamera } from '../game/ui';
import { formatTime, loadSave } from '../game/storage';
import { Audio } from '../game/audio';
import { Choice, GameScene, RunResult } from './GameScene';
import { RARITY, RelicDef, RelicId, RELICS, ShopItem, TAGS, Tag } from '../config/expansion';
import { MOD_RARITY, MODULE_BASES } from '../config/meta';

const JOY_R = 56;

interface Banner {
  t: Phaser.GameObjects.Text;
  life: number;
  born: number;
}

export class UIScene extends Phaser.Scene {
  private g!: GameScene;
  private ready = false;

  // HUD
  private xpBar!: Phaser.GameObjects.Graphics;
  private lvText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Graphics;
  private invLayer!: Phaser.GameObjects.Container;
  private invVersion = -1;
  private comboText!: Phaser.GameObjects.Text;
  private synText!: Phaser.GameObjects.Text;
  private lastCombo = 0;
  private banners: Banner[] = [];

  // 搖桿
  private joyG!: Phaser.GameObjects.Graphics;
  private joyId: number | null = null;
  private joyBase = new Phaser.Math.Vector2();
  private joyKnob = new Phaser.Math.Vector2();

  // 視窗
  private modalLayer!: Phaser.GameObjects.Container;
  private modalOpen = false;
  private cardKeys: (() => void)[] = [];

  // 居合・一閃
  private iaiLayer!: Phaser.GameObjects.Container;

  constructor() {
    super('UI');
  }

  create() {
    this.ready = false;
    this.banners = [];
    this.invVersion = -1;
    this.joyId = null;
    this.modalOpen = false;
    this.cardKeys = [];
    setupLogicalCamera(this);
    this.g = this.scene.get('Game') as GameScene;

    this.hud = this.add.graphics();
    this.xpBar = this.add.graphics();
    this.lvText = this.add.text(14, 22, '', textStyle(20)).setOrigin(0, 0);
    this.killText = this.add.text(14, 48, '', textStyle(15, COLORS.dim)).setOrigin(0, 0);
    this.timeText = this.add.text(W / 2, 20, '00:00', textStyle(32)).setOrigin(0.5, 0);
    this.timeText.setStroke('#07060d', 5);
    this.add.text(W / 2 - 122, 72, T.intent, textStyle(14, '#ff7ab0')).setOrigin(1, 0.5);
    this.bossText = this.add.text(W / 2, 172, '', textStyle(15, '#ff6b80')).setOrigin(0.5, 1).setVisible(false);
    this.comboText = this.add.text(W - 16, 196, '', textStyle(22, '#ffd84d')).setOrigin(1, 0.5).setVisible(false);
    this.comboText.setStroke('#6a0020', 5);
    this.synText = this.add.text(W - 16, 128, '', textStyle(13, '#c9c6e0')).setOrigin(1, 0);
    this.synText.setStroke('#07060d', 3);
    this.invLayer = this.add.container(0, 0);

    makeButton(this, W - 38, 46, 52, 52, 'II', COLORS.cyan, () => this.g.pauseByUser(), 22);

    this.joyG = this.add.graphics().setDepth(50);
    this.iaiLayer = this.add.container(0, 0).setDepth(80);
    this.modalLayer = this.add.container(0, 0).setDepth(100);

    for (let i = 0; i < 3; i++) {
      const t = this.add.text(W / 2, H * 0.27 + i * 40, '', textStyle(24)).setOrigin(0.5).setDepth(60).setVisible(false);
      t.setStroke('#07060d', 6);
      this.banners.push({ t, life: 0, born: 0 });
    }

    this.setupInput();
    if (location.hash === '#debug') this.setupDebug();
    this.ready = true;
  }

  // ---------- 輸入 ----------
  private setupInput() {
    const cam = this.cameras.main;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.modalOpen || over.length > 0 || this.joyId !== null) return;
      const w = cam.getWorldPoint(p.x, p.y);
      this.joyId = p.id;
      this.joyBase.set(w.x, w.y);
      this.joyKnob.set(w.x, w.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyId) return;
      const w = cam.getWorldPoint(p.x, p.y);
      let dx = w.x - this.joyBase.x;
      let dy = w.y - this.joyBase.y;
      let d = Math.hypot(dx, dy);
      if (d > JOY_R) {
        // 手指拉太遠時，底座跟著移動
        this.joyBase.x += (dx / d) * (d - JOY_R);
        this.joyBase.y += (dy / d) * (d - JOY_R);
        dx = w.x - this.joyBase.x;
        dy = w.y - this.joyBase.y;
        d = JOY_R;
      }
      this.joyKnob.set(w.x, w.y);
      const mag = d < 6 ? 0 : Math.min(1, d / (JOY_R * 0.7));
      this.g.joy.x = d > 0 ? (dx / d) * mag : 0;
      this.g.joy.y = d > 0 ? (dy / d) * mag : 0;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyId) return;
      this.resetJoy();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown-ESC', () => {
        if (!this.modalOpen) this.g.pauseByUser();
      });
      kb.on('keydown-P', () => {
        if (!this.modalOpen) this.g.pauseByUser();
      });
      ['ONE', 'TWO', 'THREE'].forEach((k, i) => kb.on(`keydown-${k}`, () => this.cardKeys[i]?.()));
    }
  }

  private resetJoy() {
    this.joyId = null;
    if (this.g?.joy) {
      this.g.joy.x = 0;
      this.g.joy.y = 0;
    }
  }

  // ---------- 每幀 HUD ----------
  update(_t: number, deltaMs: number) {
    if (!this.ready) return;
    const g = this.g;
    const dt = deltaMs / 1000;

    // 經驗條
    this.xpBar.clear();
    this.xpBar.fillStyle(0x1a1430, 1);
    this.xpBar.fillRect(10, 8, W - 20, 10);
    this.xpBar.fillStyle(COLORS.cyan, 1);
    this.xpBar.fillRect(10, 8, (W - 20) * Math.min(1, g.xp / g.xpNext), 10);

    this.lvText.setText(T.level(g.level));
    this.killText.setText(T.kills(g.kills));
    this.timeText.setText(formatTime(g.t));
    this.timeText.setColor(g.t >= 600 ? '#ff6b80' : COLORS.text);

    // 殺意條
    const h = this.hud;
    h.clear();
    const ratio = Math.min(1, g.intent / g.intentThreshold());
    const bx = W / 2 - 110;
    h.fillStyle(0x1a1430, 1);
    h.fillRect(bx, 66, 220, 12);
    const pulse = ratio > 0.85 ? 0.6 + 0.4 * Math.sin(this.time.now / 60) : 1;
    h.fillStyle(0xff3d81, pulse);
    h.fillRect(bx, 66, 220 * ratio, 12);
    h.lineStyle(1, 0xff3d81, 0.6);
    h.strokeRect(bx, 66, 220, 12);

    // Boss 血條
    const boss = g.bosses.find((b) => b.active);
    if (boss) {
      this.bossText.setVisible(true).setText(boss.title);
      h.fillStyle(0x2a0710, 1);
      h.fillRect(W / 2 - 200, 176, 400, 12);
      h.fillStyle(0xff2244, 1);
      h.fillRect(W / 2 - 200, 176, 400 * Math.max(0, boss.hp / boss.maxHp), 12);
      h.lineStyle(1, 0xff6b80, 1);
      h.strokeRect(W / 2 - 200, 176, 400, 12);
    } else this.bossText.setVisible(false);

    // 畫面外的 Boss／精英提示箭頭
    const vx = g.px - W / 2;
    const vy = g.py - H / 2;
    for (const e of g.activeEnemies) {
      if (!e.active || (e.def.kind !== 'boss' && e.def.kind !== 'elite')) continue;
      const sx = e.x - vx;
      const sy = e.y - vy;
      if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) continue;
      const cx = Phaser.Math.Clamp(sx, 26, W - 26);
      const cy = Phaser.Math.Clamp(sy, 170, H - 26);
      const a = Math.atan2(sy - H / 2, sx - W / 2);
      const col = e.def.kind === 'boss' ? 0xff2244 : 0xffc83d;
      h.fillStyle(col, 0.9);
      h.fillTriangle(
        cx + Math.cos(a) * 14,
        cy + Math.sin(a) * 14,
        cx + Math.cos(a + 2.5) * 10,
        cy + Math.sin(a + 2.5) * 10,
        cx + Math.cos(a - 2.5) * 10,
        cy + Math.sin(a - 2.5) * 10,
      );
    }

    // 事件物件（黑市、祭壇、終端、空投）提示箭頭
    for (const it of g.interactables) {
      const sx = it.x - vx;
      const sy = it.y - vy;
      if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) continue;
      const cx = Phaser.Math.Clamp(sx, 26, W - 26);
      const cy = Phaser.Math.Clamp(sy, 200, H - 26);
      const a = Math.atan2(sy - H / 2, sx - W / 2);
      h.fillStyle(it.kind === 'merchant' ? 0xffd84d : 0x7fd4ff, 0.95);
      h.fillCircle(cx, cy, 7);
      h.fillTriangle(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, cx + Math.cos(a + 2.4) * 9, cy + Math.sin(a + 2.4) * 9, cx + Math.cos(a - 2.4) * 9, cy + Math.sin(a - 2.4) * 9);
    }
    // 駭入終端的進度圈
    for (const it of g.interactables) {
      if (it.kind !== 'terminal' || it.progress <= 0) continue;
      const sx = it.x - vx;
      const sy = it.y - vy - 50;
      h.lineStyle(5, 0x3df5ff, 0.9);
      h.beginPath();
      h.arc(sx, sy, 16, -Math.PI / 2, -Math.PI / 2 + (it.progress / 3) * Math.PI * 2, false);
      h.strokePath();
    }

    // COMBO
    if (g.combo >= 10) {
      if (g.combo !== this.lastCombo) {
        this.comboText.setScale(1.35);
        this.lastCombo = g.combo;
      }
      this.comboText.setVisible(true).setText(`COMBO ×${g.combo}`).setScale(Math.max(1, this.comboText.scaleX - dt * 3));
    } else this.comboText.setVisible(false);

    // 受傷時畫面邊緣泛紅
    if (g.hurtFlash > 0 || g.hp / g.maxHp < 0.25) {
      const a = g.hurtFlash > 0 ? 0.35 : 0.12 + 0.08 * Math.sin(this.time.now / 150);
      h.lineStyle(18, 0xff2244, a);
      h.strokeRect(0, 0, W, H);
    }

    if (g.inventoryVersion !== this.invVersion) this.drawInventory();

    // 橫幅
    for (const b of this.banners) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.t.setAlpha(Math.min(1, b.life * 2.5));
      if (b.life <= 0) b.t.setVisible(false);
    }

    // 搖桿
    this.joyG.clear();
    if (this.joyId !== null && !this.modalOpen) {
      this.joyG.lineStyle(2, COLORS.cyan, 0.5);
      this.joyG.fillStyle(COLORS.cyan, 0.08);
      this.joyG.fillCircle(this.joyBase.x, this.joyBase.y, JOY_R);
      this.joyG.strokeCircle(this.joyBase.x, this.joyBase.y, JOY_R);
      const dx = this.joyKnob.x - this.joyBase.x;
      const dy = this.joyKnob.y - this.joyBase.y;
      const d = Math.hypot(dx, dy);
      const k = d > JOY_R ? JOY_R / d : 1;
      this.joyG.fillStyle(COLORS.cyan, 0.55);
      this.joyG.fillCircle(this.joyBase.x + dx * k, this.joyBase.y + dy * k, 24);
    }
  }

  private drawInventory() {
    this.invVersion = this.g.inventoryVersion;
    this.invLayer.removeAll(true);
    let x = 14;
    const y = 96;
    const add = (key: string, lv: number, max: boolean) => {
      const img = this.add.image(x + 15, y + 15, key).setDisplaySize(30, 30);
      const t = this.add.text(x + 29, y + 30, max ? 'MAX' : String(lv), textStyle(11, max ? '#ffc83d' : '#ffffff')).setOrigin(1, 1);
      t.setStroke('#07060d', 3);
      this.invLayer.add([img, t]);
      x += 34;
    };
    for (const w of this.g.weapons) add(`icon-${w.id}`, w.level, WEAPONS[w.id].evolved || w.level >= this.g.maxLevel(w.id));
    x += 10;
    for (const [id, lv] of this.g.passives) add(`icon-${id}`, lv, lv >= PASSIVES[id].maxLevel);
    // 遺物
    this.g.relics.forEach((id, i) => {
      const def = RELICS.find((r) => r.id === id)!;
      const key = this.textures.exists(`relic-${id}`) ? `relic-${id}` : 'icon-might';
      const img = this.add.image(14 + 12 + i * 27, 142, key).setDisplaySize(24, 24);
      if (def.curse) {
        const ring = this.add.rectangle(14 + 12 + i * 27, 142, 26, 26).setStrokeStyle(1, 0xff2244, 1);
        this.invLayer.add(ring);
      }
      this.invLayer.add(img);
    });
    // 羈絆
    const parts: string[] = [];
    (Object.keys(TAGS) as Tag[]).forEach((tg) => {
      const n = this.g.tagCounts[tg];
      if (n >= 2) parts.push(`${TAGS[tg].name}${n}`);
    });
    this.synText.setText(parts.length ? `羈絆 ${parts.join(' ')}` : '');
  }

  banner(text: string, color = '#ffffff', duration = 1.8) {
    if (!this.ready) return;
    let slot = this.banners.find((b) => b.life <= 0);
    if (!slot) slot = this.banners.reduce((a, b) => (a.born < b.born ? a : b));
    slot.life = duration;
    slot.born = this.time.now;
    slot.t.setText(text).setColor(color).setVisible(true).setAlpha(1);
  }

  // ---------- 居合・一閃 ----------
  playIai() {
    if (!this.ready) return;
    const layer = this.iaiLayer;
    layer.removeAll(true);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55);
    const lines = this.add.graphics();
    lines.setBlendMode(Phaser.BlendModes.ADD);
    const text = this.add.text(W / 2, H * 0.42, T.iai, textStyle(46, '#ffffff')).setOrigin(0.5).setAlpha(0);
    text.setStroke('#ff3d81', 8);
    layer.add([dim, lines, text]);

    this.tweens.add({ targets: text, alpha: 1, scale: { from: 1.6, to: 1 }, duration: 180, ease: 'Cubic.Out' });
    // 0.4 秒後一刀斬下
    this.time.delayedCall(380, () => {
      const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.9);
      layer.add(flash);
      lines.clear();
      const cuts = [
        [-40, H * 0.2, W + 40, H * 0.75],
        [W + 40, H * 0.1, -40, H * 0.55],
        [-40, H * 0.6, W + 40, H * 0.35],
      ];
      for (const [x1, y1, x2, y2] of cuts) {
        lines.lineStyle(14, 0xff3d81, 0.6);
        lines.lineBetween(x1, y1, x2, y2);
        lines.lineStyle(4, 0xffffff, 1);
        lines.lineBetween(x1, y1, x2, y2);
      }
      this.tweens.add({ targets: flash, alpha: 0, duration: 260 });
      this.tweens.add({
        targets: [dim, lines, text],
        alpha: 0,
        duration: 520,
        delay: 160,
        onComplete: () => layer.removeAll(true),
      });
    });
  }

  // ---------- 視窗共用 ----------
  private openModal(dimAlpha = 0.78) {
    this.closeModalUI();
    this.modalOpen = true;
    this.resetJoy();
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05040a, dimAlpha).setInteractive();
    this.modalLayer.add(dim);
  }

  private closeModalUI() {
    this.modalLayer.removeAll(true);
    this.cardKeys = [];
    this.modalOpen = false;
  }

  private title(y: number, text: string, color = '#ffffff', size = 34) {
    const t = this.add.text(W / 2, y, text, textStyle(size, color)).setOrigin(0.5);
    t.setStroke('#07060d', 6);
    this.modalLayer.add(t);
    return t;
  }

  // ---------- 升級 ----------
  showLevelUp(level: number, choices: Choice[], onDone?: () => void) {
    if (!this.ready) return;
    this.openModal(0.8);
    const g = this.g;
    let shown = choices.slice();
    let mode: 'pick' | 'banish' | 'lock' = 'pick';
    const openedAt = this.time.now;
    const top = Math.max(150, H * 0.2);

    this.title(top, T.levelUp(level), '#3df5ff', 36);
    const hint = this.add.text(W / 2, top + 40, T.pickOne, textStyle(16, COLORS.dim)).setOrigin(0.5);
    this.modalLayer.add(hint);

    const cardLayer = this.add.container(0, 0);
    this.modalLayer.add(cardLayer);
    const cardH = 132;
    const gap = 16;
    const startY = top + 80;

    const finish = (c: Choice) => {
      g.applyChoice(c);
      this.closeModalUI();
      if (onDone) onDone();
      else g.levelChoiceDone();
    };

    const onCard = (i: number) => {
      if (this.time.now - openedAt < 400) return; // 避免剛彈出時誤觸
      const c = shown[i];
      if (mode === 'pick') finish(c);
      else if (mode === 'banish') {
        if (c.kind === 'heal' || c.kind === 'credits') return;
        const rep = g.banishChoice(c, shown);
        if (rep) shown[i] = rep;
        else shown.splice(i, 1);
        if (shown.length === 0) shown = g.rollChoices();
        setMode('pick');
      } else if (mode === 'lock') {
        g.lockChoice(c);
        setMode('pick');
      }
    };

    const renderCards = () => {
      cardLayer.removeAll(true);
      this.cardKeys = [];
      shown.forEach((c, i) => {
        const info = g.choiceInfo(c);
        const y = startY + i * (cardH + gap) + cardH / 2;
        const card = this.add.container(W / 2, y);
        const isLocked = g.locked && g.locked === c;
        const rar = RARITY[info.rarity];
        const frameCol = info.rarity > 0 ? rar.color : info.color;
        const aura = this.add.rectangle(0, 0, 492, cardH + 12, rar.color, info.rarity >= 2 ? 0.25 : 0);
        if (info.rarity >= 2) this.tweens.add({ targets: aura, alpha: 0.05, yoyo: true, repeat: -1, duration: info.rarity === 3 ? 380 : 700 });
        const bg = this.add.rectangle(0, 0, 480, cardH, COLORS.panel, 0.98).setStrokeStyle(info.rarity > 0 ? 3 : 2, frameCol, 1);
        const glow = this.add.rectangle(-240 + 3, 0, 6, cardH - 8, info.color, 1);
        const rlabel = this.add
          .text(240 - 16, cardH / 2 - 12, info.synergy ? `${info.synergy}　${rar.name}` : rar.name, textStyle(13, rar.css))
          .setOrigin(1, 1);
        const icon = this.add.image(-240 + 54, 0, info.icon).setDisplaySize(64, 64);
        const name = this.add.text(-240 + 100, -cardH / 2 + 20, info.name, textStyle(24)).setOrigin(0, 0);
        const tag = this.add
          .text(240 - 16, -cardH / 2 + 22, isLocked ? T.locked : info.tag, textStyle(16, info.isNew ? '#ffc83d' : '#8fe9ff'))
          .setOrigin(1, 0);
        const desc = this.add
          .text(-240 + 100, -cardH / 2 + 60, info.desc, { ...textStyle(17, '#c9c6e0', false), wordWrap: { width: 360, useAdvancedWrap: true } })
          .setOrigin(0, 0);
        const num = this.add.text(-240 + 54, cardH / 2 - 14, String(i + 1), textStyle(12, COLORS.dim)).setOrigin(0.5);
        const evo = this.add.text(-240 + 100, cardH / 2 - 12, info.evoHint, textStyle(13, '#ff7ad9', false)).setOrigin(0, 1);
        card.add([aura, bg, glow, icon, name, tag, desc, num, evo, rlabel]);
        card.setSize(480, cardH);
        card.setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => card.setScale(0.98));
        card.on('pointerout', () => card.setScale(1));
        card.on('pointerup', () => {
          card.setScale(1);
          onCard(i);
        });
        card.setAlpha(0);
        this.tweens.add({ targets: card, alpha: 1, x: { from: W / 2 + 30, to: W / 2 }, duration: 200, delay: i * 50 });
        cardLayer.add(card);
        this.cardKeys[i] = () => onCard(i);
      });
    };

    const btnY = startY + 3 * (cardH + gap) + 30;
    const reroll = makeButton(this, W / 2 - 165, btnY, 150, 56, '', COLORS.cyan, () => {
      if (this.time.now - openedAt < 400) return;
      const r = g.rerollChoices();
      if (r) shown = r;
      setMode('pick');
    }, 18);
    const banish = makeButton(this, W / 2, btnY, 150, 56, '', COLORS.magenta, () => setMode(mode === 'banish' ? 'pick' : 'banish'), 18);
    const lock = makeButton(this, W / 2 + 165, btnY, 150, 56, '', COLORS.gold, () => setMode(mode === 'lock' ? 'pick' : 'lock'), 18);
    this.modalLayer.add([reroll, banish, lock]);

    const setMode = (m: typeof mode) => {
      mode = m;
      reroll.setLabel(T.reroll(g.rerolls)).setEnabled(g.rerolls > 0);
      banish.setLabel(T.banish(g.banishes)).setEnabled(g.banishes > 0).setActive2(mode === 'banish');
      lock.setLabel(T.lock(g.locks)).setEnabled(g.locks > 0).setActive2(mode === 'lock');
      hint.setText(mode === 'banish' ? T.banishHint : mode === 'lock' ? T.lockHint : T.pickOne);
      hint.setColor(mode === 'banish' ? '#ff7ab0' : mode === 'lock' ? '#ffc83d' : COLORS.dim);
      renderCards();
    };
    setMode('pick');
    const best = Math.max(...shown.map((c) => c.rarity ?? 0));
    if (best >= 3) {
      const pillar = this.add.rectangle(W / 2, H / 2, W, H, 0xffc83d, 0.35);
      this.modalLayer.add(pillar);
      this.modalLayer.sendToBack(pillar);
      this.tweens.add({ targets: pillar, alpha: 0, duration: 700 });
      this.banner('傳說卡出現！', '#ffd84d', 1.4);
    }
  }

  // ---------- 遺物三選一 ----------
  showRelics(options: RelicDef[], cb: (id: RelicId | null) => void) {
    if (!this.ready) return;
    this.openModal(0.84);
    const openedAt = this.time.now;
    const top = Math.max(150, H * 0.2);
    this.title(top, '選擇遺物', '#ffd84d', 36);
    this.modalLayer.add(this.add.text(W / 2, top + 40, `一整局都有效（最多 6 個）`, textStyle(16, COLORS.dim)).setOrigin(0.5));
    const cardH = 132;
    options.forEach((r, i) => {
      const y = top + 80 + i * (cardH + 16) + cardH / 2;
      const card = this.add.container(W / 2, y);
      const col = r.curse ? 0xff2244 : 0xffc83d;
      const bg = this.add.rectangle(0, 0, 480, cardH, r.curse ? 0x1d0810 : COLORS.panel, 0.98).setStrokeStyle(3, col, 1);
      const key = this.textures.exists(`relic-${r.id}`) ? `relic-${r.id}` : 'icon-might';
      const icon = this.add.image(-240 + 56, 0, key).setDisplaySize(76, 76);
      const name = this.add.text(-240 + 108, -cardH / 2 + 20, r.name, textStyle(24, r.curse ? '#ff6b80' : '#ffffff')).setOrigin(0, 0);
      const tag = this.add.text(240 - 16, -cardH / 2 + 22, r.curse ? '詛咒' : '遺物', textStyle(16, r.curse ? '#ff4d6a' : '#ffd84d')).setOrigin(1, 0);
      const desc = this.add
        .text(-240 + 108, -cardH / 2 + 60, r.desc, { ...textStyle(17, '#c9c6e0', false), wordWrap: { width: 350, useAdvancedWrap: true } })
        .setOrigin(0, 0);
      card.add([bg, icon, name, tag, desc]);
      card.setSize(480, cardH).setInteractive({ useHandCursor: true });
      const pick = () => {
        if (this.time.now - openedAt < 400) return;
        this.closeModalUI();
        cb(r.id);
      };
      card.on('pointerup', pick);
      card.setAlpha(0);
      this.tweens.add({ targets: card, alpha: 1, y: { from: y + 20, to: y }, duration: 220, delay: i * 70 });
      this.modalLayer.add(card);
      this.cardKeys[i] = pick;
    });
    const skip = makeButton(this, W / 2, top + 80 + 3 * (cardH + 16) + 30, 280, 54, '略過（信用點 +20）', 0x888899, () => {
      this.closeModalUI();
      cb(null);
    }, 17);
    this.modalLayer.add(skip);
  }

  // ---------- 黑市商人 ----------
  showShop(items: ShopItem[], credits: () => number, buy: (id: ShopItem['id']) => boolean | 'close', close: () => void) {
    if (!this.ready) return;
    this.openModal(0.86);
    const top = Math.max(140, H * 0.18);
    this.title(top, '黑市', '#ffd84d', 38);
    const money = this.add.text(W / 2, top + 42, '', textStyle(18, '#ffd84d')).setOrigin(0.5);
    this.modalLayer.add(money);
    const icon = this.textures.exists('prop-merchant') ? this.add.image(W / 2, top + 110, 'prop-merchant').setDisplaySize(96, 96) : null;
    if (icon) this.modalLayer.add(icon);
    const btns: { btn: ReturnType<typeof makeButton>; item: ShopItem }[] = [];
    const refresh = () => {
      money.setText(`局內信用點 ◆ ${credits()}`);
      for (const b of btns) b.btn.setEnabled(credits() >= b.item.cost);
    };
    items.forEach((it, i) => {
      const y = top + 190 + i * 92;
      this.modalLayer.add(this.add.rectangle(W / 2, y, 480, 80, COLORS.panel, 0.98).setStrokeStyle(1, 0x5a4a20));
      this.modalLayer.add(this.add.text(W / 2 - 224, y - 24, it.name, textStyle(20)).setOrigin(0, 0));
      this.modalLayer.add(this.add.text(W / 2 - 224, y + 6, it.desc, textStyle(15, '#a9a5c8', false)).setOrigin(0, 0));
      const btn = makeButton(this, W / 2 + 170, y, 120, 54, `◆ ${it.cost}`, COLORS.gold, () => {
        const res = buy(it.id);
        if (res === 'close') return;
        if (res) Audio.play('sfx-chest', 0.4);
        refresh();
      }, 18);
      this.modalLayer.add(btn);
      btns.push({ btn, item: it });
    });
    const leave = makeButton(this, W / 2, top + 190 + items.length * 92 + 20, 240, 56, '離開', COLORS.cyan, () => {
      this.closeModalUI();
      close();
    }, 20);
    this.modalLayer.add(leave);
    refresh();
  }

  // ---------- 確認視窗 ----------
  showConfirm(title: string, desc: string, yes: string, no: string, cb: (ok: boolean) => void) {
    if (!this.ready) return;
    this.openModal(0.84);
    const top = H * 0.3;
    this.title(top, title, '#ff6b80', 34);
    this.modalLayer.add(
      this.add.text(W / 2, top + 50, desc, { ...textStyle(18, '#c9c6e0', false), align: 'center', wordWrap: { width: 420 } }).setOrigin(0.5, 0),
    );
    const a = makeButton(this, W / 2, top + 170, 280, 64, yes, COLORS.magenta, () => {
      this.closeModalUI();
      cb(true);
    }, 24);
    const b = makeButton(this, W / 2, top + 250, 280, 54, no, COLORS.cyan, () => {
      this.closeModalUI();
      cb(false);
    }, 20);
    this.modalLayer.add([a, b]);
  }

  // ---------- 暫停 ----------
  showPause() {
    if (!this.ready) return;
    this.openModal(0.82);
    const g = this.g;
    const top = Math.max(160, H * 0.22);
    this.title(top, T.paused, '#3df5ff', 40);

    // 目前的武器與道具
    const lines: string[] = [];
    for (const w of g.weapons) lines.push(`${WEAPONS[w.id].name}  Lv ${w.level}`);
    for (const [id, lv] of g.passives) lines.push(`${PASSIVES[id].name}  Lv ${lv}`);
    const info = this.add.text(W / 2, top + 50, lines.join('\n'), { ...textStyle(18, '#c9c6e0', false), align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0);
    this.modalLayer.add(info);

    const y = Math.max(top + 90 + lines.length * 32, H * 0.55);
    const resume = makeButton(this, W / 2, y, 300, 64, T.resume, COLORS.cyan, () => {
      this.closeModalUI();
      g.closeModal();
    }, 24);
    const restart = makeButton(this, W / 2, y + 84, 300, 60, T.restart, COLORS.violet, () => this.restartRun());
    const menu = makeButton(this, W / 2, y + 162, 300, 60, T.toMenu, COLORS.magenta, () => this.toMenu());
    this.modalLayer.add([resume, restart, menu]);
    this.cardKeys = [() => {
      this.closeModalUI();
      g.closeModal();
    }];
  }

  // ---------- 復活 ----------
  showRevive() {
    if (!this.ready) return;
    this.openModal(0.85);
    const top = H * 0.32;
    this.title(top, T.reviveTitle, '#ff6b80', 40);
    const d = this.add.text(W / 2, top + 56, T.reviveDesc, { ...textStyle(18, '#c9c6e0', false), align: 'center', wordWrap: { width: 420 } }).setOrigin(0.5, 0);
    this.modalLayer.add(d);
    const revive = makeButton(this, W / 2, top + 170, 300, 68, T.revive, COLORS.cyan, () => {
      this.closeModalUI();
      this.g.revive();
    }, 26);
    const give = makeButton(this, W / 2, top + 256, 300, 56, T.giveUp, COLORS.magenta, () => {
      this.closeModalUI();
      this.g.endRun(false);
    });
    this.modalLayer.add([revive, give]);
  }

  // ---------- 結算 ----------
  showResults(r: RunResult) {
    if (!this.ready) return;
    this.openModal(0.88);
    const top = Math.max(150, H * 0.2);
    this.title(top, r.victory ? T.victory : T.defeat, r.victory ? '#ffc83d' : '#ff6b80', 44);
    const sub = this.add.text(W / 2, top + 46, r.victory ? T.victorySub : T.defeatSub, textStyle(18, COLORS.dim, false)).setOrigin(0.5);
    this.modalLayer.add(sub);

    const rows: [string, string][] = [
      [T.statTime, formatTime(r.time)],
      [T.statKills, String(r.kills)],
      [T.statLevel, String(r.level)],
      [T.statCredits, `${r.credits} ＋ ${r.bonus}`],
    ];
    const panelY = top + 90;
    const panel = this.add.rectangle(W / 2, panelY + 100, 420, 200, COLORS.panel, 1).setStrokeStyle(1, 0x2e2650);
    this.modalLayer.add(panel);
    rows.forEach(([k, v], i) => {
      const y = panelY + 28 + i * 46;
      this.modalLayer.add(this.add.text(W / 2 - 180, y, k, textStyle(18, '#a9a5c8', false)).setOrigin(0, 0));
      this.modalLayer.add(this.add.text(W / 2 + 180, y - 2, v, textStyle(22)).setOrigin(1, 0));
    });
    if (r.newBest) {
      const nb = this.add.text(W / 2, panelY + 222, T.newBest, textStyle(20, '#ffc83d')).setOrigin(0.5);
      this.modalLayer.add(nb);
      this.tweens.add({ targets: nb, scale: 1.12, yoyo: true, repeat: -1, duration: 500 });
    }
    const save = loadSave();
    const best = this.add.text(W / 2, panelY + 252, T.best(formatTime(save.bestTime), save.bestKills), textStyle(14, COLORS.dim, false)).setOrigin(0.5);
    this.modalLayer.add(best);
    if (r.unlocked.length) {
      const u = this.add
        .text(W / 2, panelY + 282, T.newUnlocks(r.unlocked.join('、')), { ...textStyle(17, '#5dff7a'), align: 'center', wordWrap: { width: 440 } })
        .setOrigin(0.5, 0);
      this.modalLayer.add(u);
    }

    let extra = r.unlocked.length ? 40 : 0;
    // 戰利品：晶片與義體模組
    const loot = [`晶片 +${r.chips}`, ...r.modules.map((m) => `${MOD_RARITY[m.rarity].name} ${MODULE_BASES.find((b) => b.id === m.base)?.name ?? ''}`)];
    this.modalLayer.add(
      this.add.text(W / 2, panelY + 282 + extra, loot.join('　'), { ...textStyle(15, '#7fd4ff'), align: 'center', wordWrap: { width: 460 } }).setOrigin(0.5, 0),
    );
    extra += r.modules.length > 3 ? 56 : 32;
    if (r.wanted > 0 || r.wantedUnlocked) {
      const txt = (r.wanted > 0 ? `通緝等級 ${r.wanted}（獎勵 ×${(1 + 0.2 * r.wanted).toFixed(1)}）` : '') + (r.wantedUnlocked ? `　解鎖通緝等級 ${r.wantedUnlocked}！` : '');
      this.modalLayer.add(this.add.text(W / 2, panelY + 282 + extra, txt, textStyle(16, '#ff8a5d')).setOrigin(0.5, 0));
      extra += 34;
    }
    const by = panelY + 320 + extra;
    const again = makeButton(this, W / 2, by, 300, 66, T.playAgain, COLORS.cyan, () => this.restartRun(), 24);
    const menu = makeButton(this, W / 2, by + 86, 300, 58, T.toMenu, COLORS.magenta, () => this.toMenu());
    this.modalLayer.add([again, menu]);
    this.cardKeys = [() => this.restartRun()];
  }

  private restartRun() {
    this.closeModalUI();
    const char = this.g.char.id;
    const wanted = this.g.wanted;
    const daily = this.g.isDaily;
    this.scene.stop('Game');
    this.scene.start('Game', { char, wanted, daily });
  }

  private toMenu() {
    this.closeModalUI();
    this.scene.stop('Game');
    this.scene.start('Menu');
  }

  // ---------- 除錯面板（網址加上 #debug） ----------
  private setupDebug() {
    const y = H - 40;
    const items: [string, () => void][] = [
      ['無敵', () => (this.g.invincible = !this.g.invincible)],
      ['+60s', () => this.g.debugSkip(60)],
      ['升級', () => this.g.debugLevel()],
      ['寶箱', () => this.g.debugChest()],
      ['遺物', () => this.g.debugRelic()],
      ['武器滿級', () => this.g.debugMaxWeapons()],
    ];
    items.forEach(([label, fn], i) => {
      makeButton(this, 46 + i * 89, y, 84, 44, label, 0x888888, fn, 14).setAlpha(0.7);
    });
    this.add.text(10, H - 72, T.debug, textStyle(12, '#888888')).setOrigin(0, 0.5);
  }
}

