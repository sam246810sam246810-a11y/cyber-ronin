import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W } from './config';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameScene } from './scenes/GameScene';
import { CardSelectScene } from './scenes/CardSelectScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultScene } from './scenes/ResultScene';
import { CodexScene } from './scenes/CodexScene';
import { installDebugPanel } from './debug/DebugPanel';

// 防止 iOS 雙指縮放 / 長按選單 / 雙擊縮放
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }),
);
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 4 },
  render: { antialias: true, roundPixels: false },
  scene: [BootScene, PreloadScene, MainMenuScene, GameScene, CardSelectScene, PauseScene, ResultScene, CodexScene],
});

(window as unknown as { __phaser?: Phaser.Game }).__phaser = game;

if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  installDebugPanel(game);
}
