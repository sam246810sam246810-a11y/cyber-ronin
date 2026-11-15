import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES, TILE_SIZE } from '../config';
import { useLogicalCamera } from '../ui/camera';
import { Player } from '../entities/Player';
import tilesUrl from '../../assets/tiles/tiles.png';
import playerUrl from '../../assets/sprites/player.png';
import villageMap from '../../assets/maps/village.json';

export class BootScene extends Phaser.Scene {
  constructor() { super(SCENES.boot); }

  preload(): void {
    useLogicalCamera(this);
    const w = 200;
    const box = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, w, 6).setStrokeStyle(1, 0xf2e6c9);
    const bar = this.add.rectangle(box.x - w / 2, box.y, 0, 6, 0xe8823a).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => { bar.width = w * p; });

    this.load.image('tiles', tilesUrl);
    this.load.spritesheet('player', playerUrl, { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE });
    this.load.tilemapTiledJSON('village', villageMap);
  }

  create(): void {
    Player.createAnims(this);
    this.scene.start(SCENES.title);
  }
}
