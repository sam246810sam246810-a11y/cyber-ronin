import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { CharSelectScene } from './scenes/CharSelectScene';
import { ShopScene } from './scenes/ShopScene';
import { CodexScene } from './scenes/CodexScene';
import { ArmoryScene } from './scenes/ArmoryScene';
import { GachaScene } from './scenes/GachaScene';
import { MissionsScene } from './scenes/MissionsScene';
import { COLORS, H, W, Z } from './game/layout';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.bg,
  width: W * Z,
  height: H * Z,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  render: { antialias: true, powerPreference: 'high-performance' },
  fps: { target: 60 },
  scene: [BootScene, MenuScene, CharSelectScene, ShopScene, CodexScene, ArmoryScene, GachaScene, MissionsScene, GameScene, UIScene],
});

// 給自動化測試與除錯使用
(window as unknown as { __cr: Phaser.Game }).__cr = game;
