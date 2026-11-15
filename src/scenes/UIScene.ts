import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES } from '../config';
import { inputState } from '../systems/inputState';
import { VirtualJoystick } from '../ui/VirtualJoystick';
import { useLogicalCamera } from '../ui/camera';

/** 疊在 World 上層的介面：觸控搖桿（M1）。HUD、按鈕在之後的里程碑加入。 */
export class UIScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;

  constructor() { super(SCENES.ui); }

  create(data: { areaName?: string }): void {
    useLogicalCamera(this);
    if (data.areaName) this.showAreaName(data.areaName);
    this.joystick = new VirtualJoystick(this, () => GAME_WIDTH / 2);

    const hint = this.add.text(GAME_WIDTH / 4, GAME_HEIGHT - 28, '按住左半邊拖曳來移動', {
      fontFamily: FONT_FAMILY, fontSize: '11px', color: '#f2e6c9', backgroundColor: '#14121caa', padding: { x: 8, y: 3 },
    }).setOrigin(0.5).setResolution(RENDER_SCALE);
    this.tweens.add({ targets: hint, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
    this.joystick.onFirstMove = () => this.tweens.add({ targets: hint, alpha: 0, duration: 400, onComplete: () => hint.destroy() });
  }

  private showAreaName(name: string): void {
    const t = this.add.text(GAME_WIDTH / 2, 40, name, { fontFamily: FONT_FAMILY, fontSize: '18px', color: '#f2e6c9', backgroundColor: '#14121ccc', padding: { x: 14, y: 4 } })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setAlpha(0);
    this.tweens.chain({ targets: t, tweens: [{ alpha: 1, duration: 400, delay: 300 }, { alpha: 0, duration: 600, delay: 1600 }], onComplete: () => t.destroy() });
  }

  update(): void {
    inputState.move = this.joystick.vector;
  }
}
