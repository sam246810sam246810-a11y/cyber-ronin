import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W } from './config';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameScene } from './scenes/GameScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { CardSelectScene } from './scenes/CardSelectScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultScene } from './scenes/ResultScene';
import { CodexScene } from './scenes/CodexScene';
import { EventScene } from './scenes/EventScene';
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

const isPortraitPhone = () => window.innerHeight > window.innerWidth && Math.min(window.innerWidth, window.innerHeight) < 900;

function boot(): void {
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
    scene: [BootScene, PreloadScene, MainMenuScene, CharacterSelectScene, GameScene, CardSelectScene, PauseScene, ResultScene, CodexScene, EventScene],
  });

  (window as unknown as { __phaser?: Phaser.Game }).__phaser = game;

  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    installDebugPanel(game);
  }

  // 寬高比明顯改變時（例如換手機方向）：不在戰鬥中就重新載入以套用新版面
  const startAspect = window.innerWidth / window.innerHeight;
  window.addEventListener('resize', () => {
    const a = window.innerWidth / window.innerHeight;
    if (isPortraitPhone() || Math.abs(a - startAspect) / startAspect < 0.12) return;
    if (!game.scene.isActive('Game')) location.reload();
  });
}

// 直拿手機時先等轉成橫向，才能用正確的螢幕比例建立畫面
if (isPortraitPhone()) {
  const wait = () => {
    if (isPortraitPhone()) return;
    window.removeEventListener('resize', wait);
    window.removeEventListener('orientationchange', wait);
    setTimeout(boot, 250);
  };
  window.addEventListener('resize', wait);
  window.addEventListener('orientationchange', wait);
} else {
  boot();
}
