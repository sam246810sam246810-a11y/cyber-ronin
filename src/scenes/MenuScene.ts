import Phaser from 'phaser';
import { canUnlock, starOf, unlockChar, unlockCost } from '../game/gacha';
import { MAX_STAR } from '../config/gacha';
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
import { STAGES } from '../config/stages';

/** 大廳：角色、出擊卡、側邊功能鈕 */
export class MenuScene extends Phaser.Scene {
  private charIdx = 0;
  private stageIdx = 0;
  private wanted = 0;

  constructor() {
    super('Menu');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playMusic('bgm-menu');
    const s = loadSave();
    this.charIdx = Math.max(0, CHAR_ORDER.indexOf(s.lastChar));
    this.stageIdx = Math.max(0, STAGES.findIndex((x) => x.id === s.lastStage));
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
    if (this.anims.exists(`live-${id}`)) {
      // SSR 動態立繪＋金色光暈
      const aura = this.add.ellipse(W / 2, heroY - 120, 300, 380, 0xffc83d, 0.1).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: aura, alpha: 0.25, scale: 1.06, yoyo: true, repeat: -1, duration: 1600 });
      ring.setStrokeStyle(2, 0xffd84d, 0.9).setFillStyle(0xffc83d, 0.2);
      hero = this.add.sprite(W / 2, heroY + 22, `live-${id}-0`).setOrigin(0.5, 1);
      hero.setScale(330 / hero.texture.getSourceImage().height);
      (hero as Phaser.GameObjects.Sprite).play(`live-${id}`);
    } else if (this.textures.exists(`hd-${id}`)) {
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
      if (!(hero instanceof Phaser.GameObjects.Sprite) || hero.anims.currentAnim?.key.startsWith('live-')) {
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
    if (owned) {
      const st = starOf(s, id);
      this.add.text(W / 2, heroY + 12, '★'.repeat(st) + '☆'.repeat(MAX_STAR - st), textStyle(16, '#ffd84d')).setOrigin(0.5).setStroke('#07060d', 4);
    }
    const trait = this.add
      .text(W / 2, heroY + 60, owned ? `${WEAPONS[c.weapon].name}・${c.trait}` : `從角色池抽到，或集滿碎片解鎖（${s.shards[id] ?? 0}/${unlockCost(id)}）`, textStyle(13, owned ? '#ffd84d' : '#ff8a5d', false))
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
    const stage = STAGES[this.stageIdx];
    const stageOpen = this.stageIdx === 0 || s.stagesCleared.includes(STAGES[this.stageIdx - 1].id);
    if (this.textures.exists(stage.card)) {
      const pic = this.add.image(W / 2, cardY, stage.card);
      pic.setScale(Math.max((cw - 24) / pic.texture.getSourceImage().width, (chh - 20) / pic.texture.getSourceImage().height));
      pic.setCrop(0, 0, pic.texture.getSourceImage().width, pic.texture.getSourceImage().height);
      const m = this.make.graphics({}, false).fillRect(W / 2 - cw / 2 + 12, cardY - chh / 2 + 10, cw - 24, chh - 20);
      pic.setMask(m.createGeometryMask());
      if (!stageOpen) pic.setTint(0x3a3452);
    } else this.add.rectangle(W / 2, cardY, cw - 24, chh - 20, 0x221a40);
    this.add.rectangle(W / 2, cardY + 30, cw - 24, 60, 0x07060d, 0.6);
    if (this.textures.exists('ui-frame-stage')) {
      this.add.nineslice(W / 2, cardY, 'ui-frame-stage', undefined, cw * 2, chh * 2, 120, 120, 110, 110).setScale(0.5);
    }
    const st = this.add.text(W / 2, cardY + 14, `${this.stageIdx + 1}. ${stage.name}`, textStyle(22, '#ffffff')).setOrigin(0.5);
    st.setStroke(stage.css, 5);
    const sb = s.stageBest[stage.id] ?? (stage.id === 'slums' && s.runs > 0 ? { time: s.bestTime, kills: s.bestKills } : null);
    const cleared = s.stagesCleared.includes(stage.id);
    const fc = stage.firstClear;
    const info = !stageOpen
      ? `通關「${STAGES[this.stageIdx - 1].name}」後解鎖`
      : `${'★'.repeat(this.stageIdx + 1)}　${sb ? `最佳 ${formatTime(sb.time)}　擊殺 ${sb.kills}` : '尚無紀錄'}${cleared ? '　已通關' : `　首通：晶片 ${fc.chips}`}`;
    this.add.text(W / 2, cardY + 42, info, textStyle(13, stageOpen ? '#c9c6e0' : '#ff8a5d', false)).setOrigin(0.5);
    if (stageOpen && stage.hazard !== 'none') this.add.text(W / 2, cardY - 52, stage.hazardDesc, textStyle(12, '#ffd84d', false)).setOrigin(0.5).setStroke('#07060d', 4);
    if (!stageOpen) this.add.text(W / 2, cardY - 22, '未解鎖', textStyle(24, '#ff8a5d')).setOrigin(0.5).setStroke('#07060d', 5);
    // 左右切換關卡
    const stArrow = (dx: number) =>
      makeButton(this, W / 2 + dx * 214, cardY, 40, 56, dx < 0 ? '<' : '>', stage.color, () => {
        this.stageIdx = (this.stageIdx + dx + STAGES.length) % STAGES.length;
        this.draw();
      }, 22);
    stArrow(-1);
    stArrow(1);
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
      const st0 = STAGES[this.stageIdx];
      const open = this.stageIdx === 0 || s.stagesCleared.includes(STAGES[this.stageIdx - 1].id);
      const start = makeButton(this, W / 2, by, 330, 78, open ? '出　擊' : '關卡未解鎖', COLORS.magenta, () => {
        const sv = loadSave();
        sv.lastChar = id;
        sv.lastStage = st0.id;
        writeSave(sv);
        Audio.stopMusic();
        goTo(this, 'Game', { char: id, wanted: this.wanted, stage: st0.id });
      }, open ? 32 : 24);
      start.setEnabled(open);
      if (open) this.tweens.add({ targets: start, scale: 1.04, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.InOut' });
    } else {
      if (canUnlock(s, id))
        makeButton(this, W / 2, by, 330, 78, '碎片解鎖', COLORS.gold, () => {
          const sv = loadSave();
          if (!unlockChar(sv, id)) return;
          sv.lastChar = id;
          writeSave(sv);
          Audio.play('sfx-levelup', 0.6);
          this.draw();
        }, 26);
      else makeButton(this, W / 2, by, 330, 78, '前往角色池', COLORS.magenta, () => goTo(this, 'Gacha', { pool: 'char' }), 26);
    }
    if (owned && id !== s.lastChar) {
      const sv = loadSave();
      sv.lastChar = id;
      writeSave(sv);
    }

    tabBar(this, 'Menu');
    this.input.keyboard?.once('keydown-ENTER', () => owned && goTo(this, 'Game', { char: id, wanted: this.wanted, stage: STAGES[this.stageIdx].id }));
  }
}
