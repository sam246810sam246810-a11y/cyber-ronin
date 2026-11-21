import Phaser from 'phaser';
import { COLORS, GAME_H, GAME_W, computeLayout, relayout } from './config';
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

const isPortrait = () => window.innerHeight > window.innerWidth;
const inCombat = (g: Phaser.Game) => g.scene.isActive('Game') || g.scene.isPaused('Game');

let game: Phaser.Game | undefined;
/** 戰鬥中尺寸改變時先記著，回到主選單再重建 */
let layoutStale = false;
let debugInstalled = false;

function createGame(): void {
  relayout();
  layoutStale = false;
  game = new Phaser.Game({
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
  if (!debugInstalled && (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))) {
    debugInstalled = true;
    installDebugPanel(game);
  }
}

/** 用目前的螢幕尺寸重建整個遊戲（回到主選單） */
function rebuild(): void {
  game?.destroy(true);
  game = undefined;
  setTimeout(createGame, 50);
}

/**
 * 尺寸穩定後才量：預覽器剛開啟、轉向、工具列收合時尺寸會連續變動。
 * 已經建立後若寬高比明顯改變，不在戰鬥中就重建；在戰鬥中則等回到主選單。
 */
let settleTimer = 0;
function onViewportChange(): void {
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    if (isPortrait()) return; // 直拿時顯示「請橫放」
    if (!game) {
      createGame();
      return;
    }
    const want = computeLayout().gameW;
    if (Math.abs(want - GAME_W) < 24) return;
    if (inCombat(game)) layoutStale = true;
    else rebuild();
  }, 400);
}
window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', onViewportChange);
window.visualViewport?.addEventListener('resize', onViewportChange);
// 主選單開啟時檢查：戰鬥中錯過的尺寸變更在這裡套用
(window as unknown as { __checkLayout?: () => void }).__checkLayout = () => {
  if (!game) return;
  const want = computeLayout().gameW;
  if (layoutStale || Math.abs(want - GAME_W) >= 24) rebuild();
};
onViewportChange();
