import Phaser from 'phaser';
import { createTextures } from '../game/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create() {
    createTextures(this);
    document.getElementById('loading')?.remove();
    this.scene.start('Menu');
  }
}
