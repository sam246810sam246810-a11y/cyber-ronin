import Phaser from 'phaser';
import { COLORS, H, W, textStyle } from '../game/layout';
import { makeButton, moduleIcon, setupLogicalCamera } from '../game/ui';
import { CONTENT_BOTTOM, CONTENT_TOP, enter, goTo, lobbyBackground, tabBar, topBar } from '../game/chrome';

import { SaveData, loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { vibrate } from '../game/haptics';
import { PullItem, canStarUp, canUnlock, unlockChar, unlockCost, feedJade, payMethod, pityLeft, pullPool, setComplete, spiritLv, spiritStats, starOf, starUp, starUpCost } from '../game/gacha';
import { MOD_RARITY, MODULE_BASES, StatKey, fmtStat, mainValue } from '../config/meta';
import { CHAR_POOL, CHAR_RARITY, DUP_SHARDS, UNLOCK_SHARDS, MAX_SPIRIT_LV, MAX_STAR, POOLS, POOL_ORDER, PoolId, SPIRITS, SPIRIT_SETS, STAR_PERKS, SpiritId, spiritNeed } from '../config/gacha';
import { CHARACTERS, CharId } from '../config/balance';

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
    Audio.playMusic('bgm-menu');
    this.busy = false;
    if (data?.pool) this.pool = data.pool;
    this.draw();
    enter(this);
  }

  private draw() {
    this.children.removeAll(true);
    this.tweens.killAll();
    lobbyBackground(this, 0.6);
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
    this.drawBanner(s, bannerY, by - 130 - top);

    // 持有券、保底
    this.ticketBadge(W / 2 - 110, by - 98, this.pool, s.tickets[this.pool] ?? 0);
    this.add.text(W / 2 + 10, by - 98, `距離保底 SSR：${pityLeft(s, this.pool)} 抽`, textStyle(16, '#ffd84d')).setOrigin(0, 0.5);
    this.add.text(W / 2, by - 66, '十連抽保證至少一個 SR 以上', textStyle(13, COLORS.dim, false)).setOrigin(0.5);

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
      const glow = this.add.ellipse(W / 2, cy + h * 0.42, 420, 70, 0xff3d81, 0.18);
      this.tweens.add({ targets: glow, alpha: 0.5, yoyo: true, repeat: -1, duration: 1400 });
      const order: [CharId, number, number][] = [
        ['zero', -140, 0.82],
        ['tetsu', 140, 0.82],
        ['jin', 0, 1],
      ];
      for (const [id, dx, sc] of order) {
        const key = this.textures.exists(`hd-${id}`) ? `hd-${id}` : `char-${id}`;
        const img = this.fitImage(key, W / 2 + dx, cy + h * 0.05 * (1 - sc) * 6, 300 * sc, h * sc);
        if (sc < 1) img.setTint(0xb0a8d0);
        if (!s.chars.includes(id)) img.setTint(0x403a58);
        img.setName('machine');
      }
      this.add.text(W / 2, cy - h / 2 + 10, '抽 SR／SSR 角色，N／R 是角色碎片', textStyle(16, '#ff6a9a')).setOrigin(0.5).setStroke('#07060d', 4);
      this.add.text(W / 2, cy + h / 2 - 6, '碎片集滿可以解鎖角色、升星（最高 5 星）', textStyle(13, '#ffffff', false)).setOrigin(0.5).setStroke('#07060d', 4);
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
    Audio.play('sfx-chest', 0.5);
    vibrate(40);
    const targets = this.children.list.filter((o) => o.name === 'machine');
    targets.forEach((t) => this.tweens.add({ targets: t, angle: { from: -4, to: 4 }, yoyo: true, repeat: 3, duration: 70, onComplete: () => (t as Phaser.GameObjects.Image).setAngle(0) }));
    const capKey = `capsule-${best}`;
    const cap = this.add.image(W / 2, 420, this.textures.exists(capKey) ? capKey : 'gem3').setScale(0.4).setAlpha(0).setDepth(5);
    this.tweens.add({ targets: cap, alpha: 1, y: 520, scale: 1.4, delay: 350, duration: 450, ease: 'Bounce.Out' });
    const col = MOD_RARITY[best].color;
    this.time.delayedCall(850, () => {
      const pillar = this.add.rectangle(W / 2, H / 2, best >= 2 ? 180 : 90, H, col, 0.6).setDepth(6);
      this.tweens.add({ targets: pillar, alpha: 0, scaleX: best === 3 ? 4 : 2, duration: 700 });
      if (best === 3) {
        this.cameras.main.flash(400, 255, 210, 80);
        Audio.play('sfx-levelup', 0.7);
        vibrate(150);
      }
      this.time.delayedCall(450, () => this.showResults(res));
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
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.92).setInteractive());
    layer.add(this.add.text(W / 2, 150, res.length === 1 ? '抽卡結果' : '十連結果', textStyle(30, '#ffd84d')).setOrigin(0.5));
    const cols = res.length === 1 ? 1 : 5;
    const size = res.length === 1 ? 160 : 92;
    res.forEach((it, i) => {
      const x = W / 2 + ((i % cols) - (cols - 1) / 2) * (size + 8);
      const y = (res.length === 1 ? 330 : 260) + Math.floor(i / cols) * (size + 46);
      const { card, name } = this.itemCard(x, y, size, it);
      card.setScale(0);
      this.tweens.add({ targets: card, scale: 1, delay: i * 90, duration: 220, ease: 'Back.Out' });
      if (it.rarity === 3) {
        const shine = this.add.rectangle(x, y, size + 10, size + 10, 0xffc83d, 0).setStrokeStyle(3, 0xffe08a, 1);
        this.tweens.add({ targets: shine, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });
        layer.add(shine);
      }
      const t = this.add.text(x, y + size / 2 + 6, name, textStyle(12, MOD_RARITY[it.rarity].css, false)).setOrigin(0.5, 0);
      layer.add([card, t]);
      if (res.length === 1 && it.kind === 'module') {
        const base = MODULE_BASES.find((b) => b.id === it.module.base)!;
        const lines = [fmtStat(base.main, mainValue(it.module)), ...it.module.subs.map((x2) => fmtStat(x2.key, x2.value))];
        layer.add(this.add.text(W / 2, y + size / 2 + 34, lines.join('\n'), { ...textStyle(15, '#c9c6e0', false), align: 'center' }).setOrigin(0.5, 0));
      }
    });
    const ok = makeButton(this, W / 2, H - 150, 260, 64, '確定', COLORS.cyan, () => {
      this.busy = false;
      this.draw();
    }, 22);
    layer.add(ok);
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
    ids.forEach((id, i) => {
      const y = CONTENT_TOP + 160 + i * 150;
      const st = starOf(s, id);
      layer.add(this.add.rectangle(W / 2, y, 510, 136, COLORS.panel, 0.96).setStrokeStyle(2, MOD_RARITY[CHAR_RARITY[id]].color, 0.8));
      const pk = this.textures.exists(`portrait-${id}`) ? `portrait-${id}` : `char-${id}`;
      const p = this.add.image(78, y, pk);
      p.setScale(110 / Math.max(p.width, p.height));
      if (!st) p.setTint(0x403a58);
      layer.add(p);
      layer.add(this.add.text(146, y - 52, `${CHARACTERS[id].name}　${RAR[CHAR_RARITY[id]]}`, textStyle(17, '#ffffff')).setOrigin(0, 0));
      layer.add(this.add.text(146, y - 26, st ? '★'.repeat(st) + '☆'.repeat(MAX_STAR - st) : '尚未擁有', textStyle(18, st ? '#ffd84d' : COLORS.dim)).setOrigin(0, 0));
      const cost = starUpCost(s, id);
      const own = s.shards[id] ?? 0;
      const need = st ? cost : unlockCost(id);
      layer.add(this.add.text(146, y + 4, st >= MAX_STAR ? '已滿星' : st ? `下一星：${STAR_PERKS[st]}` : `抽到角色，或集滿碎片解鎖`, { ...textStyle(13, '#c9c6e0', false), wordWrap: { width: 240 } }).setOrigin(0, 0));
      layer.add(this.add.text(146, y + 44, `碎片 ${own}${need ? ` / ${need}` : ''}`, textStyle(13, COLORS.dim, false)).setOrigin(0, 0.5));
      if (!st) {
        const b = makeButton(this, W - 76, y, 112, 56, '解鎖', COLORS.gold, () => {
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
        const b = makeButton(this, W - 76, y, 112, 56, '升星', COLORS.magenta, () => {
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
    layer.add(this.add.text(W / 2, CONTENT_BOTTOM - 96, '碎片不夠時會自動使用萬能碎片', textStyle(13, COLORS.dim, false)).setOrigin(0.5));
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
