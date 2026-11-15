import Phaser from 'phaser';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENES } from '../config';
import { useLogicalCamera } from '../ui/camera';
import { resetGameState } from '../systems/gameState';

export class TitleScene extends Phaser.Scene {
  constructor() { super(SCENES.title); }

  create(): void {
    const cx = GAME_WIDTH / 2;
    useLogicalCamera(this).setBackgroundColor('#14121c');

    for (let i = 0; i < 14; i++) {
      const fire = this.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), Phaser.Math.Between(1, 3), 0x7fd8ff, 0.7);
      this.tweens.add({ targets: fire, y: fire.y - Phaser.Math.Between(20, 50), alpha: 0.1, duration: Phaser.Math.Between(1800, 3200), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }

    this.add.text(cx, 92, '狐火行', { fontFamily: FONT_FAMILY, fontSize: '48px', color: '#f2e6c9', fontStyle: 'bold' })
      .setOrigin(0.5).setResolution(RENDER_SCALE).setShadow(0, 3, '#c23b2f', 0, false, true);
    this.add.text(cx, 132, 'KITSUNEBI', { fontFamily: FONT_FAMILY, fontSize: '10px', color: '#a39fb8', letterSpacing: 6 })
      .setOrigin(0.5).setResolution(RENDER_SCALE);

    const hint = this.add.text(cx, 200, '點擊畫面開始', { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#f2e6c9' })
      .setOrigin(0.5).setResolution(RENDER_SCALE);
    this.tweens.add({ targets: hint, alpha: 0.25, duration: 800, yoyo: true, repeat: -1 });

    this.add.text(GAME_WIDTH - 6, GAME_HEIGHT - 6, '序章試玩版', { fontFamily: FONT_FAMILY, fontSize: '9px', color: '#6b6780' })
      .setOrigin(1, 1).setResolution(RENDER_SCALE);

    this.input.once('pointerdown', () => {
      resetGameState();
      this.cameras.main.fadeOut(300, 20, 18, 28);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
        this.scene.start(SCENES.world, { map: 'home', spawn: 'door', face: 'up', intro: true }));
    });
  }
}
