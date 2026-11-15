import Phaser from 'phaser';
import { CHARACTERS, CHAR_ORDER, CharId, WEAPONS } from '../config/balance';
import { WANTED_RULES, wantedMods } from '../config/expansion';
import { COLORS, H, W, textStyle } from '../game/layout';
import { makeButton } from '../game/ui';
import { setupLogicalCamera } from '../game/ui';
import { formatTime, loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { claimableCount } from '../game/meta';
import { TAB_H, TOP_H, enter, goTo, lobbyBackground, openSettings, tabBar, topBar } from '../game/chrome';
import { dailyChallenge, todayKey } from '../config/meta';

/** 大廳：角色、出擊卡、側邊功能鈕 */
export class MenuScene extends Phaser.Scene {
  private charIdx = 0;
  private wanted = 0;

  constructor() {
    super('Menu');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playMusic('bgm-menu');
    const s = loadSave();
    this.charIdx = Math.max(0, CHAR_ORDER.indexOf(s.lastChar));
    this.wanted = Math.min(this.wanted, s.wantedUnlocked ?? 0);
    this.draw();
    enter(this);
  }

  private draw() {
    this.children.removeAll(true);
    this.tweens.killAll();
    const s = loadSave();
    lobbyBackground(this, 0.15);
    topBar(this, s);

    // 標誌
    const logoY = TOP_H + 70;
    if (this.textures.exists('ui-logo')) {
      const logo = this.add.image(W / 2, logoY, 'ui-logo');
      logo.setScale(380 / logo.texture.getSourceImage().width);
      this.tweens.add({ targets: logo, scale: logo.scale * 1.03, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.InOut' });
    } else this.add.text(W / 2, logoY, 'CYBER RONIN', textStyle(44)).setOrigin(0.5);

    // 角色（左右切換）
    const id: CharId = CHAR_ORDER[this.charIdx];
    const c = CHARACTERS[id];
    const owned = s.chars.includes(id);
    const heroY = H * 0.47;
    const ring = this.add.ellipse(W / 2, heroY + 6, 170, 40, COLORS.cyan, 0.18).setStrokeStyle(2, COLORS.cyan, 0.7);
    this.tweens.add({ targets: ring, alpha: 0.5, scaleX: 1.08, yoyo: true, repeat: -1, duration: 1300 });
    let hero: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
    if (this.textures.exists(`hd-${id}`)) {
      // 高清立繪＋程式做的呼吸起伏
      hero = this.add.image(W / 2, heroY + 22, `hd-${id}`).setOrigin(0.5, 1);
      const hs = 330 / hero.texture.getSourceImage().height;
      hero.setScale(hs);
      this.tweens.add({ targets: hero, scaleY: hs * 1.012, scaleX: hs * 0.995, yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.InOut' });
    } else if (this.anims.exists(`char-${id}-idle`)) {
      hero = this.add.sprite(W / 2, heroY + 18, `char-${id}-idle-0`).setOrigin(0.5, 0.9).setScale(2.1);
      (hero as Phaser.GameObjects.Sprite).play(`char-${id}-idle`);
    } else hero = this.add.image(W / 2, heroY - 80, `char-${id}`).setScale(1.6);
    if (!owned) hero.setTint(0x222233);
    // 點角色：做出攻擊動作
    hero.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      if (!(hero instanceof Phaser.GameObjects.Sprite)) {
        // 立繪：前衝一下並揮出刀光
        this.tweens.add({ targets: hero, x: W / 2 + 14, yoyo: true, duration: 90 });
        if (this.anims.exists('fx-slash')) {
          const fx = this.add.sprite(W / 2 + 40, heroY - 140, 'fx-slash-0').setBlendMode(Phaser.BlendModes.ADD).setScale(1.6);
          fx.play('fx-slash');
          fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
        }
        Audio.play('sfx-slash', 0.4);
        return;
      }
      if (hero instanceof Phaser.GameObjects.Sprite && this.anims.exists(`char-${id}-atk`)) {
        hero.play(`char-${id}-atk`);
        hero.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => hero instanceof Phaser.GameObjects.Sprite && hero.play(`char-${id}-idle`));
        Audio.play('sfx-slash', 0.4);
      }
    });
    const nameT = this.add.text(W / 2, heroY + 36, `${c.name}　${c.role}`, textStyle(18, owned ? '#ffffff' : '#8a86a8')).setOrigin(0.5);
    nameT.setStroke('#07060d', 4);
    const trait = this.add
      .text(W / 2, heroY + 60, owned ? `${WEAPONS[c.weapon].name}・${c.trait}` : `解鎖需要 ${c.cost} 信用點`, textStyle(13, owned ? '#ffd84d' : '#ff8a5d', false))
      .setOrigin(0.5);
    trait.setStroke('#07060d', 3);
    const arrow = (dx: number) =>
      makeButton(this, W / 2 + dx * 130, heroY - 70, 52, 52, dx < 0 ? '<' : '>', COLORS.cyan, () => {
        this.charIdx = (this.charIdx + dx + CHAR_ORDER.length) % CHAR_ORDER.length;
        this.draw();
      }, 22);
    arrow(-1);
    arrow(1);

    // 側邊功能鈕
    const claim = claimableCount(s);
    writeSave(s);
    const dc = dailyChallenge(todayKey());
    const sides: { x: number; y: number; icon: string; label: string; dot: number | boolean; act: () => void }[] = [
      { x: 38, y: TOP_H + 150, icon: 'ui-ic-daily', label: '每日挑戰', dot: s.dailyChallengeDay !== todayKey(), act: () => goTo(this, 'Missions', { tab: 'challenge' }) },
      { x: 38, y: TOP_H + 230, icon: 'ui-ic-trophy', label: '成就', dot: claim, act: () => goTo(this, 'Missions', { tab: 'ach' }) },
      { x: W - 38, y: TOP_H + 150, icon: 'ui-ic-settings', label: '設定', dot: false, act: () => openSettings(this) },
      { x: W - 38, y: TOP_H + 230, icon: 'ui-ic-codex', label: '圖鑑', dot: false, act: () => goTo(this, 'Codex') },
    ];
    void dc;
    for (const b of sides) {
      const circ = this.add.circle(b.x, b.y, 27, 0x14102a, 0.9).setStrokeStyle(2, COLORS.cyan, 0.8);
      if (this.textures.exists(b.icon)) {
        const im = this.add.image(b.x, b.y - 2, b.icon);
        im.setScale(40 / Math.max(im.texture.getSourceImage().width, im.texture.getSourceImage().height));
      }
      const lt = this.add.text(b.x, b.y + 34, b.label, textStyle(11, '#c9c6e0')).setOrigin(0.5);
      lt.setStroke('#07060d', 3);
      if (b.dot) {
        const d = this.add.circle(b.x + 20, b.y - 20, typeof b.dot === 'number' ? 10 : 6, 0xff2244).setStrokeStyle(2, 0x07060d);
        if (typeof b.dot === 'number') this.add.text(d.x, d.y, String(b.dot), textStyle(11)).setOrigin(0.5);
      }
      circ.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        Audio.play('sfx-click', 0.35);
        b.act();
      });
    }

    // 出擊卡
    const cardY = H - TAB_H - 220;
    const cw = 470;
    const chh = 150;
    if (this.textures.exists('ui-stage-slums')) {
      const pic = this.add.image(W / 2, cardY, 'ui-stage-slums');
      pic.setScale(Math.max((cw - 24) / pic.texture.getSourceImage().width, (chh - 20) / pic.texture.getSourceImage().height));
      pic.setCrop(0, 0, pic.texture.getSourceImage().width, pic.texture.getSourceImage().height);
      const m = this.make.graphics({}, false).fillRect(W / 2 - cw / 2 + 12, cardY - chh / 2 + 10, cw - 24, chh - 20);
      pic.setMask(m.createGeometryMask());
    } else this.add.rectangle(W / 2, cardY, cw - 24, chh - 20, 0x221a40);
    this.add.rectangle(W / 2, cardY + 30, cw - 24, 60, 0x07060d, 0.6);
    if (this.textures.exists('ui-frame-stage')) {
      this.add.nineslice(W / 2, cardY, 'ui-frame-stage', undefined, cw * 2, chh * 2, 120, 120, 110, 110).setScale(0.5);
    }
    const st = this.add.text(W / 2, cardY + 14, '霓虹貧民窟', textStyle(22, '#ffffff')).setOrigin(0.5);
    st.setStroke('#ff3d81', 5);
    const best = s.runs > 0 ? `最佳 ${formatTime(s.bestTime)}　擊殺 ${s.bestKills}` : '尚無紀錄';
    this.add.text(W / 2, cardY + 42, best, textStyle(13, '#c9c6e0', false)).setOrigin(0.5);
    // 通緝等級
    const maxW = s.wantedUnlocked ?? 0;
    const wy = cardY - chh / 2 - 22;
    if (maxW > 0) {
      const mods = wantedMods(this.wanted);
      const wl = this.add.text(W / 2, wy, this.wanted === 0 ? '通緝等級 0（標準）' : `通緝等級 ${this.wanted}　獎勵 ×${mods.reward.toFixed(1)}`, textStyle(15, '#ff8a5d')).setOrigin(0.5);
      wl.setStroke('#07060d', 4);
      makeButton(this, W / 2 - 150, wy, 40, 34, '-', 0xff6a3d, () => {
        this.wanted = Math.max(0, this.wanted - 1);
        this.draw();
      }, 18).setEnabled(this.wanted > 0);
      makeButton(this, W / 2 + 150, wy, 40, 34, '+', 0xff6a3d, () => {
        this.wanted = Math.min(maxW, this.wanted + 1);
        this.draw();
      }, 18).setEnabled(this.wanted < maxW);
      if (this.wanted > 0) {
        const r = this.add.text(W / 2, wy + 20, WANTED_RULES.slice(0, this.wanted).slice(-1)[0], textStyle(11, '#c9a9a0', false)).setOrigin(0.5);
        r.setStroke('#07060d', 3);
      }
    }

    // 出擊按鈕
    const by = H - TAB_H - 70;
    if (owned) {
      const start = makeButton(this, W / 2, by, 330, 78, '出　擊', COLORS.magenta, () => {
        const sv = loadSave();
        sv.lastChar = id;
        writeSave(sv);
        Audio.stopMusic();
        goTo(this, 'Game', { char: id, wanted: this.wanted });
      }, 32);
      this.tweens.add({ targets: start, scale: 1.04, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.InOut' });
    } else {
      makeButton(this, W / 2, by, 330, 78, `解鎖　◆ ${c.cost}`, COLORS.gold, () => {
        const sv = loadSave();
        if (sv.credits < c.cost) return;
        sv.credits -= c.cost;
        sv.chars.push(id);
        sv.lastChar = id;
        writeSave(sv);
        Audio.play('sfx-chest', 0.5);
        this.draw();
      }, 26).setEnabled(s.credits >= c.cost);
    }
    if (owned && id !== s.lastChar) {
      const sv = loadSave();
      sv.lastChar = id;
      writeSave(sv);
    }

    tabBar(this, 'Menu');
    this.input.keyboard?.once('keydown-ENTER', () => owned && goTo(this, 'Game', { char: id, wanted: this.wanted }));
  }
}
