// 7 日登入獎勵：每天第一次進大廳時跳出，連續登入才會往下走，斷掉就從第 1 天重來。
import Phaser from 'phaser';
import { COLORS, H, W, textStyle } from './layout';
import { makeButton } from './ui';
import { RewardItem, rewardPopup } from './chrome';
import { SaveData, loadSave, writeSave } from './storage';
import { todayKey } from '../config/meta';

interface LoginReward {
  label: string;
  icon: string;
  apply: (s: SaveData) => void;
}

export const LOGIN_REWARDS: LoginReward[] = [
  { label: '晶片 100', icon: 'ui-ic-chip', apply: (s) => (s.chips += 100) },
  { label: '信用點 500', icon: 'ui-ic-coin', apply: (s) => ((s.credits += 500), (s.totalCredits += 500)) },
  { label: '浪人券 ×1', icon: 'ui-ic-gacha', apply: (s) => (s.tickets.char += 1) },
  { label: '晶片 150', icon: 'ui-ic-chip', apply: (s) => (s.chips += 150) },
  { label: '靈符 ×2', icon: 'spirit-fox', apply: (s) => (s.tickets.spirit += 2) },
  { label: '零件 150', icon: 'ui-ic-parts', apply: (s) => (s.parts += 150) },
  { label: '浪人券 ×3＋萬能碎片 20', icon: 'avatar-kagura', apply: (s) => ((s.tickets.char += 3), (s.wildShards += 20)) },
];

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

/** 今天還沒領的話回傳要領第幾天（1～7），已領過回傳 0 */
export function pendingLoginDay(s: SaveData): number {
  const today = todayKey();
  if (s.loginDay === today) return 0;
  const cont = s.loginDay === yesterdayKey();
  return cont ? (s.loginStreak % 7) + 1 : 1;
}

export function showLoginBonus(scene: Phaser.Scene, onDone: () => void) {
  const s = loadSave();
  const day = pendingLoginDay(s);
  if (!day) return onDone();
  const layer = scene.add.container(0, 0).setDepth(150);
  layer.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.86).setInteractive());
  const top = H * 0.2;
  layer.add(scene.add.rectangle(W / 2, top + 250, 500, 560, 0x0d0a1c, 0.97).setStrokeStyle(2, COLORS.gold, 0.8));
  layer.add(scene.add.text(W / 2, top + 10, '7 日登入獎勵', textStyle(28, '#ffd84d')).setOrigin(0.5).setStroke('#07060d', 6));
  layer.add(scene.add.text(W / 2, top + 46, '連續登入領更多，中斷會從第 1 天重新開始', textStyle(13, COLORS.dim, false)).setOrigin(0.5));
  LOGIN_REWARDS.forEach((r, i) => {
    const big = i === 6;
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = big ? W / 2 : W / 2 + (col - 1) * 150;
    const y = top + 120 + row * 130;
    const w = big ? 440 : 136;
    const done = i + 1 < day;
    const now = i + 1 === day;
    const g = scene.add.rectangle(x, y, w, 118, now ? 0x2a2110 : 0x110d1f, 0.98).setStrokeStyle(now ? 3 : 1, now ? COLORS.gold : 0x3a3168);
    layer.add(g);
    if (now) scene.tweens.add({ targets: g, alpha: 0.75, yoyo: true, repeat: -1, duration: 600 });
    layer.add(scene.add.text(x - w / 2 + 8, y - 52, `第 ${i + 1} 天`, textStyle(12, now ? '#ffd84d' : COLORS.dim)).setOrigin(0, 0));
    if (scene.textures.exists(r.icon)) {
      const img = scene.add.image(big ? x - 120 : x, y - 4, r.icon);
      img.setScale(48 / Math.max(img.width, img.height));
      if (done) img.setAlpha(0.35);
      layer.add(img);
    }
    layer.add(scene.add.text(big ? x + 20 : x, y + 38, r.label, textStyle(big ? 16 : 13, done ? '#55516e' : '#ffffff')).setOrigin(big ? 0.3 : 0.5).setStroke('#07060d', 3));
    if (done) layer.add(scene.add.text(x, y, '已領', textStyle(20, '#5dff7a')).setOrigin(0.5).setAngle(-12).setStroke('#07060d', 4));
  });
  const btn = makeButton(scene, W / 2, top + 500, 260, 64, `領取第 ${day} 天`, COLORS.gold, () => {
    const sv = loadSave();
    if (pendingLoginDay(sv) !== day) return;
    LOGIN_REWARDS[day - 1].apply(sv);
    sv.loginDay = todayKey();
    sv.loginStreak = day;
    writeSave(sv);
    layer.destroy();
    const r = LOGIN_REWARDS[day - 1];
    const items: RewardItem[] = [{ icon: r.icon, label: r.label, color: '#ffd84d' }];
    rewardPopup(scene, `第 ${day} 天登入獎勵`, items, onDone);
  }, 22);
  layer.add(btn);
}
