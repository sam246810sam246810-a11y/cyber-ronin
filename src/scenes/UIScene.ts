import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES } from '../config';
import { inputState } from '../systems/inputState';
import { EV, type DialogueRequest, type HudInfo } from '../systems/events';
import { currentObjective, gameState } from '../systems/gameState';
import { VirtualJoystick } from '../ui/VirtualJoystick';
import { ActionButton } from '../ui/ActionButton';
import { DialogueBox } from '../ui/DialogueBox';
import { useLogicalCamera } from '../ui/camera';

const TXT = (size: number, color = '#f2e6c9'): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: FONT_FAMILY, fontSize: `${size}px`, color });

/** 疊在 World 上層的介面：搖桿、調查鈕、金錢與目標、對話框、訊息。 */
export class UIScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;
  private action!: ActionButton;
  private dialogue!: DialogueBox;
  private money!: Phaser.GameObjects.Text;
  private moneyBg!: Phaser.GameObjects.Rectangle;
  private objective!: Phaser.GameObjects.Text;
  private toastY = 0;

  constructor() { super(SCENES.ui); }

  create(data: { areaName?: string }): void {
    useLogicalCamera(this);
    this.joystick = new VirtualJoystick(this, () => GAME_WIDTH / 2);
    this.action = new ActionButton(this, GAME_WIDTH - 46, GAME_HEIGHT - 50, () => this.game.events.emit(EV.interact));
    this.dialogue = new DialogueBox(this);

    // 左上：金錢與道具數
    this.moneyBg = this.add.rectangle(8, 8, 74, 18, 0x14121c, 0.7).setOrigin(0).setStrokeStyle(1, 0xf2e6c9, 0.3);
    this.add.circle(18, 17, 4, 0xf2c94c).setStrokeStyle(1, 0x8a6a1a);
    this.money = this.add.text(26, 10, '', TXT(11)).setResolution(RENDER_SCALE);
    // 上方中央：目前目標
    this.objective = this.add.text(GAME_WIDTH / 2, 10, '', { ...TXT(10), backgroundColor: '#14121cb0', padding: { x: 8, y: 3 } })
      .setOrigin(0.5, 0).setResolution(RENDER_SCALE);
    this.refreshStatus();

    const hint = this.add.text(GAME_WIDTH / 4, GAME_HEIGHT - 28, '按住左半邊拖曳來移動', { ...TXT(11), backgroundColor: '#14121caa', padding: { x: 8, y: 3 } })
      .setOrigin(0.5).setResolution(RENDER_SCALE);
    this.tweens.add({ targets: hint, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
    this.joystick.onFirstMove = () => this.tweens.add({ targets: hint, alpha: 0, duration: 400, onComplete: () => hint.destroy() });

    const ev = this.game.events;
    const handlers: [string, (...a: never[]) => void][] = [
      [EV.dialogue, (r: DialogueRequest) => { this.action.setVisible(false); this.dialogue.open({ ...r, onDone: () => { this.action.setVisible(true); r.onDone(); this.refreshStatus(); } }); }],
      [EV.hud, (h: HudInfo) => { this.action.set(h.canInteract, h.label); this.refreshStatus(); }],
      [EV.toast, (msg: string) => this.toast(msg)],
      [EV.area, (name: string) => this.showAreaName(name)],
      [EV.banner, (b: { title: string; sub: string }) => this.banner(b.title, b.sub)],
    ];
    handlers.forEach(([e, h]) => ev.on(e, h, this));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => handlers.forEach(([e, h]) => ev.off(e, h, this)));

    if (data.areaName) this.showAreaName(data.areaName);
  }

  private refreshStatus(): void {
    const potions = gameState.items['回復丸'] ?? 0;
    this.money.setText(`${gameState.money} 文${potions ? `　藥×${potions}` : ''}`);
    this.moneyBg.width = this.money.width + 26;
    this.objective.setText(`目標：${currentObjective(gameState.flags)}`);
  }

  private showAreaName(name: string): void {
    if (!name) return;
    const t = this.add.text(GAME_WIDTH / 2, 44, name, { ...TXT(18), backgroundColor: '#14121ccc', padding: { x: 14, y: 4 } })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setAlpha(0).setDepth(500);
    this.tweens.chain({ targets: t, tweens: [{ alpha: 1, duration: 300, delay: 200 }, { alpha: 0, duration: 500, delay: 1300 }], onComplete: () => t.destroy() });
  }

  private toast(msg: string): void {
    const y = 72 + this.toastY; this.toastY += 18;
    const t = this.add.text(GAME_WIDTH / 2, y, msg, { ...TXT(12, '#14121c'), backgroundColor: '#f2c94c', padding: { x: 10, y: 3 } })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(800).setAlpha(0);
    this.tweens.chain({ targets: t, tweens: [{ alpha: 1, y: y - 4, duration: 200 }, { alpha: 0, duration: 400, delay: 1600 }],
      onComplete: () => { t.destroy(); this.toastY = Math.max(0, this.toastY - 18); } });
  }

  private banner(title: string, sub: string): void {
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x14121c, 0).setOrigin(0).setDepth(1500);
    const t1 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 14, title, { ...TXT(32), fontStyle: 'bold' }).setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(1501).setAlpha(0)
      .setShadow(0, 3, '#c23b2f', 0, false, true);
    const t2 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 22, sub, TXT(11, '#a39fb8')).setOrigin(0.5).setResolution(RENDER_SCALE).setDepth(1501).setAlpha(0);
    this.tweens.add({ targets: shade, fillAlpha: 0.75, duration: 500 });
    this.tweens.add({ targets: [t1, t2], alpha: 1, duration: 800, delay: 300 });
    this.time.delayedCall(4200, () => this.tweens.add({ targets: [shade, t1, t2], alpha: 0, duration: 600, onComplete: () => { shade.destroy(); t1.destroy(); t2.destroy(); } }));
  }

  update(_t: number, dt: number): void {
    this.dialogue.update(dt);
    inputState.move = this.dialogue.isOpen ? { x: 0, y: 0 } : this.joystick.vector;
  }
}
