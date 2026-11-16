import Phaser from 'phaser';
import { COLORS, H, W, textStyle } from '../game/layout';
import { makeButton, moduleIcon, setupLogicalCamera } from '../game/ui';
import { CONTENT_BOTTOM, CONTENT_TOP, enter, goTo, lobbyBackground, tabBar, topBar } from '../game/chrome';

import { SaveData, loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { vibrate } from '../game/haptics';
import { PullItem, canStarUp, canUnlock, unlockChar, unlockCost, feedJade, payMethod, pityLeft, pullPool, setComplete, spiritLv, spiritStats, starOf, starUp, starUpCost } from '../game/gacha';
import { MOD_RARITY, MODULE_BASES, StatKey, fmtStat, mainValue } from '../config/meta';
import { CHAR_POOL, CHAR_RARITY, DUP_SHARDS, SSR_UP_ROTATION, UNLOCK_SHARDS, currentUp, upEndsText, MAX_SPIRIT_LV, MAX_STAR, POOLS, POOL_ORDER, PoolId, SPIRITS, SPIRIT_SETS, STAR_PERKS, SpiritId, spiritNeed } from '../config/gacha';
import { CHARACTERS, CharId, WEAPONS } from '../config/balance';
import { ULTIMATES } from '../config/expansion';
import { playUltPreview } from '../game/ultPreview';

const RAR = ['N', 'R', 'SR', 'SSR'];

/** 抽卡：義體池、角色池、靈物池 */
export class GachaScene extends Phaser.Scene {
  private busy = false;
  private pool: PoolId = 'equip';

  constructor() {
    super('Gacha');
  }

  create(data?: { pool?: PoolId }) {
    setupLogicalCamera(this);
    Audio.playLobby();
    this.busy = false;
    if (data?.pool) this.pool = data.pool;
    this.draw();
    enter(this);
  }

  private draw() {
    this.children.removeAll(true);
    this.tweens.killAll();
    // 每個卡池有自己的主視覺背景
    const WEATHER = { equip: 'rain', char: 'petals', spirit: 'dust' } as const;
    lobbyBackground(this, this.textures.exists(`ui-pool-${this.pool}`) ? 0.3 : 0.6, `ui-pool-${this.pool}`, WEATHER[this.pool]);
    const s = loadSave();
    topBar(this, s);
    tabBar(this, 'Gacha');
    const P = POOLS[this.pool];

    POOL_ORDER.forEach((id, i) => {
      makeButton(this, W / 2 + (i - 1) * 168, CONTENT_TOP + 30, 156, 48, POOLS[id].name, POOLS[id].color, () => {
        if (this.busy || this.pool === id) return;
        this.pool = id;
        this.draw();
      }, 18).setActive2(this.pool === id);
    });

    const top = CONTENT_TOP + 64;
    const bottom = CONTENT_BOTTOM;
    const by = bottom - 150;
    const bannerY = (top + by - 120) / 2;
    this.colBottom = by - 146;
    this.drawBanner(s, bannerY, by - 130 - top);

    // 持有券、保底
    this.ticketBadge(W / 2 - 160, by - 100, this.pool, s.tickets[this.pool] ?? 0);
    // 保底進度條：越接近保底越亮
    const left = pityLeft(s, this.pool);
    const pct = 1 - left / P.pity;
    const bx = W / 2 - 70;
    const bw = 300;
    const pg = this.add.graphics();
    pg.fillStyle(0x07060d, 0.9).fillRoundedRect(bx, by - 112, bw, 24, 12);
    pg.fillGradientStyle(0xff8a3d, 0xffd84d, 0xff8a3d, 0xffd84d, 1).fillRect(bx + 3, by - 109, Math.max(4, (bw - 6) * pct), 18);
    pg.lineStyle(2, 0xffd84d, 0.6 + 0.4 * pct).strokeRoundedRect(bx, by - 112, bw, 24, 12);
    const pt = this.add.text(bx + bw / 2, by - 100, `保底 SSR 還有 ${left} 抽`, textStyle(13, '#ffffff')).setOrigin(0.5).setStroke('#07060d', 3);
    if (pct > 0.7) this.tweens.add({ targets: pt, scale: 1.08, yoyo: true, repeat: -1, duration: 500 });
    this.add.text(W / 2, by - 70, `SSR ${(P.rates[3] * 100).toFixed(0)}%　SR ${(P.rates[2] * 100).toFixed(0)}%　十連必出 SR 以上`, textStyle(13, '#ffd84d', false)).setOrigin(0.5).setStroke('#07060d', 3);

    const label = (n: 1 | 10) => {
      const pay = payMethod(s, this.pool, n);
      const name = n === 1 ? '單抽' : '十連';
      if (pay === 'ticket') return `${name}  ${P.ticket}×${n}`;
      return `${name}  晶片 ${n === 1 ? P.single : P.ten}`;
    };
    makeButton(this, W / 2 - 122, by, 216, 70, label(1), COLORS.cyan, () => this.doPull(1), 19).setEnabled(!!payMethod(s, this.pool, 1));
    makeButton(this, W / 2 + 122, by, 216, 70, label(10), COLORS.magenta, () => this.doPull(10), 19).setEnabled(!!payMethod(s, this.pool, 10));

    const sy = by + 78;
    makeButton(this, W / 2 - 92, sy, 164, 46, '機率說明', 0x888899, () => this.showRates(), 15);
    if (this.pool === 'equip') makeButton(this, W / 2 + 92, sy, 164, 46, '前往義體', COLORS.cyan, () => goTo(this, 'Armory'), 15);
    else if (this.pool === 'char') {
      const b = makeButton(this, W / 2 + 92, sy, 164, 46, '解鎖・升星', COLORS.magenta, () => this.showStars(), 15);
      if ((Object.keys(CHARACTERS) as CharId[]).some((c) => canStarUp(s, c) || canUnlock(s, c))) this.redDot(b.x + 74, sy - 18);
    } else {
      const b = makeButton(this, W / 2 + 92, sy, 164, 46, '式神圖鑑', COLORS.gold, () => this.showSpirits(), 15);
      if (s.jade > 0 && SPIRITS.some((x) => (s.spirits[x.id] ?? 0) > 0)) this.redDot(b.x + 74, sy - 18);
    }
  }

  private redDot(x: number, y: number) {
    this.add.circle(x, y, 8, 0xff3d3d).setStrokeStyle(2, 0x07060d);
  }

  /** 抽卡券圖示（程式繪製） */
  private ticketBadge(x: number, y: number, pool: PoolId, n: number) {
    const c = POOLS[pool].color;
    const g = this.add.graphics();
    g.fillStyle(0x0d0a18, 0.95).fillRoundedRect(x - 70, y - 18, 140, 36, 8);
    g.lineStyle(2, c, 0.9).strokeRoundedRect(x - 70, y - 18, 140, 36, 8);
    g.fillStyle(c, 1).fillRoundedRect(x - 62, y - 10, 30, 20, 3);
    g.fillStyle(0x0d0a18, 1).fillCircle(x - 62, y, 4).fillCircle(x - 32, y, 4);
    this.add.text(x - 24, y, `${POOLS[pool].ticket} ×${n}`, textStyle(15, '#ffffff')).setOrigin(0, 0.5);
  }

  private fitImage(key: string, x: number, y: number, maxW: number, maxH: number) {
    const img = this.add.image(x, y, key);
    const src = img.texture.getSourceImage();
    img.setScale(Math.min(maxW / src.width, maxH / src.height));
    return img;
  }

  /** 左側角色頭像欄最下面一個的位置上限（不要壓到抽卡券） */
  private colBottom = 0;

  private drawBanner(s: SaveData, cy: number, h: number) {
    if (this.pool === 'equip') {
      this.add.ellipse(W / 2, cy + h * 0.45, 300, 50, COLORS.magenta, 0.15);
      const m = this.fitImage(this.textures.exists('gacha-machine') ? 'gacha-machine' : 'pickup-chest', W / 2, cy, 360, h);
      m.setName('machine');
      this.tweens.add({ targets: m, y: cy - 4, yoyo: true, repeat: -1, duration: 1800, ease: 'Sine.InOut' });
      this.add.text(W / 2, cy + h / 2 - 6, '義體模組 12 種 × N～SSR', textStyle(14, '#7fd4ff')).setOrigin(0.5);
      return;
    }
    if (this.pool === 'char') {
      // 只主打本期 UP 的 SSR；其他角色頭像排在左側
      const up = currentUp();
      const live = (id: CharId, x: number, yb: number, hgt: number) => {
        let img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
        if (this.anims.exists(`live-${id}`)) {
          img = this.add.sprite(x, yb, `live-${id}-0`).setOrigin(0.5, 1);
          (img as Phaser.GameObjects.Sprite).play(`live-${id}`);
        } else img = this.add.image(x, yb, this.textures.exists(`hd-${id}`) ? `hd-${id}` : `char-${id}`).setOrigin(0.5, 1);
        img.setScale(hgt / img.texture.getSourceImage().height).setName('machine');
        img.setInteractive({ useHandCursor: true }).on('pointerup', () => this.showCharIntro(id));
        return img;
      };
      const base = cy + h / 2 - 70;
      const hx = W / 2 + 30;
      const glow = this.add.ellipse(hx, base - h * 0.4, 340, h * 0.85, 0xffc83d, 0.12).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, alpha: 0.26, yoyo: true, repeat: -1, duration: 1400 });
      live(up, hx, base - 38, h * 0.86); // 腳底留在「本期機率提升」上方
      // 名牌：金框＋上方一行「本期機率提升」
      const pw = 260;
      this.add.rectangle(hx, base + 18, pw, 54, 0x07060d, 0.88).setStrokeStyle(2, 0xffd84d, 0.95);
      this.add.text(hx - pw / 2 + 12, base + 18, 'SSR', textStyle(17, '#ffd84d')).setOrigin(0, 0.5);
      this.add.text(hx + 20, base + 9, CHARACTERS[up].name, textStyle(17, '#ffffff')).setOrigin(0.5);
      this.add.text(hx + 20, base + 31, CHARACTERS[up].role, textStyle(11, '#ffb0d8', false)).setOrigin(0.5);
      const tagY = base - 22;
      const tag = this.add.text(hx, tagY, '✦ 本期機率提升 ✦', textStyle(15, '#ffe9a0')).setOrigin(0.5).setStroke('#5a3a00', 4);
      const lines = this.add.graphics();
      lines.lineStyle(2, 0xffd84d, 0.8).lineBetween(hx - 150, tagY, hx - tag.width / 2 - 8, tagY).lineBetween(hx + tag.width / 2 + 8, tagY, hx + 150, tagY);
      this.tweens.add({ targets: tag, alpha: 0.65, yoyo: true, repeat: -1, duration: 900 });
      this.add.text(hx, base + 58, `點角色看介紹與試看大招　本期至 ${upEndsText()}`, textStyle(11, '#c9c6e0', false)).setOrigin(0.5).setStroke('#07060d', 3);
      // 左側直排：其他 SSR（金框）＋ SR（紫框）
      const others = SSR_UP_ROTATION.filter((c) => c !== up);
      const srs = (Object.keys(CHARACTERS) as CharId[]).filter((c) => CHAR_RARITY[c] === 2);
      const sx = 34;
      let y = cy - h / 2 + 70;
      const head = (label: string, color: string) => {
        this.add.text(sx, y, label, textStyle(13, color)).setOrigin(0.5).setStroke('#07060d', 3);
        y += 28;
      };
      const icon = (c: CharId, ring: number) => {
        const key = this.textures.exists(`avatar-${c}`) ? `avatar-${c}` : `char-${c}`;
        this.add.circle(sx, y, 21, 0x07060d, 0.85);
        const im = this.add.image(sx, y, key);
        im.setScale(38 / im.width);
        this.add.circle(sx, y, 20).setStrokeStyle(2, ring, 0.95);
        im.setInteractive({ useHandCursor: true }).on('pointerup', () => this.showCharIntro(c));
        y += step;
      };
      // 角色變多時自動縮小間距，最後一個頭像不壓到下方的抽卡券
      const n = others.length + srs.length;
      const step = Math.min(54, (this.colBottom - (y + 28 + 4 + 28)) / Math.max(1, n - 1));
      head('SSR', '#ffd84d');
      others.forEach((c) => icon(c, 0xffd84d));
      y += 4;
      head('SR', '#c48bff');
      srs.forEach((c) => icon(c, 0xb46bff));
      return;
    }
    // 靈物池
    const ring = this.add.circle(W / 2, cy, h * 0.42, 0xffc83d, 0.08).setStrokeStyle(2, 0xffc83d, 0.5);
    this.tweens.add({ targets: ring, scale: 1.06, alpha: 0.6, yoyo: true, repeat: -1, duration: 1600 });
    const others = SPIRITS.filter((x) => x.rarity < 3);
    const orbit = this.add.container(W / 2, cy);
    others.forEach((sp, i) => {
      const a = (i / others.length) * Math.PI * 2;
      const img = this.add.image(Math.cos(a) * h * 0.4, Math.sin(a) * h * 0.4, `spirit-${sp.id}`).setScale(0.36);
      if (!(s.spirits[sp.id] ?? 0)) img.setTint(0x403a58);
      orbit.add(img);
    });
    this.tweens.add({ targets: orbit, angle: 360, repeat: -1, duration: 40000 });
    orbit.list.forEach((o) => this.tweens.add({ targets: o, angle: -360, repeat: -1, duration: 40000 }));
    const k = this.add.image(W / 2 - 64, cy, 'spirit-kyubi').setScale(1.15);
    const d = this.add.image(W / 2 + 64, cy, 'spirit-dragon').setScale(1.15);
    k.setName('machine');
    this.tweens.add({ targets: [k, d], y: cy - 6, yoyo: true, repeat: -1, duration: 1700, ease: 'Sine.InOut' });
    this.add.text(W / 2, cy - h / 2 + 10, 'SSR 式神：九尾、龍神', textStyle(16, '#ffd84d')).setOrigin(0.5).setStroke('#07060d', 4);
    const st = spiritStats(s);
    const summary = (Object.entries(st) as [StatKey, number][]).slice(0, 3).map(([kk, v]) => fmtStat(kk, v)).join('、');
    this.add
      .text(W / 2, cy + h / 2 - 6, summary ? `目前式神加成：${summary}${Object.keys(st).length > 3 ? '…' : ''}` : '收集式神：永久提升能力值，重複抽到會升級', textStyle(13, '#ffffff', false))
      .setOrigin(0.5)
      .setStroke('#07060d', 4);
  }

  private doPull(n: 1 | 10) {
    if (this.busy) return;
    const s = loadSave();
    const res = pullPool(s, this.pool, n);
    if (!res) return;
    writeSave(s);
    this.busy = true;
    const best = Math.max(...res.map((m) => m.rarity));
    const col = MOD_RARITY[best].color;
    Audio.play('sfx-chest', 0.5);
    vibrate(40);
    // 全螢幕演出：暗場 → 機器放大搖晃、燈光閃爍 → 膠囊掉出彈跳 → 打開時依稀有度放出光柱
    const show = this.add.container(0, 0).setDepth(15);
    const dark = this.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0).setInteractive();
    show.add(dark);
    this.tweens.add({ targets: dark, fillAlpha: 0.92, duration: 250 });
    const mKey = this.textures.exists('gacha-machine') ? 'gacha-machine' : 'pickup-chest';
    const machine = this.add.image(W / 2, H * 0.4, mKey);
    const ms = (W * 0.75) / Math.max(machine.width, machine.height);
    machine.setScale(ms * 0.8).setAlpha(0);
    show.add(machine);
    this.tweens.add({ targets: machine, scale: ms, alpha: 1, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: machine, angle: { from: -5, to: 5 }, yoyo: true, repeat: 5, duration: 60, delay: 300, onComplete: () => machine.setAngle(0) });
    // 機器周圍的燈
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const lamp = this.add.circle(W / 2 + Math.cos(a) * 190, H * 0.4 + Math.sin(a) * 210, 9, [0xff3d81, 0x3df5ff, 0xffd84d][i % 3], 0.9).setBlendMode(Phaser.BlendModes.ADD);
      show.add(lamp);
      this.tweens.add({ targets: lamp, alpha: 0.15, yoyo: true, repeat: -1, duration: 120, delay: i * 40 });
    }
    const capKey = `capsule-${best}`;
    const cap = this.add.image(W / 2, H * 0.52, this.textures.exists(capKey) ? capKey : 'gem3').setScale(0.4).setAlpha(0);
    show.add(cap);
    this.tweens.add({ targets: cap, alpha: 1, y: H * 0.7, scale: 1.8, delay: 750, duration: 500, ease: 'Bounce.Out' });
    this.time.delayedCall(1350, () => {
      // 膠囊打開：光柱
      this.tweens.add({ targets: cap, scale: 2.6, alpha: 0, duration: 200 });
      const beams = best === 3 ? 5 : best === 2 ? 3 : 1;
      for (let i = 0; i < beams; i++) {
        const c = best === 3 ? [0xffc83d, 0xff8ac8, 0x3df5ff, 0x5dff7a, 0xb46bff][i] : col;
        const pillar = this.add.rectangle(W / 2 + (i - (beams - 1) / 2) * 60, H / 2, 70, H * 1.2, c, 0.55).setBlendMode(Phaser.BlendModes.ADD);
        show.add(pillar);
        this.tweens.add({ targets: pillar, alpha: 0, scaleX: 3, duration: 900 });
      }
      Audio.play(best >= 3 ? 'sfx-gacha-ssr' : best >= 2 ? 'sfx-gacha-sr' : 'sfx-gem', 0.7);
      if (best === 3) {
        this.cameras.main.flash(500, 255, 210, 80);
        vibrate(150);
      } else vibrate(50);
      const ssrChar = res.find((it) => it.kind === 'char' && it.rarity === 3);
      this.time.delayedCall(600, () => {
        show.destroy();
        if (ssrChar && ssrChar.kind === 'char') this.ssrReveal(ssrChar.char, () => this.showResults(res));
        else this.showResults(res);
      });
    });
  }

  /** 角色介紹：立繪、能力、專屬武器、大招說明＋試看大招 */
  private showCharIntro(id: CharId) {
    const c = CHARACTERS[id];
    const u = ULTIMATES[id];
    const w = WEAPONS[c.weapon];
    const r = CHAR_RARITY[id];
    const layer = this.add.container(0, 0).setDepth(25);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.92).setInteractive());
    const top = CONTENT_TOP + 20;
    const key = this.textures.exists(`hd-${id}`) ? `hd-${id}` : `char-${id}`;
    const img = this.add.image(W / 2 - 120, top + 340, key).setOrigin(0.5, 1);
    img.setScale(320 / img.height);
    layer.add(img);
    layer.add(this.add.text(W / 2 + 10, top + 40, MOD_RARITY[r].name, textStyle(24, MOD_RARITY[r].css)).setOrigin(0, 0).setStroke('#07060d', 4));
    layer.add(this.add.text(W / 2 + 10, top + 76, c.name, textStyle(24, '#ffffff')).setOrigin(0, 0).setStroke('#07060d', 4));
    layer.add(this.add.text(W / 2 + 10, top + 112, c.role, textStyle(15, '#ffb0d8')).setOrigin(0, 0));
    layer.add(this.add.text(W / 2 + 10, top + 146, `生命 ${c.maxHp}\n移動 ${Math.round(c.speedMult * 100)}%${c.armor ? `\n護甲 ${c.armor}` : ''}`, { ...textStyle(14, '#c9c6e0', false), lineSpacing: 6 }).setOrigin(0, 0));
    const lines = [`特性：${c.trait}`, '', `專屬武器「${w.name}」`, w.desc.replace('專屬武器：', ''), '', `大招「${u.name}」`];
    layer.add(this.add.text(36, top + 360, lines.join('\n'), { ...textStyle(14, '#ffffff', false), wordWrap: { width: 470, useAdvancedWrap: true }, lineSpacing: 6 }).setOrigin(0, 0));
    layer.add(makeButton(this, W / 2 - 110, CONTENT_BOTTOM - 40, 200, 58, '試看大招', u.color, () => playUltPreview(this, id), 20));
    layer.add(makeButton(this, W / 2 + 110, CONTENT_BOTTOM - 40, 200, 58, '關閉', COLORS.cyan, () => layer.destroy(), 20));
  }

  /** SSR 角色登場演出：金色光柱 → 動態立繪登場 → 名字打字效果 */
  private ssrReveal(id: CharId, done: () => void) {
    const layer = this.add.container(0, 0).setDepth(20);
    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x07060d, 1).setInteractive();
    layer.add(bg);
    Audio.play('sfx-gacha-ssr', 0.8);
    vibrate(200);
    this.cameras.main.flash(500, 255, 220, 120);
    // 金色光柱
    for (let i = 0; i < 7; i++) {
      const beam = this.add.rectangle(W / 2 + (i - 3) * 80, H / 2, 40 + Math.random() * 40, H * 1.4, 0xffc83d, 0.18).setAngle(-8 + Math.random() * 16).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(beam);
      this.tweens.add({ targets: beam, alpha: 0.45, yoyo: true, repeat: -1, duration: 500 + i * 80 });
    }
    const halo = this.add.circle(W / 2, H * 0.42, 220, 0xffd84d, 0.18).setBlendMode(Phaser.BlendModes.ADD);
    layer.add(halo);
    this.tweens.add({ targets: halo, scale: 1.15, alpha: 0.35, yoyo: true, repeat: -1, duration: 900 });
    // 立繪（有動態立繪就用動態）
    let hero: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
    if (this.anims.exists(`live-${id}`)) {
      hero = this.add.sprite(W / 2, H * 0.78, `live-${id}-0`).setOrigin(0.5, 1);
      (hero as Phaser.GameObjects.Sprite).play(`live-${id}`);
    } else hero = this.add.image(W / 2, H * 0.78, this.textures.exists(`hd-${id}`) ? `hd-${id}` : `char-${id}`).setOrigin(0.5, 1);
    const hs = (H * 0.62) / hero.texture.getSourceImage().height;
    hero.setScale(hs * 1.3).setAlpha(0).setY(H * 0.86);
    layer.add(hero);
    this.tweens.add({ targets: hero, scale: hs, alpha: 1, y: H * 0.78, duration: 650, delay: 350, ease: 'Cubic.Out' });
    // 金色粒子往上飄
    for (let i = 0; i < 40; i++) {
      const p = this.add.circle(Math.random() * W, H + 10, 2 + Math.random() * 3, Math.random() < 0.6 ? 0xffd84d : 0xff8ac8, 0.9).setBlendMode(Phaser.BlendModes.ADD);
      layer.add(p);
      this.tweens.add({ targets: p, y: -20, x: p.x + (Math.random() - 0.5) * 100, alpha: 0, duration: 1600 + Math.random() * 1200, delay: Math.random() * 1500, repeat: -1 });
    }
    const ssr = this.add.text(W / 2, H * 0.1, 'SSR', textStyle(66, '#ffd84d')).setOrigin(0.5).setStroke('#7a4a00', 8).setScale(3).setAlpha(0);
    ssr.setShadow(0, 0, '#ffc83d', 24, true, true);
    layer.add(ssr);
    this.tweens.add({ targets: ssr, scale: 1, alpha: 1, delay: 900, duration: 260, ease: 'Back.Out' });
    // 名字一個字一個字打出來
    const full = CHARACTERS[id].name;
    const nameT = this.add.text(W / 2, H * 0.84, '', textStyle(33, '#ffffff')).setOrigin(0.5).setStroke('#ff4fa0', 6);
    layer.add(nameT);
    const role = this.add.text(W / 2, H * 0.89, CHARACTERS[id].role, textStyle(16, '#ffd84d')).setOrigin(0.5).setAlpha(0).setStroke('#07060d', 4);
    layer.add(role);
    for (let i = 1; i <= full.length; i++) this.time.delayedCall(1200 + i * 110, () => nameT.setText(full.slice(0, i)));
    this.tweens.add({ targets: role, alpha: 1, delay: 1300 + full.length * 110, duration: 300 });
    const hint = this.add.text(W / 2, H * 0.95, '點一下繼續', textStyle(14, COLORS.dim, false)).setOrigin(0.5).setAlpha(0);
    layer.add(hint);
    this.tweens.add({ targets: hint, alpha: 1, delay: 2200, duration: 300 });
    const openedAt = this.time.now;
    bg.on('pointerup', () => {
      if (this.time.now - openedAt < 1500) return;
      layer.destroy();
      done();
    });
  }

  /** 一張結果卡：稀有度外框＋圖＋名稱＋說明 */
  private itemCard(x: number, y: number, size: number, it: PullItem) {
    if (it.kind === 'module') return { card: moduleIcon(this, x, y, size, it.module), name: MODULE_BASES.find((b) => b.id === it.module.base)!.name, note: '' };
    const c = this.add.container(x, y);
    const r = MOD_RARITY[it.rarity];
    c.add(this.add.rectangle(0, 0, size - 6, size - 6, r.color, it.rarity === 3 ? 0.2 : it.rarity === 2 ? 0.12 : 0.05));
    c.add(this.add.rectangle(0, 0, size, size, 0x0d0a18, 0.6).setStrokeStyle(it.rarity >= 2 ? 3 : 2, r.color, 1));
    let name = '';
    let note = '';
    const fit = (key: string, k = 0.8) => {
      const img = this.add.image(0, 0, key);
      const src = img.texture.getSourceImage();
      img.setScale((size * k) / Math.max(src.width, src.height));
      c.add(img);
      return img;
    };
    if (it.kind === 'char') {
      fit(this.textures.exists(`portrait-${it.char}`) ? `portrait-${it.char}` : `char-${it.char}`, 0.86);
      name = CHARACTERS[it.char].name;
      note = it.isNew ? 'NEW!' : `碎片 +${it.shards}`;
    } else if (it.kind === 'shards') {
      if (it.char === 'wild') {
        const g = this.add.graphics();
        g.fillStyle(0xffc83d, 1).fillPoints([new Phaser.Math.Vector2(0, -size * 0.3), new Phaser.Math.Vector2(size * 0.22, 0), new Phaser.Math.Vector2(0, size * 0.3), new Phaser.Math.Vector2(-size * 0.22, 0)], true);
        g.fillStyle(0xffffff, 0.6).fillPoints([new Phaser.Math.Vector2(0, -size * 0.3), new Phaser.Math.Vector2(size * 0.08, -size * 0.05), new Phaser.Math.Vector2(-size * 0.1, -size * 0.02)], true);
        c.add(g);
        name = '萬能碎片';
      } else {
        fit(this.textures.exists(`portrait-${it.char}`) ? `portrait-${it.char}` : `char-${it.char}`, 0.6).setAlpha(0.75);
        name = `${CHARACTERS[it.char].name.split('・')[1] ?? ''} 碎片`;
      }
      note = `×${it.amount}`;
    } else if (it.kind === 'spirit') {
      fit(`spirit-${it.spirit}`, 0.9);
      name = SPIRITS.find((x) => x.id === it.spirit)!.name;
      note = it.isNew ? 'NEW!' : it.lvUp ? `Lv ${it.lv}！` : '經驗 +1';
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x2bd96b, 0.25).fillCircle(0, 0, size * 0.3);
      g.fillStyle(0x5dff7a, 1).fillCircle(0, 0, size * 0.2);
      g.fillStyle(0xffffff, 0.7).fillCircle(-size * 0.06, -size * 0.07, size * 0.06);
      c.add(g);
      name = '靈玉';
      note = `×${it.amount}`;
    }
    const rt = this.add.text(-size / 2 + 4, -size / 2 + 2, r.name, textStyle(11, r.css)).setOrigin(0, 0).setStroke('#07060d', 3);
    c.add(rt);
    if (note) {
      const nt = this.add.text(size / 2 - 3, size / 2 - 2, note, textStyle(11, note === 'NEW!' ? '#ff6a9a' : '#ffffff')).setOrigin(1, 1).setStroke('#07060d', 3);
      c.add(nt);
    }
    c.setSize(size, size);
    return { card: c, name, note };
  }

  private showResults(res: PullItem[]) {
    const layer = this.add.container(0, 0).setDepth(10);
    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.92).setInteractive();
    layer.add(bg);
    layer.add(this.add.text(W / 2, 150, res.length === 1 ? '抽卡結果' : '十連結果', textStyle(30, '#ffd84d')).setOrigin(0.5));
    const cols = res.length === 1 ? 1 : 5;
    const size = res.length === 1 ? 160 : 92;
    const flips: (() => void)[] = [];
    res.forEach((it, i) => {
      const x = W / 2 + ((i % cols) - (cols - 1) / 2) * (size + 8);
      const y = (res.length === 1 ? 330 : 260) + Math.floor(i / cols) * (size + 46);
      // 背面：依稀有度發光的卡背
      const back = this.add.container(x, y);
      const rc = MOD_RARITY[it.rarity].color;
      back.add(this.add.rectangle(0, 0, size, size, 0x1a1430, 1).setStrokeStyle(3, it.rarity >= 2 ? rc : 0x3a3168, 1));
      back.add(this.add.text(0, 0, '?', textStyle(size * 0.4, it.rarity >= 2 ? MOD_RARITY[it.rarity].css : '#5a5678')).setOrigin(0.5));
      if (it.rarity >= 2) this.tweens.add({ targets: back, alpha: 0.75, yoyo: true, repeat: -1, duration: 300 });
      back.setScale(0);
      this.tweens.add({ targets: back, scale: 1, delay: i * 60, duration: 200, ease: 'Back.Out' });
      layer.add(back);
      const { card, name } = this.itemCard(x, y, size, it);
      card.setVisible(false);
      const t = this.add.text(x, y + size / 2 + 6, name, textStyle(12, MOD_RARITY[it.rarity].css, false)).setOrigin(0.5, 0).setAlpha(0);
      layer.add([card, t]);
      let flipped = false;
      const flip = () => {
        if (flipped) return;
        flipped = true;
        this.tweens.killTweensOf(back);
        this.tweens.add({
          targets: back,
          scaleX: 0,
          duration: 120,
          onComplete: () => {
            back.destroy();
            card.setVisible(true).setScale(0, 1);
            this.tweens.add({ targets: card, scaleX: 1, duration: 140, ease: 'Back.Out' });
            this.tweens.add({ targets: t, alpha: 1, duration: 200 });
            if (it.rarity >= 2) {
              Audio.play('sfx-gem', 0.5);
              const burst = this.add.circle(x, y, size * 0.5, rc, 0.5).setBlendMode(Phaser.BlendModes.ADD);
              layer.add(burst);
              this.tweens.add({ targets: burst, scale: 2, alpha: 0, duration: 400, onComplete: () => burst.destroy() });
            }
            if (it.rarity === 3) {
              const shine = this.add.rectangle(x, y, size + 10, size + 10, 0xffc83d, 0).setStrokeStyle(3, 0xffe08a, 1);
              this.tweens.add({ targets: shine, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });
              layer.add(shine);
            }
          },
        });
      };
      flips.push(flip);
      back.setSize(size, size).setInteractive({ useHandCursor: true }).on('pointerup', flip);
      if (res.length === 1 && it.kind === 'module') {
        const base = MODULE_BASES.find((b2) => b2.id === it.module.base)!;
        const lines = [fmtStat(base.main, mainValue(it.module)), ...it.module.subs.map((x2) => fmtStat(x2.key, x2.value))];
        layer.add(this.add.text(W / 2, y + size / 2 + 34, lines.join('\n'), { ...textStyle(15, '#c9c6e0', false), align: 'center' }).setOrigin(0.5, 0));
      }
    });
    // 一張一張自動翻開；點按鈕可以全部翻開
    flips.forEach((f, i) => this.time.delayedCall(500 + i * 220, f));
    const ok = makeButton(this, W / 2, H - 150, 260, 64, '確定', COLORS.cyan, () => {
      if (flips.length > 1) flips.forEach((f) => f());
      this.busy = false;
      this.draw();
    }, 22);
    const all = makeButton(this, W / 2, H - 230, 200, 48, '全部翻開', 0x888899, () => flips.forEach((f) => f()), 16);
    layer.add([all, ok]);
  }

  private overlay(title: string) {
    const layer = this.add.container(0, 0).setDepth(10);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.94).setInteractive());
    layer.add(this.add.text(W / 2, CONTENT_TOP + 40, title, textStyle(28, '#ffd84d')).setOrigin(0.5));
    return layer;
  }

  private showRates() {
    const P = POOLS[this.pool];
    const layer = this.overlay(`${P.name}　機率說明`);
    const rows = P.rates.map((r, i) => `${RAR[i]}　${(r * 100).toFixed(1)}%`);
    const detail: Record<PoolId, string[]> = {
      equip: ['N～SSR：義體模組（12 種平均），稀有度越高副屬性越多'],
      char: [
        `N：隨機一名角色的碎片 ×${CHAR_POOL.nShards}`,
        `R：隨機一名角色的碎片 ×${CHAR_POOL.rShards}`,
        `SR：SR 角色本身（平均）；已擁有則換成碎片 ×${DUP_SHARDS[2]}`,
        `SSR：SSR 角色本身；已擁有則換成碎片 ×${DUP_SHARDS[3]}`,
        `本期 UP：${CHARACTERS[currentUp()].name}（抽到 SSR 時有 70% 是 UP 角色，每週一輪替）`,
        `碎片集滿 ${UNLOCK_SHARDS[2]}（SSR ${UNLOCK_SHARDS[3]}）也能直接解鎖角色`,
      ],
      spirit: ['N：靈玉 ×1（可以餵給任何已擁有的式神）', 'R／SR／SSR：該稀有度的式神（同稀有度平均）', `重複抽到會升級，最高 Lv ${MAX_SPIRIT_LV}`],
    };
    layer.add(
      this.add
        .text(
          W / 2,
          CONTENT_TOP + 90,
          [...rows, '', ...detail[this.pool], '', '・十連抽保證至少一個 SR 以上', `・連續 ${P.pity} 抽沒有 SSR 時，第 ${P.pity} 抽必定是 SSR`, '・保底計數各池分開，抽到 SSR 後歸零', `・${P.ticket}可以代替晶片抽這一池`].join('\n'),
          { ...textStyle(16, '#c9c6e0', false), align: 'left', lineSpacing: 9, wordWrap: { width: 470 } },
        )
        .setOrigin(0.5, 0),
    );
    layer.add(makeButton(this, W / 2, CONTENT_BOTTOM - 40, 220, 58, '關閉', COLORS.cyan, () => layer.destroy(), 20));
  }

  /** 角色升星面板 */
  private showStars() {
    const layer = this.overlay('角色解鎖・升星');
    const s = loadSave();
    layer.add(this.add.text(W / 2, CONTENT_TOP + 76, `萬能碎片 ×${s.wildShards}`, textStyle(15, '#ffd84d')).setOrigin(0.5));
    const ids = Object.keys(CHARACTERS) as CharId[];
    // 角色變多時自動縮小每列高度，整個清單放得進關閉按鈕上方
    const listTop = CONTENT_TOP + 100;
    const listBottom = CONTENT_BOTTOM - 116;
    const rowH = Math.min(116, (listBottom - listTop) / ids.length);
    const ph = rowH - 12;
    ids.forEach((id, i) => {
      const y = listTop + rowH * (i + 0.5);
      const st = starOf(s, id);
      layer.add(this.add.rectangle(W / 2, y, 510, rowH - 6, COLORS.panel, 0.96).setStrokeStyle(2, MOD_RARITY[CHAR_RARITY[id]].color, 0.8));
      const pk = this.textures.exists(`portrait-${id}`) ? `portrait-${id}` : `char-${id}`;
      const p = this.add.image(26 + ph / 2, y, pk);
      p.setScale(ph / Math.max(p.width, p.height));
      if (!st) p.setTint(0x403a58);
      layer.add(p);
      const tx = 40 + ph;
      layer.add(this.add.text(tx, y - ph / 2 - 3, `${CHARACTERS[id].name}　${RAR[CHAR_RARITY[id]]}`, textStyle(15, '#ffffff')).setOrigin(0, 0));
      layer.add(this.add.text(tx, y + 7, st ? '★'.repeat(st) + '☆'.repeat(MAX_STAR - st) : '尚未擁有', textStyle(14, st ? '#ffd84d' : COLORS.dim)).setOrigin(0, 0.5));
      const cost = starUpCost(s, id);
      const own = s.shards[id] ?? 0;
      const need = st ? cost : unlockCost(id);
      layer.add(this.add.text(tx + 128, y, st >= MAX_STAR ? '已滿星' : st ? `下一星：${STAR_PERKS[st]}` : `抽到或集滿碎片解鎖`, { ...textStyle(11, '#c9c6e0', false), wordWrap: { width: W - 134 - (tx + 128), useAdvancedWrap: true } }).setOrigin(0, 0.5));
      layer.add(this.add.text(tx, y + ph / 2, `碎片 ${own}${need ? ` / ${need}` : ''}`, textStyle(12, COLORS.dim, false)).setOrigin(0, 1));
      if (!st) {
        const b = makeButton(this, W - 72, y, 100, Math.min(52, rowH - 22), '解鎖', COLORS.gold, () => {
          const save = loadSave();
          if (!unlockChar(save, id)) return;
          writeSave(save);
          Audio.play('sfx-levelup', 0.6);
          vibrate(80);
          layer.destroy();
          this.draw();
          this.showStars();
        }, 18);
        b.setEnabled(canUnlock(s, id));
        layer.add(b);
      }
      if (st && st < MAX_STAR) {
        const b = makeButton(this, W - 72, y, 100, Math.min(52, rowH - 22), '升星', COLORS.magenta, () => {
          const save = loadSave();
          if (!starUp(save, id)) return;
          writeSave(save);
          Audio.play('sfx-levelup', 0.6);
          vibrate(60);
          layer.destroy();
          this.draw();
          this.showStars();
        }, 18);
        b.setEnabled(canStarUp(s, id));
        layer.add(b);
      }
    });
    layer.add(this.add.text(W / 2, CONTENT_BOTTOM - 98, '碎片不夠時會自動使用萬能碎片', textStyle(13, COLORS.dim, false)).setOrigin(0.5));
    layer.add(makeButton(this, W / 2, CONTENT_BOTTOM - 40, 220, 58, '關閉', COLORS.cyan, () => layer.destroy(), 20));
  }

  /** 式神圖鑑：等級、加成、組合 */
  private showSpirits() {
    const layer = this.overlay('式神圖鑑');
    const s = loadSave();
    layer.add(this.add.text(W / 2, CONTENT_TOP + 76, `靈玉 ×${s.jade}　點已擁有的式神可以餵靈玉`, textStyle(14, '#7dff8a', false)).setOrigin(0.5));
    const cell = 108;
    SPIRITS.forEach((sp, i) => {
      const x = W / 2 + ((i % 4) - 1.5) * (cell + 6);
      const y = CONTENT_TOP + 150 + Math.floor(i / 4) * (cell + 30);
      const copies = s.spirits[sp.id] ?? 0;
      const lv = spiritLv(s, sp.id);
      const r = MOD_RARITY[sp.rarity];
      const bg = this.add.rectangle(x, y, cell, cell, 0x0d0a18, 0.95).setStrokeStyle(2, r.color, lv ? 1 : 0.3);
      const img = this.add.image(x, y - 6, `spirit-${sp.id}`).setScale(0.66);
      if (!lv) img.setTint(0x2a2440).setAlpha(0.8);
      layer.add([bg, img]);
      layer.add(this.add.text(x - cell / 2 + 4, y - cell / 2 + 2, r.name, textStyle(11, r.css)).setOrigin(0, 0).setStroke('#07060d', 3));
      layer.add(this.add.text(x + cell / 2 - 4, y - cell / 2 + 2, lv ? `Lv${lv}` : '', textStyle(11, '#ffffff')).setOrigin(1, 0).setStroke('#07060d', 3));
      layer.add(this.add.text(x, y + cell / 2 - 14, lv ? fmtStat(sp.stat, sp.per * lv).replace(' ', '') : sp.name, textStyle(11, lv ? '#ffffff' : COLORS.dim, false)).setOrigin(0.5).setStroke('#07060d', 3));
      layer.add(this.add.text(x, y + cell / 2 + 4, lv >= MAX_SPIRIT_LV ? `${sp.name}・滿級` : lv ? `${sp.name}・再 ${spiritNeed(copies)} 份升級` : '未取得', textStyle(11, lv ? '#c9c6e0' : '#5a5678', false)).setOrigin(0.5, 0));
      if (lv) {
        bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          const save = loadSave();
          if (!feedJade(save, sp.id)) return;
          writeSave(save);
          Audio.play('sfx-gem', 0.5);
          layer.destroy();
          this.draw();
          this.showSpirits();
        });
      }
    });
    const sy = CONTENT_TOP + 150 + 3 * (cell + 30) - 32;
    layer.add(this.add.text(W / 2, sy, '圖鑑組合（湊齊整組就生效）', textStyle(16, '#ffd84d')).setOrigin(0.5));
    SPIRIT_SETS.forEach((set, i) => {
      const done = setComplete(s, set.members);
      const have = set.members.filter((m) => spiritLv(s, m as SpiritId) > 0).length;
      const names = set.members.map((m) => SPIRITS.find((x) => x.id === m)!.name).join('・');
      layer.add(
        this.add
          .text(30, sy + 24 + i * 42, `${done ? '◆' : '・'} ${set.name}（${have}/4）${set.desc}\n   ${names}`, textStyle(13, done ? '#7dff8a' : '#a9a5c8', false))
          .setOrigin(0, 0),
      );
    });
    layer.add(makeButton(this, W / 2, Math.max(CONTENT_BOTTOM - 30, sy + 180), 220, 50, '關閉', COLORS.cyan, () => layer.destroy(), 20));
  }
}
