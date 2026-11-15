import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES } from '../config';
import { inputState, type Action } from '../systems/inputState';
import { EV, type BannerInfo, type DialogueRequest, type HudInfo } from '../systems/events';
import { currentObjective, gameState, classStats } from '../systems/gameState';
import { hudState } from '../systems/hudState';
import { STATUS_NAME, type StatusKind } from '../systems/combat';
import { VirtualJoystick } from '../ui/VirtualJoystick';
import { TouchButton } from '../ui/TouchButton';
import { DialogueBox } from '../ui/DialogueBox';
import { useLogicalCamera } from '../ui/camera';

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

  constructor() { super(SCENES.ui); }

  create(data: { areaName?: string }): void {
    useLogicalCamera(this);
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

    // 左上：職業、HP、MP
    const cls = classStats(gameState.classId);
    this.add.rectangle(8, 6, 128, 38, 0x14121c, 0.75).setOrigin(0).setStrokeStyle(1, 0xf2e6c9, 0.3);
    this.add.text(14, 8, `燈・${cls.name}`, TXT(8, '#e8823a')).setResolution(RENDER_SCALE);
    this.bars = this.add.graphics();
    this.hpText = this.add.text(130, 25, '', TXT(7)).setOrigin(1, 0.5).setResolution(RENDER_SCALE);
    this.mpText = this.add.text(130, 35, '', TXT(7)).setOrigin(1, 0.5).setResolution(RENDER_SCALE);
    this.statusText = this.add.text(140, 12, '', { ...TXT(9, '#ff9a4a'), fontStyle: 'bold' }).setResolution(RENDER_SCALE);
    // 金錢
    this.moneyBg = this.add.rectangle(8, 48, 74, 16, 0x14121c, 0.7).setOrigin(0).setStrokeStyle(1, 0xf2e6c9, 0.3);
    this.add.circle(17, 56, 3.5, 0xf2c94c).setStrokeStyle(1, 0x8a6a1a);
    this.money = this.add.text(24, 50, '', TXT(9)).setResolution(RENDER_SCALE);
    // 目標
    this.objective = this.add.text(GAME_WIDTH / 2 + 30, 10, '', { ...TXT(9), backgroundColor: '#14121cb0', padding: { x: 8, y: 3 } })
      .setOrigin(0.5, 0).setResolution(RENDER_SCALE);
    this.refreshStatus();

    const hint = this.add.text(GAME_WIDTH / 4, GAME_HEIGHT - 28, '按住左半邊拖曳來移動', { ...TXT(11), backgroundColor: '#14121caa', padding: { x: 8, y: 3 } })
      .setOrigin(0.5).setResolution(RENDER_SCALE);
    this.tweens.add({ targets: hint, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
    this.joystick.onFirstMove = () => this.tweens.add({ targets: hint, alpha: 0, duration: 400, onComplete: () => hint.destroy() });

    const ev = this.game.events;
    const handlers: [string, (...a: never[]) => void][] = [
      [EV.dialogue, (r: DialogueRequest) => { this.showButtons(false); this.dialogue.open({ ...r, onDone: () => { this.showButtons(true); r.onDone(); this.refreshStatus(); } }); }],
      [EV.hud, (h: HudInfo | null) => { if (h) this.buttons.attack.setLabel(h.label, h.canInteract); this.refreshStatus(); }],
      [EV.toast, (msg: string) => this.toast(msg)],
      [EV.area, (name: string) => { if (this.dialogue.isOpen) { this.dialogue.close(); this.showButtons(true); } this.showAreaName(name); }],
      [EV.banner, (b: BannerInfo) => this.banner(b)],
    ];
    handlers.forEach(([e, h]) => ev.on(e, h, this));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => handlers.forEach(([e, h]) => ev.off(e, h, this)));

    if (data.areaName) this.showAreaName(data.areaName);
  }

  private showButtons(v: boolean): void {
    const b = this.buttons;
    [b.attack, b.dodge, b.item, ...b.skills].forEach((x) => x.setVisible(v));
  }

  private refreshStatus(): void {
    const n = (k: string) => gameState.items[k] ?? 0;
    this.money.setText(`${gameState.money} 文`);
    this.moneyBg.setSize(this.money.width + 24, 16);
    const potions = n('回復丸') + n('大回復丸') + n('靈水') + n('解毒草') + n('萬能符');
    this.buttons.item.setSub(potions ? `×${potions}` : '');
    this.objective.setText(`目標：${currentObjective(gameState.flags)}`);
  }

  private drawBars(): void {
    const g = this.bars; g.clear();
    const w = 80, x = 14;
    const hp = Math.max(0, gameState.hp) / hudState.maxHp, mp = gameState.mp / hudState.maxMp;
    g.fillStyle(0x000000, 0.6).fillRect(x, 22, w, 6).fillRect(x, 33, w, 4);
    g.fillStyle(hp > 0.3 ? 0xd04848 : 0xff2a2a, 1).fillRect(x, 22, w * hp, 6);
    g.fillStyle(0x4a8fe0, 1).fillRect(x, 33, w * mp, 4);
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

  update(_t: number, dt: number): void {
    this.dialogue.update(dt);
    inputState.move = this.dialogue.isOpen ? { x: 0, y: 0 } : this.joystick.vector;
    this.drawBars();
    hudState.skills.forEach((s, i) => {
      const b = this.buttons.skills[i];
      b.setLabel(s.name); b.setSub(`${s.mp}MP`); b.setState(s.cooldown, s.usable);
    });
    this.buttons.dodge.setState(hudState.dodgeCooldown);
  }
}
