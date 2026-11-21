import Phaser from 'phaser';
import { COLORS, FONT, GAME_W, RARITY } from '../config';
import { CHARACTERS, WEAPON_MAP, hexToInt } from '../data';
import { ProgressStore } from '../systems/ProgressStore';
import type { CharacterDef } from '../types';
import { textButton } from '../ui/widgets';

/** 選角：鎖住的角色顯示解鎖條件 */
export class CharacterSelectScene extends Phaser.Scene {
  private selected!: CharacterDef;
  private cards: { c: CharacterDef; bg: Phaser.GameObjects.Rectangle }[] = [];
  private detail!: Phaser.GameObjects.Text;
  private startBtn!: Phaser.GameObjects.Container;

  constructor() {
    super('CharacterSelect');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.cards = [];
    this.selected = ProgressStore.selected;
    this.add.text(GAME_W / 2, 70, '選擇角色', { fontFamily: FONT, fontSize: '46px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);

    CHARACTERS.forEach((c, i) => {
      const x = 190 + (i % 2) * 340;
      const y = 250 + Math.floor(i / 2) * 290;
      const unlocked = ProgressStore.isUnlocked(c);
      const rar = RARITY[c.rarity];
      const bg = this.add.rectangle(x, y, 320, 270, COLORS.panel, 1).setStrokeStyle(4, hexToInt(rar.color), unlocked ? 0.9 : 0.4)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, y - 110, rar.name, { fontFamily: FONT, fontSize: '18px', color: rar.color, fontStyle: 'bold' }).setOrigin(0.5);
      const hero = this.add.image(x, y - 40, 'hero').setDisplaySize(96, 96).setTint(unlocked ? hexToInt(c.color) : 0x2a2a2a);
      this.add.text(x, y + 30, c.name, { fontFamily: FONT, fontSize: '28px', color: unlocked ? '#ffffff' : '#666', fontStyle: 'bold' }).setOrigin(0.5);
      if (unlocked) {
        const s = c.stats;
        this.add.text(x, y + 80, `♥${s.hp}  攻${s.damage}  速${s.speed}\n射擊間隔 ${s.fireInterval}s`, {
          fontFamily: FONT, fontSize: '17px', color: COLORS.textDim, align: 'center', lineSpacing: 4,
        }).setOrigin(0.5);
      } else {
        hero.setAlpha(0.5);
        this.add.text(x, y - 40, '🔒', { fontSize: '40px' }).setOrigin(0.5);
        this.add.text(x, y + 80, `${c.unlock.text}\n（${ProgressStore.progressText(c)}）`, {
          fontFamily: FONT, fontSize: '17px', color: '#9a90a8', align: 'center', lineSpacing: 4,
        }).setOrigin(0.5);
      }
      bg.on('pointerup', () => {
        if (!unlocked) return;
        this.selected = c;
        this.refresh();
      });
      this.cards.push({ c, bg });
    });

    this.detail = this.add.text(GAME_W / 2, 830, '', {
      fontFamily: FONT, fontSize: '20px', color: '#ffffff', align: 'center', lineSpacing: 6,
      wordWrap: { width: 620, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    this.startBtn = textButton(this, GAME_W / 2, 1080, 420, 104, '出發！', () => {
      ProgressStore.select(this.selected.id);
      this.scene.start('Game');
    }, 0x7a4fc0);
    textButton(this, GAME_W / 2, 1195, 300, 72, '返回', () => this.scene.start('MainMenu'));
    this.refresh();
  }

  private refresh(): void {
    for (const { c, bg } of this.cards) {
      const on = c.id === this.selected.id;
      bg.setFillStyle(on ? 0x3a2f55 : COLORS.panel, 1);
      bg.setStrokeStyle(on ? 7 : 4, hexToInt(on ? '#ffffff' : RARITY[c.rarity].color), ProgressStore.isUnlocked(c) ? 1 : 0.4);
    }
    const c = this.selected;
    const w = WEAPON_MAP[c.startWeapon];
    this.detail.setText(`${c.name}：${c.desc}\n【被動・${c.passiveName}】${c.passiveDesc}\n【技能・${c.skill.name}】${c.skill.desc}（冷卻 ${c.skill.cooldown} 秒）\n初始武器：${w?.name ?? ''}`);
    this.startBtn.setAlpha(1);
  }
}
