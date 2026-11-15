import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES, TILE_SIZE } from '../config';
import { Player } from '../entities/Player';
import { useLogicalCamera } from '../ui/camera';
import { MAPS } from '../data/maps';
import tilesUrl from '../../assets/tiles/tiles.png';
import playerUrl from '../../assets/sprites/player.png';
import npcsUrl from '../../assets/sprites/npcs.png';
import enemiesUrl from '../../assets/sprites/enemies.png';
import fxUrl from '../../assets/sprites/fx.png';
import bossUrl from '../../assets/sprites/boss.png';
import kappaKingUrl from '../../assets/sprites/kappaking.png';
import daitenguUrl from '../../assets/sprites/daitengu.png';
import shutenUrl from '../../assets/sprites/shuten.png';
import hyakkiUrl from '../../assets/sprites/hyakki.png';

export class BootScene extends Phaser.Scene {
  constructor() { super(SCENES.boot); }

  preload(): void {
    useLogicalCamera(this);
    const w = 200;
    const box = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, w, 6).setStrokeStyle(1, 0xf2e6c9);
    const bar = this.add.rectangle(box.x - w / 2, box.y, 0, 6, 0xe8823a).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => { bar.width = w * p; });

    const frame = { frameWidth: TILE_SIZE, frameHeight: TILE_SIZE };
    this.load.image('tiles', tilesUrl);
    this.load.spritesheet('tilesheet', tilesUrl, frame); // 寶箱、告示牌等物件用同一張圖
    this.load.spritesheet('player', playerUrl, frame);
    this.load.spritesheet('npcs', npcsUrl, frame);
    this.load.spritesheet('enemies', enemiesUrl, frame);
    this.load.spritesheet('fx', fxUrl, frame);
    this.load.spritesheet('boss', bossUrl, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('kappaking', kappaKingUrl, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('daitengu', daitenguUrl, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('shuten', shutenUrl, { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('hyakki', hyakkiUrl, { frameWidth: 32, frameHeight: 32 });
    for (const [key, data] of Object.entries(MAPS)) this.load.tilemapTiledJSON(key, data);
  }

  create(): void {
    Player.createAnims(this);
    this.scene.start(SCENES.title);
  }
}
