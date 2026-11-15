import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../config';

/** 讓場景的主攝影機用 480×270 邏輯座標顯示（放大 RENDER_SCALE 倍）。 */
export function useLogicalCamera(scene: Phaser.Scene): Phaser.Cameras.Scene2D.Camera {
  const cam = scene.cameras.main;
  cam.setZoom(RENDER_SCALE);
  cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  return cam;
}

/** 把指標的畫布座標轉成 480×270 邏輯座標。 */
export function pointerToLogical(scene: Phaser.Scene, p: Phaser.Input.Pointer): Phaser.Math.Vector2 {
  return scene.cameras.main.getWorldPoint(p.x, p.y);
}
