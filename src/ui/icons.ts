import Phaser from 'phaser';
import { hasIcon } from '../utils';

/** 有美術圖示就放圖，否則退回原本的 emoji／符號文字 */
export function iconOrText(
  scene: Phaser.Scene, x: number, y: number, frame: string, fallback: string, size: number, color = '#ffffff',
): Phaser.GameObjects.Image | Phaser.GameObjects.Text {
  if (hasIcon(scene, frame)) return scene.add.image(x, y, 'icons', frame).setDisplaySize(size, size);
  return scene.add.text(x, y, fallback, { fontSize: `${Math.round(size * 0.8)}px`, color }).setOrigin(0.5);
}
