import Phaser from 'phaser';
import { RENDER_SCALE, SCENES } from '../config';
import { Player } from '../entities/Player';
import { inputState, resetInput } from '../systems/inputState';

export class WorldScene extends Phaser.Scene {
  private player!: Player;

  constructor() { super(SCENES.world); }

  create(): void {
    resetInput();
    const map = this.make.tilemap({ key: 'village' });
    const tiles = map.addTilesetImage('village_tiles', 'tiles');
    if (!tiles) throw new Error('找不到 tileset village_tiles');
    map.createLayer('ground', tiles, 0, 0);
    const obstacles = map.createLayer('obstacles', tiles, 0, 0);
    if (!obstacles) throw new Error('地圖缺少 obstacles 圖層');
    obstacles.setCollisionByProperty({ collides: true });

    const spawn = map.findObject('objects', (o) => o.name === 'spawn');
    this.player = new Player(this, spawn?.x ?? map.widthInPixels / 2, spawn?.y ?? map.heightInPixels / 2);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, obstacles);

    const cam = this.cameras.main;
    cam.setZoom(RENDER_SCALE);
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    cam.fadeIn(400, 20, 18, 28);

    const props = (Array.isArray(map.properties) ? map.properties : []) as { name: string; value: unknown }[];
    const areaName = String(props.find((p) => p.name === 'displayName')?.value ?? '');
    this.scene.launch(SCENES.ui, { areaName });
  }

  update(): void {
    this.player.move(inputState.move);
  }
}
