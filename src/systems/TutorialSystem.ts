import Phaser from 'phaser';
import { ARENA_BOTTOM, COLORS, DEPTH, FONT, GAME_W, RIGHT } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { ProgressStore } from './ProgressStore';

type Step = 'move' | 'skill' | 'pickup' | 'brew' | 'drink' | 'telegraph' | 'door' | 'stairs' | 'shop' | 'weapon';

const TEXT: Record<Step, string> = {
  move: '在畫面左半邊按住拖曳來移動，角色會自動攻擊最近的敵人',
  skill: '右下「技能」是角色專屬主動技，冷卻好就能用（鍵盤 E）',
  weapon: '武器掉落！碰它就能裝備，最多帶 2 把，用「換武器」切換（鍵盤 Q）',
  pickup: '敵人掉了素材！走過去撿起來，會放進坩堝',
  brew: '坩堝滿了！按「煉成」把藥水喝下去',
  drink: '藥水效果整局有效。光暈顏色＝稀有度，越稀有越容易「裂變」！',
  telegraph: '紅色區域是攻擊預警，按「衝刺」可以無敵閃過',
  door: '房間清空，門打開了！走進門探索下一間（右上角是小地圖）',
  stairs: '找到樓梯了！走上去前往下一層，會先拿到一張突變卡',
  shop: '商店：用打怪掉的金幣買素材、回血或突變卡',
};

/**
 * 第一次遊玩的情境提示：條件達成才顯示，每個提示只出現一次。
 * 全部看過（或第一局結束）就不再出現。
 */
export class TutorialSystem {
  private seen = new Set<Step>();
  private queue: Step[] = [];
  private current?: { step: Step; t: number };
  private box: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private arrow: Phaser.GameObjects.Text;
  readonly enabled: boolean;

  constructor(private game: GameScene, active = true) {
    this.enabled = active && !ProgressStore.data.tutorialDone;
    const bg = game.add.rectangle(0, 0, 680, 60, 0x1e1428, 0.94).setStrokeStyle(3, COLORS.gold, 1);
    this.text = game.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '21px', color: '#ffffff', align: 'center', wordWrap: { width: 650, useAdvancedWrap: true },
    }).setOrigin(0.5);
    this.box = game.add.container(GAME_W / 2 - 60, ARENA_BOTTOM - 46, [bg, this.text]).setDepth(DEPTH.overlay - 5).setAlpha(0);
    this.arrow = game.add.text(0, 0, '▼', { fontFamily: FONT, fontSize: '34px', color: '#ffd166', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(DEPTH.overlay - 4).setVisible(false);
    if (this.enabled) {
      this.notify('move');
      this.notify('skill');
    }
  }

  notify(step: Step): void {
    if (!this.enabled || this.seen.has(step)) return;
    this.seen.add(step);
    this.queue.push(step);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    const g = this.game;
    if (g.pickups.length) this.notify('pickup');
    if (g.crucible.filled === 3) this.notify('brew');

    if (!this.current && this.queue.length) {
      this.current = { step: this.queue.shift()!, t: 0 };
      this.text.setText(TEXT[this.current.step]);
      g.tweens.killTweensOf(this.box);
      this.box.setAlpha(0);
      g.tweens.add({ targets: this.box, alpha: 1, duration: 200 });
    }
    const c = this.current;
    if (!c) return;
    c.t += dt;

    // 指示箭頭
    let target: { x: number; y: number } | undefined;
    if (c.step === 'pickup' && g.pickups[0]) target = { x: g.pickups[0].x, y: g.pickups[0].y - 40 };
    if (c.step === 'brew') target = { x: RIGHT - 84, y: 410 };
    if (c.step === 'telegraph') target = { x: RIGHT - 100, y: 535 };
    if (c.step === 'skill') target = { x: RIGHT - 230, y: 586 };
    if (c.step === 'weapon') target = { x: RIGHT - 202, y: 450 };
    this.arrow.setVisible(!!target);
    if (target) this.arrow.setPosition(target.x, target.y + Math.sin(c.t * 8) * 6);

    const done =
      (c.step === 'move' && (c.t > 6 || Math.abs(g.player.x - GAME_W / 2) > 80)) ||
      (c.step === 'pickup' && (g.crucible.filled > 0 || c.t > 10)) ||
      (c.step === 'brew' && (g.crucible.filled < 3 || c.t > 15)) ||
      (['drink', 'telegraph', 'door', 'stairs', 'shop', 'skill', 'weapon'].includes(c.step) && c.t > 5);
    if (done) {
      this.current = undefined;
      this.arrow.setVisible(false);
      g.tweens.add({ targets: this.box, alpha: 0, duration: 200 });
      if (this.seen.size >= Object.keys(TEXT).length && !this.queue.length) this.finish();
    }
  }

  finish(): void {
    if (!this.enabled) return;
    ProgressStore.data.tutorialDone = true;
    ProgressStore.save();
  }
}
