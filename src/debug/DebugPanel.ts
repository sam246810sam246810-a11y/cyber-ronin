import type Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { CodexStore } from '../systems/CodexStore';
import { ProgressStore } from '../systems/ProgressStore';
import type { ElementId, RarityIndex } from '../types';

/**
 * 開發用 debug 面板（DOM 疊層）。
 * 開發模式（npm run dev）自動啟用；正式版網址加 ?debug 也能打開。
 */
export function installDebugPanel(game: Phaser.Game): void {
  const getGame = (): GameScene | undefined => {
    const s = game.scene.getScene('Game') as GameScene | null;
    return s && s.scene.isActive() ? s : undefined;
  };

  const toggle = document.createElement('button');
  toggle.textContent = '🐞';
  Object.assign(toggle.style, {
    position: 'fixed', left: '6px', bottom: '6px', zIndex: '1000', width: '40px', height: '40px',
    borderRadius: '20px', border: '1px solid #c9a3ff', background: 'rgba(20,10,30,0.7)', fontSize: '20px',
  } as CSSStyleDeclaration);

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', left: '6px', bottom: '52px', zIndex: '1000', display: 'none', flexWrap: 'wrap',
    gap: '6px', width: '220px', padding: '8px', background: 'rgba(20,10,30,0.9)', border: '1px solid #c9a3ff',
    borderRadius: '8px', font: '13px sans-serif', color: '#fff',
  } as CSSStyleDeclaration);

  const status = document.createElement('div');
  status.style.width = '100%';

  const add = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      padding: '6px 8px', background: '#3a2f45', color: '#fff', border: '1px solid #6a5a7a', borderRadius: '4px', fontSize: '13px',
    } as CSSStyleDeclaration);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
      refresh();
    });
    panel.appendChild(b);
  };

  const give = (el: ElementId, r: RarityIndex) => {
    const g = getGame();
    if (g) g.dropMaterial(g.player.x, g.player.y, { el, r });
  };
  const rarityNames = ['普', '稀', '史', '傳'];
  let giveRarity: RarityIndex = 0;
  add('素材稀有度: 普', () => {
    giveRarity = ((giveRarity + 1) % 4) as RarityIndex;
    (panel.children[0] as HTMLButtonElement).textContent = `素材稀有度: ${rarityNames[giveRarity]}`;
  });
  (['J', 'I', 'S', 'F', 'T'] as ElementId[]).forEach((el) => add(`+${el}`, () => give(el, giveRarity)));
  add('下次必裂變', () => {
    const g = getGame();
    if (g) g.crucible.forceFission = true;
  });
  add('清空房間', () => getGame()?.dungeon.debugSkip());
  add('下一層', () => getGame()?.dungeon.debugNextFloor());
  add('Boss 房', () => getGame()?.dungeon.debugToBoss());
  add('+50 金幣', () => {
    const g = getGame();
    if (g) g.coins += 50;
  });
  add('寶箱', () => getGame()?.encounters.spawn('chest'));
  add('商店', () => getGame()?.encounters.spawn('shop'));
  add('選突變卡', () => getGame()?.openCardSelect());
  add('無敵 開/關', () => {
    const g = getGame();
    if (g) g.player.godMode = !g.player.godMode;
  });
  add('補滿血', () => {
    const g = getGame();
    if (g) g.player.hp = g.player.maxHp;
  });
  add('解鎖全圖鑑', () => CodexStore.unlockAll());
  add('解鎖全角色', () => ProgressStore.debugUnlockAll());
  add('重置圖鑑/進度', () => {
    CodexStore.reset();
    ProgressStore.reset();
  });
  panel.appendChild(status);

  const refresh = () => {
    const g = getGame();
    status.textContent = g
      ? `${g.dungeon.label} ${g.dungeon.phase} 房:${g.dungeon.current.type} 敵:${g.enemies.length} 無敵:${g.player.godMode ? 'ON' : 'off'} 喝:${g.buffs.drinks} 裂變率:${Math.round(g.crucible.fissionChance * 100)}% 角色:${g.character.name}`
      : `圖鑑:${CodexStore.count}/${CodexStore.total}（在遊戲中才能用大部分按鈕）`;
  };

  toggle.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    refresh();
  });
  setInterval(() => panel.style.display !== 'none' && refresh(), 500);

  document.body.appendChild(toggle);
  document.body.appendChild(panel);
}
