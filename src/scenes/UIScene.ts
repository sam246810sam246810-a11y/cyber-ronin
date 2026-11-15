import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES } from '../config';
import { inputState, type Action } from '../systems/inputState';
import { EV, type BannerInfo, type DialogueRequest, type HudInfo, type SaveRequest } from '../systems/events';
import { currentObjective, gameState, className } from '../systems/gameState';
import { hudState } from '../systems/hudState';
import { STATUS_NAME, type StatusKind } from '../systems/combat';
import { VirtualJoystick } from '../ui/VirtualJoystick';
import { TouchButton } from '../ui/TouchButton';
import { DialogueBox } from '../ui/DialogueBox';
import { useLogicalCamera } from '../ui/camera';
import { sound } from '../audio/sound';
import { getSettings } from '../systems/settings';
import { getOverlay, type GameOverlay } from '../ui/dom/GameOverlay';
import { PHASE_MARKS } from '../systems/boss';
import { isReady, progressOf, questDef } from '../systems/quests';
import { expToNext, LEVEL_CAP } from '../systems/progression';

const TXT = (size: number, color = '#f2e6c9'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: FONT_FAMILY, fontSize: `${size}px`, color });

/** 疊在 World 上層的介面：搖桿、按鈕、HP/MP、金錢與目標、對話框、訊息。 */
export class UIScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;
  private buttons!: { attack: TouchButton; dodge: TouchButton; skills: TouchButton[]; item: TouchButton };
  private dialogue!: DialogueBox;
  private bars!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private mpText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private money!: Phaser.GameObjects.Text;
  private moneyBg!: Phaser.GameObjects.Rectangle;
  private objective!: Phaser.GameObjects.Text;
  private toastY = 0;
  private overlay!: GameOverlay;
  private mmStatic!: Phaser.GameObjects.Graphics;
  private mmDyn!: Phaser.GameObjects.Graphics;
  private mmVersion = -1;
  private mmBox = { x: 0, y: 0, s: 1, w: 0, h: 0 };
  private bossG!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;
  private tracked!: Phaser.GameObjects.Text;
  private menuBtn!: TouchButton;
  private label!: Phaser.GameObjects.Text;

  constructor() { super(SCENES.ui); }

  create(data: { areaName?: string }): void {
    useLogicalCamera(this);
    this.input.on('pointerdown', () => sound.unlock());
    this.joystick = new VirtualJoystick(this, () => GAME_WIDTH / 2);
    const push = (a: Action) => () => { if (!this.dialogue.isOpen) inputState.actions.push(a); };
    this.buttons = {
      attack: new TouchButton(this, { x: 432, y: 224, r: 24, label: '攻擊', fontSize: 12, color: 0x5a2a2a, onDown: push('attackDown'), onUp: () => inputState.actions.push('attackUp') }),
      dodge: new TouchButton(this, { x: 374, y: 242, r: 15, label: '閃避', onDown: push('dodge') }),
      skills: [
        new TouchButton(this, { x: 380, y: 194, r: 16, label: '', color: 0x2a3a5a, onDown: push('skill0') }),
        new TouchButton(this, { x: 418, y: 162, r: 16, label: '', color: 0x2a3a5a, onDown: push('skill1') }),
      ],
      item: new TouchButton(this, { x: 462, y: 172, r: 13, label: '藥', color: 0x2a4a2a, onDown: push('item') }),
    };
    this.dialogue = new DialogueBox(this);
    this.time.delayedCall(0, () => this.applyButtonAlpha());
    this.overlay = getOverlay();
    this.menuBtn = new TouchButton(this, { x: 458, y: 20, r: 14, label: '選單', fontSize: 8, onDown: () => this.openOverlay(() => this.overlay.openMenu(() => this.closeOverlay())) });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.overlay.close());
    this.mmStatic = this.add.graphics().setDepth(850);
    this.mmDyn = this.add.graphics().setDepth(851);
    this.bossG = this.add.graphics().setDepth(860);
    this.bossName = this.add.text(GAME_WIDTH / 2, 30, '', { fontFamily: FONT_FAMILY, fontSize: '9px', color: '#ff9a9a', fontStyle: 'bold' }).setOrigin(0.5, 0).setResolution(RENDER_SCALE).setDepth(861);

    // 左上：職業、HP、MP
    this.add.rectangle(8, 6, 128, 40, 0x14121c, 0.75).setOrigin(0).setStrokeStyle(1, 0xf2e6c9, 0.3);
    this.label = this.add.text(14, 8, '', TXT(8, '#e8823a')).setResolution(RENDER_SCALE);
    this.bars = this.add.graphics();
    this.hpText = this.add.text(130, 25, '', TXT(7)).setOrigin(1, 0.5).setResolution(RENDER_SCALE);
    this.mpText = this.add.text(130, 35, '', TXT(7)).setOrigin(1, 0.5).setResolution(RENDER_SCALE);
    this.statusText = this.add.text(140, 12, '', { ...TXT(9, '#ff9a4a'), fontStyle: 'bold' }).setResolution(RENDER_SCALE);
    // 金錢
    this.moneyBg = this.add.rectangle(8, 50, 74, 16, 0x14121c, 0.7).setOrigin(0).setStrokeStyle(1, 0xf2e6c9, 0.3);
    this.add.circle(17, 58, 3.5, 0xf2c94c).setStrokeStyle(1, 0x8a6a1a);
    this.money = this.add.text(24, 52, '', TXT(9)).setResolution(RENDER_SCALE);
    // 目標
    this.objective = this.add.text(GAME_WIDTH / 2 - 4, 10, '', { ...TXT(9), backgroundColor: '#14121cb0', padding: { x: 8, y: 3 } })
      .setOrigin(0.5, 0).setResolution(RENDER_SCALE);
    this.tracked = this.add.text(GAME_WIDTH / 2 - 4, 27, '', { ...TXT(8, '#ffd84a'), backgroundColor: '#14121c90', padding: { x: 6, y: 2 } }).setOrigin(0.5, 0).setResolution(RENDER_SCALE);
    this.refreshStatus();

    const hint = this.add.text(GAME_WIDTH / 4, GAME_HEIGHT - 28, '按住左半邊拖曳來移動', { ...TXT(11), backgroundColor: '#14121caa', padding: { x: 8, y: 3 } })
      .setOrigin(0.5).setResolution(RENDER_SCALE);
    this.tweens.add({ targets: hint, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
    this.joystick.onFirstMove = () => this.tweens.add({ targets: hint, alpha: 0, duration: 400, onComplete: () => hint.destroy() });

    const ev = this.game.events;
    const handlers: [string, (...a: never[]) => void][] = [
      [EV.dialogue, (r: DialogueRequest) => { this.showButtons(false); this.dialogue.open({ ...r, onDone: (c?: number) => { this.showButtons(true); r.onDone(c); this.refreshStatus(); } }); }],
      [EV.hud, (h: HudInfo | null) => { if (h) this.buttons.attack.setLabel(h.label, h.canInteract); this.refreshStatus(); }],
      [EV.toast, (msg: string) => this.toast(msg)],
      [EV.area, (name: string) => { if (this.dialogue.isOpen) { this.dialogue.close(); this.showButtons(true); } this.showAreaName(name); }],
      [EV.banner, (b: BannerInfo) => this.banner(b)],
      [EV.shop, (id: string) => this.openOverlay(() => this.overlay.openShop(id, () => this.closeOverlay()))],
      [EV.forge, () => this.openOverlay(() => this.overlay.openForge(() => this.closeOverlay()))],
      [EV.board, () => this.openOverlay(() => this.overlay.openBoard(() => this.closeOverlay()))],
      [EV.save, (req: SaveRequest) => this.openOverlay(() => this.overlay.openSave(req, () => this.closeOverlay()))],
    ];
    handlers.forEach(([e, h]) => ev.on(e, h, this));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => handlers.forEach(([e, h]) => ev.off(e, h, this)));

    if (data.areaName) this.showAreaName(data.areaName);
  }

  private showButtons(v: boolean): void {
    const b = this.buttons;
    [b.attack, b.dodge, b.item, ...b.skills, this.menuBtn].forEach((x) => x.setVisible(v));
    this.mmStatic?.setVisible(v); this.mmDyn?.setVisible(v);
  }

  private openOverlay(open: () => void): void {
    if (this.overlay.isOpen || this.dialogue.isOpen || inputState.locked) return;
    inputState.locked = true;
    sound.sfx('select');
    this.showButtons(false);
    open();
  }

  private applyButtonAlpha(): void {
    const a = getSettings().buttonAlpha, b = this.buttons;
    [b.attack, b.dodge, b.item, ...b.skills, this.menuBtn].forEach((x) => x.setOpacity(a));
  }

  private closeOverlay(): void {
    this.applyButtonAlpha();
    inputState.locked = false;
    this.showButtons(true);
    this.refreshStatus();
  }

  private refreshStatus(): void {
    const n = (k: string) => gameState.items[k] ?? 0;
    this.money.setText(`${gameState.money} 文`);
    this.moneyBg.setSize(this.money.width + 24, 16);
    const potions = n('回復丸') + n('大回復丸') + n('靈水') + n('解毒草') + n('萬能符');
    this.buttons.item.setSub(potions ? `×${potions}` : '');
    this.objective.setText(`目標：${currentObjective(gameState.flags)}`);
    // 追蹤中的任務：最早接的那個進行中任務
    const id = Object.keys(gameState.quests).find((k) => gameState.quests[k].status === 'active' && questDef(k, gameState.flags));
    const q = id ? questDef(id, gameState.flags) : undefined;
    this.tracked?.setText(q && id ? `${q.name}　${isReady(gameState, id) ? '可以交付' : `${progressOf(gameState, id)}/${q.target.count}`}` : '').setVisible(!!q);
  }

  private drawBars(): void {
    const g = this.bars; g.clear();
    const w = 80, x = 14;
    this.label.setText(`燈・${className(gameState)}　Lv.${gameState.level}`);
    const hp = Phaser.Math.Clamp(gameState.hp / hudState.maxHp, 0, 1), mp = Phaser.Math.Clamp(gameState.mp / hudState.maxMp, 0, 1);
    g.fillStyle(0x000000, 0.6).fillRect(x, 22, w, 6).fillRect(x, 33, w, 4);
    g.fillStyle(hp > 0.3 ? 0xd04848 : 0xff2a2a, 1).fillRect(x, 22, w * hp, 6);
    g.fillStyle(0x4a8fe0, 1).fillRect(x, 33, w * mp, 4);
    const next = gameState.level >= LEVEL_CAP ? 0 : expToNext(gameState.level);
    g.fillStyle(0x000000, 0.6).fillRect(x, 39, w, 2);
    g.fillStyle(0x9fd8ff, 1).fillRect(x, 39, next ? w * (gameState.exp / next) : w, 2);
    this.hpText.setText(`${Math.ceil(gameState.hp)}/${hudState.maxHp}`);
    this.mpText.setText(`${Math.floor(gameState.mp)}/${hudState.maxMp}`);
    const st = (Object.keys(gameState.statuses) as StatusKind[]).filter((k) => (gameState.statuses[k] ?? 0) > 0).map((k) => STATUS_NAME[k]);
    this.statusText.setText(st.join(' '));
  }

  private showAreaName(name: string): void {
    if (!name) return;
    const t = this.add.text(GAME_WIDTH / 2, 44, name, { ...TXT(18), backgroundColor: '#14121ccc', padding: { x: 14, y: 4 } })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setAlpha(0).setDepth(500);
    this.tweens.chain({ targets: t, tweens: [{ alpha: 1, duration: 300, delay: 200 }, { alpha: 0, duration: 500, delay: 1300 }], onComplete: () => t.destroy() });
  }

  private toast(msg: string): void {
    const y = 76 + this.toastY; this.toastY += 18;
    const t = this.add.text(GAME_WIDTH / 2, y, msg, { ...TXT(11, '#14121c'), backgroundColor: '#f2c94c', padding: { x: 10, y: 3 } })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(800).setAlpha(0);
    this.tweens.chain({ targets: t, tweens: [{ alpha: 1, y: y - 4, duration: 200 }, { alpha: 0, duration: 400, delay: 1400 }],
      onComplete: () => { t.destroy(); this.toastY = Math.max(0, this.toastY - 18); } });
  }

  private banner({ title, sub, duration = 4200 }: BannerInfo): void {
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x14121c, 0).setOrigin(0).setDepth(1500);
    const t1 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 14, title, { ...TXT(32), fontStyle: 'bold' }).setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(1501).setAlpha(0)
      .setShadow(0, 3, '#c23b2f', 0, false, true);
    const t2 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 22, sub, TXT(11, '#a39fb8')).setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(1501).setAlpha(0);
    this.tweens.add({ targets: shade, fillAlpha: 0.75, duration: 400 });
    this.tweens.add({ targets: [t1, t2], alpha: 1, duration: 600, delay: 200 });
    this.time.delayedCall(duration, () => this.tweens.add({ targets: [shade, t1, t2], alpha: 0, duration: 500, onComplete: () => { shade.destroy(); t1.destroy(); t2.destroy(); } }));
  }

  /** 右上角小地圖（PRD 6.4）：地形換地圖時重畫，標記每幀更新 */
  private drawMinimap(time: number): void {
    const mm = hudState.minimap;
    if (mm.version !== this.mmVersion) {
      this.mmVersion = mm.version;
      const maxW = 76, maxH = 54, s = Math.min(maxW / mm.w, maxH / mm.h, 3);
      const w = mm.w * s, h = mm.h * s, x = 474 - w, y = 38;
      this.mmBox = { x, y, s, w, h };
      const g = this.mmStatic; g.clear();
      g.fillStyle(0x14121c, 0.75).fillRect(x - 2, y - 2, w + 4, h + 4).lineStyle(1, 0xf2e6c9, 0.35).strokeRect(x - 2, y - 2, w + 4, h + 4);
      g.fillStyle(0x8a8478, 0.55);
      for (let ty = 0; ty < mm.h; ty++) for (let tx = 0; tx < mm.w; tx++) if (!mm.walls[ty * mm.w + tx]) g.fillRect(x + tx * s, y + ty * s, Math.ceil(s), Math.ceil(s));
    }
    const { x, y, s } = this.mmBox, d = this.mmDyn; d.clear();
    const r = Math.max(1, s * 0.8);
    for (const m of mm.markers) d.fillStyle(m.color, 1).fillRect(x + m.x * s - r / 2, y + m.y * s - r / 2, r, r);
    const blink = Math.floor(time / 300) % 2 ? 1 : 0.6;
    d.fillStyle(0x4fd8ff, blink).fillCircle(x + mm.player.x * s, y + mm.player.y * s, Math.max(1.5, s * 0.9));
  }

  /** Boss 血條：畫面上方，標出換階段的位置（PRD 11.2） */
  private drawBossBar(): void {
    const b = hudState.boss, g = this.bossG; g.clear();
    this.bossName.setVisible(b.visible);
    if (b.visible) this.tracked.setVisible(false);
    if (!b.visible) return;
    const w = 200, x = GAME_WIDTH / 2 - w / 2, y = 42, k = Math.max(0, b.hp / b.max);
    this.bossName.setText(b.name);
    g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, 7);
    g.fillStyle(0xc23b2f, 1).fillRect(x, y, w * k, 5);
    g.fillStyle(0xffffff, 0.25).fillRect(x, y, w * k, 1);
    for (const m of PHASE_MARKS) g.fillStyle(0xf2e6c9, 0.9).fillRect(x + w * m, y - 2, 1, 9);
  }

  update(_t: number, dt: number): void {
    this.drawMinimap(_t);
    this.drawBossBar();
    this.dialogue.update(dt);
    if (inputState.holdAfterWarp && !this.joystick.active) inputState.holdAfterWarp = false;
    inputState.move = this.dialogue.isOpen || inputState.holdAfterWarp ? { x: 0, y: 0 } : this.joystick.vector;
    this.drawBars();
    hudState.skills.forEach((s, i) => {
      const b = this.buttons.skills[i];
      b.setLabel(s.name); b.setSub(`${s.mp}MP`); b.setState(s.cooldown, s.usable);
    });
    this.buttons.dodge.setState(hudState.dodgeCooldown);
  }
}
