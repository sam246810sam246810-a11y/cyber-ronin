import Phaser from 'phaser';
import { CHARACTERS } from '../config/balance';
import { ACHIEVEMENTS, dailyChallenge, dailyMissions, todayKey } from '../config/meta';
import { WANTED_RULES } from '../config/expansion';
import { COLORS, W, textStyle } from '../game/layout';
import { makeButton, setupLogicalCamera } from '../game/ui';
import { enter, goTo, lobbyBackground, tabBar, topBar } from '../game/chrome';

import { formatTime, loadSave, writeSave } from '../game/storage';
import { Audio } from '../game/audio';
import { achStats, ensureDaily } from '../game/meta';

type Tab = 'daily' | 'ach' | 'challenge';
const ACH_PER_PAGE = 5;

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
      makeButton(this, W / 2 + (i - 1) * 164, 116, 152, 46, label, 0x5dff7a, () => {
        this.tab = t;
        this.page = 0;
        this.draw();
      }, 17).setActive2(this.tab === t);
    });
    if (this.tab === 'daily') this.drawDaily();
    else if (this.tab === 'ach') this.drawAch();
    else this.drawChallenge();
  }

  private row(y: number, title: string, desc: string, progress: number, target: number, reward: number, claimed: boolean, onClaim: () => void) {
    const done = progress >= target;
    this.add.rectangle(W / 2, y, 510, 96, COLORS.panel, 0.96).setStrokeStyle(1, done && !claimed ? 0x5dff7a : 0x2e2650);
    this.add.text(30, y - 36, title, textStyle(18, claimed ? '#6a6688' : '#ffffff')).setOrigin(0, 0);
    this.add.text(30, y - 10, desc, textStyle(14, '#a9a5c8', false)).setOrigin(0, 0);
    const bw = 300;
    this.add.rectangle(30 + bw / 2, y + 28, bw, 10, 0x1a1430);
    this.add.rectangle(30, y + 28, bw * Math.min(1, progress / target), 10, done ? 0x5dff7a : COLORS.cyan).setOrigin(0, 0.5);
    this.add.text(30 + bw + 10, y + 28, `${Math.min(progress, target)}/${target}`, textStyle(12, COLORS.dim, false)).setOrigin(0, 0.5);
    makeButton(this, W - 82, y, 120, 54, claimed ? '已領取' : `晶片 ${reward}`, 0x5dff7a, () => {
      Audio.play('sfx-chest', 0.5);
      onClaim();
      this.draw();
    }, 15).setEnabled(done && !claimed);
  }

  private drawDaily() {
    const s = loadSave();
    ensureDaily(s);
    this.add.text(W / 2, 160, `${s.dailyDay}　每天 0 點更新`, textStyle(14, COLORS.dim, false)).setOrigin(0.5);
    dailyMissions(s.dailyDay).forEach((m, i) => {
      const p = s.dailyProgress[m.id] ?? 0;
      this.row(240 + i * 110, m.desc(m.target), '每日任務', p, m.target, m.reward, s.dailyClaimed.includes(m.id), () => {
        const save = loadSave();
        ensureDaily(save);
        if (save.dailyClaimed.includes(m.id)) return;
        save.dailyClaimed.push(m.id);
        save.chips += m.reward;
        writeSave(save);
      });
    });
    this.add
      .text(W / 2, 600, '進度在每局結算時更新', textStyle(14, COLORS.dim, false))
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
    this.add.text(W / 2, 160, `已完成 ${done} / ${ACHIEVEMENTS.length}`, textStyle(14, COLORS.dim, false)).setOrigin(0.5);
    list.slice(this.page * ACH_PER_PAGE, this.page * ACH_PER_PAGE + ACH_PER_PAGE).forEach((a, i) => {
      const ok = a.check(st);
      this.row(232 + i * 102, a.name, a.desc, ok ? 1 : 0, 1, a.reward, s.achClaimed.includes(a.id), () => {
        const save = loadSave();
        if (save.achClaimed.includes(a.id)) return;
        save.achClaimed.push(a.id);
        save.chips += a.reward;
        writeSave(save);
      });
    });
    const py = 232 + ACH_PER_PAGE * 102 - 30;
    makeButton(this, W / 2 - 90, py, 70, 40, '<', COLORS.cyan, () => {
      this.page = Math.max(0, this.page - 1);
      this.draw();
    }, 18).setEnabled(this.page > 0);
    this.add.text(W / 2, py, `${this.page + 1} / ${pages}`, textStyle(15, COLORS.dim, false)).setOrigin(0.5);
    makeButton(this, W / 2 + 90, py, 70, 40, '>', COLORS.cyan, () => {
      this.page = Math.min(pages - 1, this.page + 1);
      this.draw();
    }, 18).setEnabled(this.page < pages - 1);
  }

  private drawChallenge() {
    const s = loadSave();
    const day = todayKey();
    const dc = dailyChallenge(day);
    const c = CHARACTERS[dc.char];
    this.add.text(W / 2, 170, `${day} 的每日挑戰`, textStyle(22, '#ffd84d')).setOrigin(0.5);
    const pk = this.textures.exists(`portrait-${c.id}`) ? `portrait-${c.id}` : `char-${c.id}`;
    this.add.image(W / 2, 320, pk).setDisplaySize(200, 200);
    this.add.text(W / 2, 440, `角色：${c.name}（不需要解鎖）`, textStyle(18)).setOrigin(0.5);
    this.add.text(W / 2, 472, `通緝等級 ${dc.wanted}：${WANTED_RULES.slice(0, dc.wanted).join('、')}`, { ...textStyle(14, '#ff8a5d', false), align: 'center', wordWrap: { width: 460 } }).setOrigin(0.5, 0);
    this.add
      .text(W / 2, 530, '所有人今天都是同一個角色、同一個難度與同一組隨機種子。\n每天第一次通關獎勵晶片 100。', { ...textStyle(14, '#c9c6e0', false), align: 'center', lineSpacing: 6 })
      .setOrigin(0.5, 0);
    const cleared = s.dailyChallengeDay === day;
    const best = s.dailyChallengeBest && s.dailyChallengeBest.day === day ? s.dailyChallengeBest : null;
    this.add
      .text(W / 2, 610, cleared ? '今天已通關，獎勵已領取' : best ? `今天最佳：存活 ${formatTime(best.time)}、擊殺 ${best.kills}` : '今天還沒挑戰', textStyle(16, cleared ? '#5dff7a' : COLORS.dim))
      .setOrigin(0.5);
    makeButton(this, W / 2, 700, 320, 76, '開始挑戰', 0x5dff7a, () => {
      Audio.stopMusic();
      goTo(this, 'Game', { daily: true });
    }, 26);
  }
}
