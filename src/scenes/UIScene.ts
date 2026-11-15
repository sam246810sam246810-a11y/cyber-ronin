import Phaser from 'phaser';
import { CharId, PASSIVES, WEAPONS } from '../config/balance';
import { SPEAKER_NAME, STORY, StoryLine } from '../config/story';
import { T } from '../i18n/zh-TW';
import { COLORS, H, W, textStyle } from '../game/layout';
import { makeButton, setupLogicalCamera } from '../game/ui';
import { formatTime, loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { Choice, GameScene, RunResult } from './GameScene';
import { RARITY, RelicDef, RelicId, RELICS, ShopItem, TAGS, Tag, ULTIMATES } from '../config/expansion';
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
  /** 自動戰鬥時，視窗打開後自動執行的動作 */
  private autoAction: (() => void) | null = null;
  private autoAt = 0;

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
    this.add.text(W / 2 - 122, 72, ULTIMATES[this.g.char.id]?.gauge ?? T.intent, textStyle(14, ULTIMATES[this.g.char.id]?.css ?? '#ff7ab0')).setOrigin(1, 0.5);
    this.bossText = this.add.text(W / 2, 172, '', textStyle(15, '#ff6b80')).setOrigin(0.5, 1).setVisible(false);
    this.comboText = this.add.text(W - 16, 196, '', textStyle(22, '#ffd84d')).setOrigin(1, 0.5).setVisible(false);
    this.comboText.setStroke('#6a0020', 5);
    this.synText = this.add.text(W - 16, 128, '', textStyle(13, '#c9c6e0')).setOrigin(1, 0);
    this.synText.setStroke('#07060d', 3);
    this.invLayer = this.add.container(0, 0);

    makeButton(this, W - 38, 46, 52, 52, 'II', COLORS.cyan, () => this.g.pauseByUser(), 22);
    // 遊戲速度與自動戰鬥
    const speedBtn = makeButton(this, W - 98, 46, 56, 52, `${this.g.gameSpeed}×`, COLORS.gold, () => {
      const r = this.g.cycleSpeed();
      speedBtn.setLabel(`${this.g.gameSpeed}×`);
      if (r === 'locked') this.banner('3× 是月卡特權（之後開放）', '#ffd84d', 1.6);
    }, 18);
    const autoBtn = makeButton(this, W - 162, 46, 64, 52, '自動', 0x5dff7a, () => {
      if (!this.g.autoUnlocked()) {
        this.banner('通關第一關後解鎖自動戰鬥', '#ffd84d', 1.6);
        return;
      }
      this.g.setAuto(!this.g.auto);
      autoBtn.setActive2(this.g.auto);
      this.banner(this.g.auto ? '自動戰鬥：開' : '自動戰鬥：關', '#5dff7a', 1);
    }, 16);
    autoBtn.setActive2(this.g.auto);

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
    // 第一次出擊：新手教學
    const sv = loadSave();
    if (!(sv.tips ?? []).includes('basics') && !this.g.isDaily) {
      this.g.modal = true;
      this.g.scene.pause();
      this.showTutorial();
    } else this.maybeIntro();
  }

  /** 關卡開頭劇情（每關第一次） */
  private maybeIntro() {
    const g = this.g;
    if (g.isDaily || g.mode !== 'normal') return;
    const key = `${g.stage.id}-intro`;
    const sv = loadSave();
    if ((sv.storySeen ?? []).includes(key)) return;
    sv.storySeen = [...(sv.storySeen ?? []), key];
    writeSave(sv);
    g.modal = true;
    g.scene.pause();
    this.showStory(STORY[g.stage.id].intro, () => g.closeModal());
  }

  /** 劇情對話：頭像＋打字效果，點一下下一句；可以略過 */
  showStory(lines: StoryLine[], onDone: () => void) {
    this.openModal(0.55);
    let idx = 0;
    let typing: Phaser.Time.TimerEvent | null = null;
    const boxY = H - 230;
    const box = this.add.rectangle(W / 2, boxY, 510, 170, 0x0b0916, 0.96).setStrokeStyle(2, COLORS.cyan, 0.8);
    const portrait = this.add.image(90, boxY - 150, 'avatar-jin').setVisible(false);
    const frame = this.add.circle(90, boxY - 150, 62).setStrokeStyle(3, COLORS.cyan, 0.9).setVisible(false);
    const name = this.add.text(36, boxY - 72, '', textStyle(18, '#3df5ff')).setOrigin(0, 0).setStroke('#07060d', 4);
    const text = this.add.text(36, boxY - 40, '', { ...textStyle(17, '#ffffff', false), wordWrap: { width: 470, useAdvancedWrap: true }, lineSpacing: 6 }).setOrigin(0, 0);
    const hint = this.add.text(W - 36, boxY + 70, '點一下繼續 ▼', textStyle(12, COLORS.dim, false)).setOrigin(1, 1);
    this.modalLayer.add([box, frame, portrait, name, text, hint]);
    const finish = () => {
      typing?.remove();
      this.closeModalUI();
      onDone();
    };
    const skip = makeButton(this, W - 70, 120, 100, 44, '略過', 0x888899, finish, 15);
    this.modalLayer.add(skip);
    let full = '';
    const show = () => {
      const l = lines[idx];
      const key = `avatar-${l.who}`;
      const hasFace = l.who !== 'sys' && this.textures.exists(key);
      portrait.setVisible(hasFace);
      frame.setVisible(hasFace);
      if (hasFace) {
        portrait.setTexture(key);
        portrait.setScale(120 / portrait.width);
        portrait.setAlpha(0);
        this.tweens.add({ targets: portrait, alpha: 1, x: { from: 70, to: 90 }, duration: 200 });
      }
      name.setText(SPEAKER_NAME[l.who]);
      full = l.text;
      text.setText('').setColor(l.who === 'sys' ? '#c9c6e0' : '#ffffff');
      let n = 0;
      typing?.remove();
      typing = this.time.addEvent({
        delay: 28,
        repeat: full.length - 1,
        callback: () => {
          n++;
          text.setText(full.slice(0, n));
        },
      });
    };
    const dim = this.modalLayer.list[0] as Phaser.GameObjects.Rectangle;
    dim.on('pointerup', () => {
      if (text.text.length < full.length) {
        // 還在打字：先顯示整句
        typing?.remove();
        text.setText(full);
        return;
      }
      idx++;
      if (idx >= lines.length) finish();
      else show();
    });
    show();
  }

  /** 新手教學：一張說明卡 */
  private showTutorial() {
    this.openModal(0.86);
    const top = Math.max(130, H * 0.16);
    this.title(top, '戰鬥說明', '#3df5ff', 32);
    const tips: [string, string, string][] = [
      ['ui-ic-battle', '移動', '在畫面任何地方按住拖曳就是搖桿，躲開敵人'],
      ['icon-katana', '自動攻擊', '武器會自己攻擊，你只要專心走位'],
      ['gem3', '升級', '撿經驗晶片升級，從三張卡裡選一張強化'],
      ['icon-intent', '大招', '擊殺累積能量，集滿會自動放出角色專屬大招'],
      ['ui-ic-upgrade', '加速與自動', '右上角可以切換 2 倍速；通關第一關後解鎖自動戰鬥'],
    ];
    tips.forEach(([icon, name, desc], i) => {
      const y = top + 80 + i * 96;
      this.modalLayer.add(this.add.rectangle(W / 2, y, 480, 84, COLORS.panel, 0.96).setStrokeStyle(1, 0x3a3168));
      if (this.textures.exists(icon)) {
        const img = this.add.image(W / 2 - 200, y, icon);
        img.setScale(52 / Math.max(img.width, img.height));
        this.modalLayer.add(img);
      }
      this.modalLayer.add(this.add.text(W / 2 - 160, y - 28, name, textStyle(19, '#ffffff')).setOrigin(0, 0));
      this.modalLayer.add(this.add.text(W / 2 - 160, y + 2, desc, { ...textStyle(14, '#c9c6e0', false), wordWrap: { width: 370 } }).setOrigin(0, 0));
    });
    const go = makeButton(this, W / 2, top + 80 + tips.length * 96 + 20, 280, 64, '開始戰鬥', COLORS.magenta, () => {
      const save = loadSave();
      save.tips = [...(save.tips ?? []), 'basics'];
      writeSave(save);
      this.closeModalUI();
      this.g.closeModal();
      this.maybeIntro();
    }, 24);
    this.modalLayer.add(go);
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
    if (g.auto && this.modalOpen && this.autoAction && this.time.now >= this.autoAt) {
      const act = this.autoAction;
      this.autoAction = null;
      act();
    }

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

  /** 大招：斜切橫幅特寫切入 → 招式名稱 → 各角色收尾特效 */
  playUltimate(charId: CharId) {
    if (!this.ready) return;
    const u = ULTIMATES[charId];
    const layer = this.iaiLayer;
    layer.removeAll(true);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0);
    this.tweens.add({ targets: dim, fillAlpha: 0.65, duration: 120 });
    layer.add(dim);

    // 斜切橫幅
    const band = this.add.container(-W * 1.3, H * 0.42).setRotation(-0.2);
    const bh = 230;
    const bg = this.add.graphics();
    bg.fillStyle(0x07060d, 0.95);
    bg.fillRect(-W * 1.2, -bh / 2, W * 2.4, bh);
    bg.fillStyle(u.color, 0.55);
    bg.fillRect(-W * 1.2, -bh / 2, W * 2.4, bh * 0.18);
    bg.fillRect(-W * 1.2, bh / 2 - bh * 0.18, W * 2.4, bh * 0.18);
    // SSR：金色外框
    bg.lineStyle(u.ssr ? 8 : 4, u.ssr ? 0xffd84d : 0xffffff, 0.95);
    bg.lineBetween(-W * 1.2, -bh / 2, W * 1.2, -bh / 2);
    bg.lineBetween(-W * 1.2, bh / 2, W * 1.2, bh / 2);
    if (u.ssr) {
      bg.lineStyle(2, 0xffffff, 0.9);
      bg.lineBetween(-W * 1.2, -bh / 2 + 9, W * 1.2, -bh / 2 + 9);
      bg.lineBetween(-W * 1.2, bh / 2 - 9, W * 1.2, bh / 2 - 9);
    }
    const speed = this.add.graphics();
    band.add([bg, speed]);
    // 速度線
    const lines = Array.from({ length: 26 }, () => ({ y: (Math.random() - 0.5) * bh * 0.9, x: Math.random() * W * 2 - W, len: 60 + Math.random() * 160, v: 1400 + Math.random() * 1600 }));
    const drawSpeed = (dt: number) => {
      speed.clear();
      speed.lineStyle(2, 0xffffff, 0.5);
      for (const l of lines) {
        l.x -= (l.v * dt) / 1000;
        if (l.x < -W * 1.2) l.x = W * 1.2;
        speed.lineBetween(l.x, l.y, l.x + l.len, l.y);
      }
    };
    // 角色特寫（有生成的高清立繪就用立繪）
    const key = this.textures.exists(`hd-${charId}`) ? `hd-${charId}` : this.textures.exists(`portrait-${charId}`) ? `portrait-${charId}` : `char-${charId}`;
    const face = this.add.image(W * 0.12, 30, key).setOrigin(0.5, 0.32);
    const fs = face.texture.getSourceImage();
    face.setScale((bh * 2.6) / fs.height);
    face.setCrop(0, 0, fs.width, fs.height * 0.55);
    band.add(face);
    const name = this.add.text(-W * 0.22, bh * 0.18, u.name, textStyle(49.5, '#ffffff')).setOrigin(0.5);
    name.setStroke(u.css, 10);
    name.setShadow(0, 0, u.css, 16, true, true);
    name.setScale(2.2).setAlpha(0);
    band.add(name);
    layer.add(band);

    const ticker = (_t: number, dt: number) => drawSpeed(dt);
    this.events.on('update', ticker);
    this.tweens.add({ targets: band, x: W / 2, duration: 160, ease: 'Cubic.Out' });
    this.tweens.add({ targets: face, x: W * 0.2, duration: 700, ease: 'Sine.Out' });
    this.tweens.add({ targets: name, scale: 1, alpha: 1, delay: 180, duration: 160, ease: 'Back.Out' });
    // 0.65 秒後橫幅飛出，接著收尾特效
    this.time.delayedCall(650, () => {
      this.tweens.add({ targets: band, x: W * 2.3, duration: 160, ease: 'Cubic.In' });
      const flash = this.add.rectangle(W / 2, H / 2, W, H, u.finisher === 'thunder' ? 0xbfd4ff : 0xffffff, 0.85);
      layer.add(flash);
      this.tweens.add({ targets: flash, alpha: 0, duration: 300 });
      if (u.finisher === 'slash') this.finisherSlash(layer);
      else if (u.finisher === 'code') this.finisherCode(layer);
      else if (u.finisher === 'thunder') this.finisherThunder(layer);
      else if (u.finisher === 'clone') this.ultAnim(layer, 'ultoboro', 12);
      else if (u.finisher === 'orbital') this.ultAnim(layer, 'ulthayabusa');
      else if (u.finisher === 'concert') this.finisherConcert(layer);
      else this.finisherHyakki(layer);
      this.tweens.add({
        targets: dim,
        fillAlpha: 0,
        duration: 400,
        delay: u.finisher === 'hyakki' || u.finisher === 'concert' ? 1700 : u.finisher === 'clone' ? 1200 : 700,
        onComplete: () => {
          this.events.off('update', ticker);
          layer.removeAll(true);
        },
      });
    });
  }

  /** 播放生成的全螢幕大招特效（影片切成的序列幀，黑底用發光疊加去掉） */
  private ultAnim(layer: Phaser.GameObjects.Container, name: string, frameRate = 18) {
    const key = `fx-${name}`;
    if (!this.anims.exists(key)) return null;
    const spr = this.add.sprite(W / 2, H / 2, `${key}-0`).setBlendMode(Phaser.BlendModes.ADD);
    const src = spr.texture.getSourceImage();
    const base = Math.max(W / src.width, H / src.height);
    spr.setScale(base * 1.25).setAlpha(0.2);
    layer.add(spr);
    this.tweens.add({ targets: spr, scale: base, alpha: 1, duration: 120, ease: 'Cubic.Out' });
    spr.play({ key, frameRate });
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.destroy());
    return spr;
  }

  /** SSR 星光演唱會：全息舞台升起 → 彩虹光束爆發 */
  private finisherConcert(layer: Phaser.GameObjects.Container) {
    this.ultAnim(layer, 'ultmisora1', 20);
    this.time.delayedCall(850, () => {
      const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xf0e0ff, 0.8);
      layer.add(flash);
      this.tweens.add({ targets: flash, alpha: 0, duration: 260 });
      this.ultAnim(layer, 'ultmisora2', 18);
    });
    for (let i = 0; i < 26; i++) {
      const p = this.add.circle(Math.random() * W, H + 20, 2 + Math.random() * 3, [0xb46bff, 0x3df5ff, 0xff8ac8, 0x5dff7a][i % 4], 0.9).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(p);
      this.tweens.add({ targets: p, y: -20, x: p.x + (Math.random() - 0.5) * 120, alpha: 0, duration: 1200 + Math.random() * 600, delay: Math.random() * 400 });
    }
  }

  /** SSR 百鬼夜行：鳥居與百鬼橫掃 → 狐火大爆發 */
  private finisherHyakki(layer: Phaser.GameObjects.Container) {
    this.ultAnim(layer, 'ultkagura1', 20);
    this.time.delayedCall(850, () => {
      const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffe0f0, 0.8);
      layer.add(flash);
      this.tweens.add({ targets: flash, alpha: 0, duration: 260 });
      this.ultAnim(layer, 'ultkagura2', 18);
    });
    // 金色光點
    for (let i = 0; i < 26; i++) {
      const p = this.add.circle(Math.random() * W, H + 20, 2 + Math.random() * 3, Math.random() < 0.5 ? 0xffd84d : 0xff8ac8, 0.9).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(p);
      this.tweens.add({ targets: p, y: -20, x: p.x + (Math.random() - 0.5) * 120, alpha: 0, duration: 1200 + Math.random() * 600, delay: Math.random() * 400 });
    }
  }

  private finisherSlash(layer: Phaser.GameObjects.Container) {
    this.ultAnim(layer, 'ultjin');
  }

  private finisherCode(layer: Phaser.GameObjects.Container) {
    const spr = this.ultAnim(layer, 'ultzero');
    // 故障抖動
    if (spr) {
      let n = 0;
      this.time.addEvent({
        delay: 50,
        repeat: 6,
        callback: () => {
          n++;
          spr.x = n >= 7 ? W / 2 : W / 2 + (n % 2 ? 1 : -1) * (5 + Math.random() * 8);
        },
      });
    }
    for (let i = 0; i < 6; i++) {
      const r = this.add.rectangle(W / 2 + (Math.random() - 0.5) * 60, Math.random() * H, W, 6 + Math.random() * 22, Math.random() < 0.6 ? 0x5dff7a : 0xff3d81, 0.25).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(r);
      this.tweens.add({ targets: r, alpha: 0, x: r.x + (Math.random() - 0.5) * 140, delay: 80 + i * 60, duration: 180 });
    }
  }

  private finisherThunder(layer: Phaser.GameObjects.Container) {
    const spr = this.ultAnim(layer, 'ulttetsu');
    if (spr) {
      // 落雷砸下的瞬間往下震
      spr.y = H / 2 - 60;
      this.tweens.add({ targets: spr, y: H / 2, duration: 90, ease: 'Cubic.In' });
    }
  }

  // ---------- 視窗共用 ----------
  private openModal(dimAlpha = 0.78) {
    this.closeModalUI();
    this.modalOpen = true;
    this.autoAt = this.time.now + 900;
    this.resetJoy();
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x05040a, dimAlpha).setInteractive();
    this.modalLayer.add(dim);
    // 視窗淡入
    this.modalLayer.setAlpha(0);
    this.tweens.add({ targets: this.modalLayer, alpha: 1, duration: 160 });
  }

  private closeModalUI() {
    this.autoAction = null;
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
        // 翻牌入場；傳說卡多一道金色光柱
        card.setScale(0, 1);
        this.tweens.add({ targets: card, scaleX: 1, duration: 220, delay: i * 90, ease: 'Back.Out' });
        if (info.rarity === 3) {
          const pillar = this.add.rectangle(W / 2, y, 480, H, 0xffc83d, 0.25).setBlendMode(Phaser.BlendModes.ADD);
          cardLayer.addAt(pillar, 0);
          this.tweens.add({ targets: pillar, alpha: 0, scaleY: 0.2, duration: 700, delay: i * 90 });
        }
        cardLayer.add(card);
        this.cardKeys[i] = () => onCard(i);
      });
    };

    this.autoAction = () => onCard(g.autoPickIndex(shown));
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
    // 自動：選第一個不是詛咒的遺物，全部是詛咒就略過
    this.autoAction = () => {
      const i = options.findIndex((r) => !r.curse);
      if (i >= 0) this.cardKeys[i]?.();
      else {
        this.closeModalUI();
        cb(null);
      }
    };
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
    // 自動：血少就買修復針，然後離開
    this.autoAction = () => {
      if (this.g.hp / this.g.maxHp < 0.6) buy('heal');
      this.closeModalUI();
      close();
    };
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
    this.autoAction = () => {
      this.closeModalUI();
      cb(false);
    };
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
    this.autoAction = () => {
      this.closeModalUI();
      this.g.revive();
    };
  }

  // ---------- 結算 ----------
  showResults(r: RunResult) {
    if (!this.ready) return;
    this.openModal(0.88);
    const top = Math.max(150, H * 0.2);
    const title = r.mode === 'weekly' ? '挑戰結束' : r.mode === 'endless' ? '無盡模式結束' : r.victory ? T.victory : T.defeat;
    this.title(top, title, r.victory || r.mode !== 'normal' ? '#ffc83d' : '#ff6b80', 44);
    const subText = r.mode === 'weekly' ? `對 Boss 造成 ${r.weeklyDmg.toLocaleString()} 傷害` : r.mode === 'endless' ? `存活 ${formatTime(r.time)}` : r.victory ? T.victorySub : T.defeatSub;
    const sub = this.add.text(W / 2, top + 46, subText, textStyle(18, r.mode === 'normal' ? COLORS.dim : '#ffd84d', false)).setOrigin(0.5);
    this.modalLayer.add(sub);
    // 評價星級：撐過 5 分鐘 1 星、通關 2 星、通關且擊殺 1500 以上或有通緝等級 3 星
    if (r.mode === 'normal') {
      const stars = r.victory ? (r.kills >= 1500 || r.wanted > 0 ? 3 : 2) : r.time >= 300 ? 1 : 0;
      for (let i = 0; i < 3; i++) {
        const st = this.add.text(W / 2 + (i - 1) * 54, top - 58, '★', textStyle(44, i < stars ? '#ffd84d' : '#3a3452')).setOrigin(0.5).setStroke('#07060d', 6);
        st.setScale(0);
        this.modalLayer.add(st);
        this.tweens.add({ targets: st, scale: 1, delay: 300 + i * 220, duration: 280, ease: 'Back.Out' });
        if (i < stars) this.time.delayedCall(300 + i * 220, () => Audio.play('sfx-gem', 0.5, 0, 200 * i));
      }
    }

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
      const kt = this.add.text(W / 2 - 180, y, k, textStyle(18, '#a9a5c8', false)).setOrigin(0, 0);
      const vt = this.add.text(W / 2 + 180, y - 2, v, textStyle(22)).setOrigin(1, 0);
      this.modalLayer.add([kt, vt]);
      // 一行一行飛入
      for (const o of [kt, vt]) {
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: 1, x: { from: o.x - 40, to: o.x }, delay: 200 + i * 120, duration: 260, ease: 'Cubic.Out' });
      }
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
    const stage = this.g.stage.id;
    const mode = this.g.mode;
    this.scene.stop('Game');
    this.scene.start('Game', { char, wanted, daily, stage, mode });
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

