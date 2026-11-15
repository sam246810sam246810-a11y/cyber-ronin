import Phaser from 'phaser';
import { CHARACTERS } from '../config/balance';
import { ACHIEVEMENTS, dailyChallenge, dailyMissions, todayKey } from '../config/meta';
import { WANTED_RULES } from '../config/expansion';
import { POOLS, POOL_ORDER, PoolId } from '../config/gacha';
import { COLORS, W, textStyle } from '../game/layout';
import { makeButton, setupLogicalCamera } from '../game/ui';
import { CONTENT_BOTTOM, CONTENT_TOP, RewardItem, enter, goTo, lobbyBackground, rewardPopup, tabBar, topBar } from '../game/chrome';

import { formatTime, loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { achStats, ensureDaily } from '../game/meta';

type Tab = 'daily' | 'ach' | 'challenge';
const ACH_PER_PAGE = 5;
/** 每個成就固定送一種抽卡券（依成就順序輪流） */
const achTicket = (id: string): PoolId => POOL_ORDER[ACHIEVEMENTS.findIndex((a) => a.id === id) % 3];

const MISSION_ICON: Record<string, string> = {
  kills: 'icon-might',
  blade: 'icon-katana',
  volt: 'icon-field',
  hack: 'icon-virus',
  survive: 'ui-ic-daily',
  boss: 'ui-ic-battle',
  iai: 'icon-intent',
  relics: 'relic-soul',
  runs: 'ui-ic-battle',
  combo: 'icon-overclock',
};

const ROW_H = 104;

/** 任務：每日任務、成就、每日挑戰 */
export class MissionsScene extends Phaser.Scene {
  private tab: Tab = 'daily';
  private page = 0;

  constructor() {
    super('Missions');
  }

  create(data?: { tab?: Tab }) {
    this.tab = data?.tab ?? 'daily';
    setupLogicalCamera(this);
    Audio.playMusic('bgm-menu');
    this.page = 0;
    this.draw();
    enter(this);
  }

  private draw() {
    this.children.removeAll(true);
    this.tweens.killAll();
    lobbyBackground(this, 0.72);
    const s = loadSave();
    ensureDaily(s);
    writeSave(s);
    topBar(this, s);
    tabBar(this, 'Missions');
    const tabs: [Tab, string][] = [
      ['daily', '每日任務'],
      ['ach', '成就'],
      ['challenge', '每日挑戰'],
    ];
    tabs.forEach(([t, label], i) => {
      makeButton(this, W / 2 + (i - 1) * 168, CONTENT_TOP + 30, 156, 48, label, 0x5dff7a, () => {
        if (this.tab === t) return;
        this.tab = t;
        this.page = 0;
        this.draw();
      }, 17).setActive2(this.tab === t);
    });
    if (this.tab === 'daily') this.drawDaily();
    else if (this.tab === 'ach') this.drawAch();
    else this.drawChallenge();
  }

  private icon(key: string, x: number, y: number, size: number) {
    const k = this.textures.exists(key) ? key : 'ui-ic-mission';
    const img = this.add.image(x, y, k);
    const src = img.texture.getSourceImage();
    return img.setScale(size / Math.max(src.width, src.height));
  }

  /** 一列任務卡：圖示、標題、進度條、獎勵、領取按鈕 */
  private row(y: number, iconKey: string, title: string, desc: string, progress: number, target: number, reward: number, claimed: boolean, onClaim: () => void, ticket?: PoolId) {
    const done = progress >= target;
    const ready = done && !claimed;
    const x0 = 18;
    const w = W - 36;
    const g = this.add.graphics();
    g.fillStyle(ready ? 0x0f2a1a : 0x0d0a1c, claimed ? 0.75 : 0.94).fillRoundedRect(x0, y - ROW_H / 2, w, ROW_H - 8, 12);
    g.lineStyle(2, ready ? 0x5dff7a : claimed ? 0x2a2440 : 0x3a3168, ready ? 1 : 0.9).strokeRoundedRect(x0, y - ROW_H / 2, w, ROW_H - 8, 12);
    // 左側霓虹色條
    g.fillStyle(ready ? 0x5dff7a : claimed ? 0x3a3452 : COLORS.cyan, 1).fillRoundedRect(x0, y - ROW_H / 2 + 14, 5, ROW_H - 36, 2);
    const cy = y - 4;
    // 圖示底座
    g.fillStyle(0x07060d, 1).fillCircle(x0 + 46, cy, 30);
    g.lineStyle(2, ready ? 0x5dff7a : 0x3df5ff, claimed ? 0.3 : 0.7).strokeCircle(x0 + 46, cy, 30);
    const ic = this.icon(iconKey, x0 + 46, cy, 44);
    if (claimed) ic.setAlpha(0.4);

    const tx = x0 + 88;
    this.add.text(tx, cy - 34, title, textStyle(17, claimed ? '#6a6688' : '#ffffff')).setOrigin(0, 0);
    this.add.text(tx, cy - 10, desc, textStyle(13, claimed ? '#55516e' : '#a9a5c8', false)).setOrigin(0, 0);
    // 進度條
    const bw = 230;
    const by = cy + 24;
    const pct = Math.min(1, progress / target);
    g.fillStyle(0x07060d, 1).fillRoundedRect(tx, by - 8, bw, 16, 8);
    if (pct > 0) {
      const c1 = done ? 0x2bd96b : 0x2a8cff;
      const c2 = done ? 0x5dff7a : 0x3df5ff;
      g.fillGradientStyle(c1, c2, c1, c2, 1);
      g.fillRect(tx + 3, by - 5, Math.max(6, (bw - 6) * pct), 10);
    }
    g.lineStyle(1, 0xffffff, 0.15).strokeRoundedRect(tx, by - 8, bw, 16, 8);
    this.add.text(tx + bw / 2, by, `${Math.min(progress, target)} / ${target}`, textStyle(11, '#ffffff')).setOrigin(0.5).setStroke('#07060d', 3);

    // 獎勵與按鈕
    const rx = W - 82;
    this.icon('ui-ic-chip', rx - 26, cy - 30, 26).setAlpha(claimed ? 0.4 : 1);
    this.add.text(rx - 10, cy - 30, `×${reward}`, textStyle(14, claimed ? '#55516e' : '#7fd4ff')).setOrigin(0, 0.5);
    if (ticket) this.add.text(rx, cy - 8, `＋${POOLS[ticket].ticket}×1`, textStyle(11, claimed ? '#55516e' : POOLS[ticket].css, false)).setOrigin(0.5);
    if (claimed) {
      const stamp = this.add.text(rx, cy + 24, '已領取', textStyle(16, '#5dff7a')).setOrigin(0.5).setAngle(-8).setAlpha(0.8);
      stamp.setStroke('#07060d', 3);
      return;
    }
    const b = makeButton(this, rx, cy + 24, 108, 44, done ? '領取' : '未完成', done ? COLORS.gold : 0x888899, () => {
      onClaim();
      const items: RewardItem[] = [{ icon: 'ui-ic-chip', label: `晶片 ${reward}`, color: '#7fd4ff' }];
      if (ticket) items.push({ icon: 'ui-ic-gacha', label: `${POOLS[ticket].ticket} ×1`, color: POOLS[ticket].css });
      rewardPopup(this, '領取獎勵', items, () => this.draw());
    }, 16);
    b.setEnabled(done);
    if (ready) this.tweens.add({ targets: b, scale: 1.06, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.InOut' });
  }

  private drawDaily() {
    const s = loadSave();
    ensureDaily(s);
    const ms = dailyMissions(s.dailyDay);
    const doneN = ms.filter((m) => s.dailyClaimed.includes(m.id)).length;
    // 標題卡：完成度與更新倒數
    const hy = CONTENT_TOP + 104;
    const g = this.add.graphics();
    g.fillStyle(0x0d0a1c, 0.9).fillRoundedRect(18, hy - 34, W - 36, 68, 12);
    g.lineStyle(2, 0xff3d81, 0.6).strokeRoundedRect(18, hy - 34, W - 36, 68, 12);
    this.add.text(36, hy - 14, '今日任務', textStyle(20, '#ffffff')).setOrigin(0, 0.5).setStroke('#ff3d81', 3);
    const now = new Date();
    const left = 24 * 60 - (now.getHours() * 60 + now.getMinutes());
    this.add.text(36, hy + 14, `${Math.floor(left / 60)} 小時 ${left % 60} 分後更新`, textStyle(13, COLORS.dim, false)).setOrigin(0, 0.5);
    for (let i = 0; i < ms.length; i++) {
      const x = W - 150 + i * 44;
      g.fillStyle(i < doneN ? 0x5dff7a : 0x2a2440, 1).fillCircle(x, hy - 6, 13);
      g.lineStyle(2, 0x07060d, 1).strokeCircle(x, hy - 6, 13);
    }
    this.add.text(W - 150 + 44, hy + 16, `${doneN} / ${ms.length} 完成`, textStyle(12, doneN === ms.length ? '#5dff7a' : COLORS.dim, false)).setOrigin(0.5, 0);

    ms.forEach((m, i) => {
      const p = s.dailyProgress[m.id] ?? 0;
      this.row(CONTENT_TOP + 196 + i * (ROW_H + 6), MISSION_ICON[m.id] ?? 'ui-ic-mission', m.desc(m.target), '每日任務', p, m.target, m.reward, s.dailyClaimed.includes(m.id), () => {
        const save = loadSave();
        ensureDaily(save);
        if (save.dailyClaimed.includes(m.id)) return;
        save.dailyClaimed.push(m.id);
        save.chips += m.reward;
        save.tickets[POOL_ORDER[i % 3]] += 1;
        writeSave(save);
      }, POOL_ORDER[i % 3]);
    });
    this.add
      .text(W / 2, CONTENT_TOP + 196 + ms.length * (ROW_H + 6) - 20, '進度在每局結算時更新・每天 0 點換新任務', textStyle(13, COLORS.dim, false))
      .setOrigin(0.5);
  }

  private drawAch() {
    const s = loadSave();
    const st = achStats(s);
    // 可領取的排最前面，已領取的排最後
    const list = ACHIEVEMENTS.slice().sort((a, b) => {
      const sa = s.achClaimed.includes(a.id) ? 2 : a.check(st) ? 0 : 1;
      const sb = s.achClaimed.includes(b.id) ? 2 : b.check(st) ? 0 : 1;
      return sa - sb;
    });
    const pages = Math.ceil(list.length / ACH_PER_PAGE);
    const done = ACHIEVEMENTS.filter((a) => s.achClaimed.includes(a.id)).length;
    const hy = CONTENT_TOP + 84;
    const g = this.add.graphics();
    g.fillStyle(0x07060d, 1).fillRoundedRect(36, hy - 9, W - 72, 18, 9);
    g.fillStyle(0xffc83d, 1).fillRoundedRect(39, hy - 6, Math.max(8, (W - 78) * (done / ACHIEVEMENTS.length)), 12, 6);
    this.add.text(W / 2, hy, `成就 ${done} / ${ACHIEVEMENTS.length}`, textStyle(12, '#ffffff')).setOrigin(0.5).setStroke('#07060d', 3);
    list.slice(this.page * ACH_PER_PAGE, this.page * ACH_PER_PAGE + ACH_PER_PAGE).forEach((a, i) => {
      const ok = a.check(st);
      this.row(CONTENT_TOP + 160 + i * (ROW_H + 4), 'ui-ic-trophy', a.name, a.desc, ok ? 1 : 0, 1, a.reward, s.achClaimed.includes(a.id), () => {
        const save = loadSave();
        if (save.achClaimed.includes(a.id)) return;
        save.achClaimed.push(a.id);
        save.chips += a.reward;
        save.tickets[achTicket(a.id)] += 1;
        writeSave(save);
      }, achTicket(a.id));
    });
    const py = Math.min(CONTENT_BOTTOM - 30, CONTENT_TOP + 160 + ACH_PER_PAGE * (ROW_H + 4) - 20);
    makeButton(this, W / 2 - 100, py, 72, 44, '<', COLORS.cyan, () => {
      this.page = Math.max(0, this.page - 1);
      this.draw();
    }, 18).setEnabled(this.page > 0);
    this.add.text(W / 2, py, `${this.page + 1} / ${pages}`, textStyle(16, '#ffffff')).setOrigin(0.5);
    makeButton(this, W / 2 + 100, py, 72, 44, '>', COLORS.cyan, () => {
      this.page = Math.min(pages - 1, this.page + 1);
      this.draw();
    }, 18).setEnabled(this.page < pages - 1);
  }

  private drawChallenge() {
    const s = loadSave();
    const day = todayKey();
    const dc = dailyChallenge(day);
    const c = CHARACTERS[dc.char];
    this.add.text(W / 2, CONTENT_TOP + 84, `${day}　每日挑戰`, textStyle(22, '#ffd84d')).setOrigin(0.5).setStroke('#07060d', 4);

    // 角色立繪：等比例縮放，不壓扁
    const heroBottom = CONTENT_TOP + 410;
    const glow = this.add.ellipse(W / 2, heroBottom - 6, 300, 54, 0x5dff7a, 0.18);
    this.add.ellipse(W / 2, heroBottom - 6, 220, 30).setStrokeStyle(2, 0x5dff7a, 0.6);
    this.tweens.add({ targets: glow, alpha: 0.4, yoyo: true, repeat: -1, duration: 1200 });
    const key = this.textures.exists(`hd-${c.id}`) ? `hd-${c.id}` : `char-${c.id}`;
    const hero = this.add.image(W / 2, heroBottom, key).setOrigin(0.5, 1);
    const src = hero.texture.getSourceImage();
    hero.setScale(Math.min(300 / src.height, 300 / src.width));
    this.tweens.add({ targets: hero, scaleY: hero.scaleY * 1.012, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.InOut' });

    // 資訊卡
    const py = heroBottom + 20;
    const ph = 204;
    const g = this.add.graphics();
    g.fillStyle(0x0d0a1c, 0.94).fillRoundedRect(18, py, W - 36, ph, 14);
    g.lineStyle(2, 0x5dff7a, 0.7).strokeRoundedRect(18, py, W - 36, ph, 14);
    this.add.text(W / 2, py + 26, `${c.name}　${c.role}`, textStyle(20, '#ffffff')).setOrigin(0.5);
    this.add.text(W / 2, py + 52, '今天不需要解鎖也能使用', textStyle(12, '#5dff7a', false)).setOrigin(0.5);
    // 通緝規則用小標籤排列
    const rules = WANTED_RULES.slice(0, dc.wanted);
    this.add.text(36, py + 80, `通緝等級 ${dc.wanted}`, textStyle(15, '#ff8a5d')).setOrigin(0, 0.5);
    let x = 36;
    let y = py + 110;
    for (const r of rules) {
      const t = this.add.text(0, 0, r, textStyle(12, '#ffd0c0', false));
      const tw = t.width + 18;
      if (x + tw > W - 36) {
        x = 36;
        y += 32;
      }
      g.fillStyle(0x3a1410, 1).fillRoundedRect(x, y - 12, tw, 24, 12);
      g.lineStyle(1, 0xff6a3d, 0.8).strokeRoundedRect(x, y - 12, tw, 24, 12);
      t.setPosition(x + 9, y).setOrigin(0, 0.5);
      x += tw + 8;
    }
    this.add
      .text(W / 2, py + ph - 38, '所有人今天都是同一個角色、難度與隨機種子\n每天第一次通關：晶片 100＋浪人券 1', { ...textStyle(13, '#c9c6e0', false), align: 'center', lineSpacing: 6 })
      .setOrigin(0.5);

    const cleared = s.dailyChallengeDay === day;
    const best = s.dailyChallengeBest && s.dailyChallengeBest.day === day ? s.dailyChallengeBest : null;
    const sy = py + ph + 24;
    this.add
      .text(W / 2, sy, cleared ? '◆ 今天已通關，獎勵已領取' : best ? `今天最佳：存活 ${formatTime(best.time)}、擊殺 ${best.kills}` : '今天還沒挑戰', textStyle(15, cleared ? '#5dff7a' : COLORS.dim))
      .setOrigin(0.5);
    const b = makeButton(this, W / 2, Math.min(CONTENT_BOTTOM - 44, sy + 74), 320, 76, cleared ? '再挑戰一次' : '開始挑戰', 0x5dff7a, () => {
      Audio.stopMusic();
      goTo(this, 'Game', { daily: true });
    }, 26);
    if (!cleared) this.tweens.add({ targets: b, scale: 1.04, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.InOut' });
  }
}
