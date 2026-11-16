// 賽季通行證：每個月 30 階，用出擊累積經驗，免費領資源、抽卡券與賽季頭像框。
import Phaser from 'phaser';
import { COLORS, H, W, textStyle } from './layout';
import { makeButton } from './ui';
import { RewardItem, rewardPopup } from './chrome';
import { SaveData, loadSave, writeSave } from './storage';
import { Audio } from './audio';

export const PASS_TIERS = 30;
export const PASS_XP_PER_TIER = 100;

interface PassReward extends RewardItem {
  apply: (s: SaveData) => void;
}

function reward(tier: number): PassReward {
  if (tier === PASS_TIERS) return { icon: 'ui-ic-gacha', label: '券×10＋賽季框', color: '#ffd84d', apply: (s) => ((s.tickets.char += 10), (s.seasonFrame = true)) };
  if (tier % 10 === 0) return { icon: 'avatar-kagura', label: '萬能碎片 50', color: '#ffd84d', apply: (s) => (s.wildShards += 50) };
  if (tier % 5 === 0) return { icon: 'ui-ic-gacha', label: '浪人券×3', color: '#ff9ad0', apply: (s) => (s.tickets.char += 3) };
  const cycle: PassReward[] = [
    { icon: 'ui-ic-chip', label: '晶片 150', apply: (s) => (s.chips += 150) },
    { icon: 'ui-ic-coin', label: '信用點 3000', apply: (s) => ((s.credits += 3000), (s.totalCredits += 3000)) },
    { icon: 'ui-ic-parts', label: '零件 300', apply: (s) => (s.parts += 300) },
    { icon: 'ui-ic-implant', label: '義體券×1', apply: (s) => (s.tickets.equip += 1) },
    { icon: 'spirit-fox', label: '靈符×1', apply: (s) => (s.tickets.spirit += 1) },
  ];
  return cycle[(tier - 1) % cycle.length];
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 換月就重置通行證 */
export function syncPass(s: SaveData) {
  const m = monthKey();
  if (s.passMonth !== m) {
    s.passMonth = m;
    s.passXp = 0;
    s.passClaimed = [];
  }
}

export function passTier(s: SaveData): number {
  return Math.min(PASS_TIERS, Math.floor((s.passXp ?? 0) / PASS_XP_PER_TIER));
}

/** 一場結束後的通行證經驗：出擊 20＋每分鐘 10＋擊殺／20＋勝利 50（最多 250） */
export function gainPassXp(s: SaveData, seconds: number, kills: number, won: boolean): number {
  syncPass(s);
  const xp = Math.min(250, Math.round(20 + (seconds / 60) * 10 + kills / 20 + (won ? 50 : 0)));
  s.passXp = (s.passXp ?? 0) + xp;
  return xp;
}

export function passClaimable(s: SaveData): number[] {
  const t = s.passMonth === monthKey() ? passTier(s) : 0;
  const out: number[] = [];
  for (let i = 1; i <= t; i++) if (!(s.passClaimed ?? []).includes(i)) out.push(i);
  return out;
}

export function openPass(scene: Phaser.Scene, onChange: () => void) {
  const layer = scene.add.container(0, 0).setDepth(120);
  const draw = () => {
    layer.removeAll(true);
    const s = loadSave();
    syncPass(s);
    const tier = passTier(s);
    layer.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.9).setInteractive());
    const top = Math.max(80, H / 2 - 420);
    layer.add(scene.add.rectangle(W / 2, top + 410, 510, 840, 0x0d0a1c, 0.97).setStrokeStyle(2, 0x7fefff, 0.7));
    layer.add(scene.add.text(W / 2, top + 26, `賽季通行證　${s.passMonth.replace('-', ' 年 ')} 月`, textStyle(22, '#7fefff')).setOrigin(0.5).setStroke('#07060d', 5));
    const cur = (s.passXp ?? 0) - tier * PASS_XP_PER_TIER;
    layer.add(scene.add.text(W / 2, top + 60, tier >= PASS_TIERS ? `已達第 ${PASS_TIERS} 階（滿階）` : `第 ${tier} 階　下一階 ${cur} / ${PASS_XP_PER_TIER}`, textStyle(14, '#ffffff', false)).setOrigin(0.5));
    layer.add(scene.add.rectangle(W / 2, top + 84, 420, 10, 0x1a1430).setStrokeStyle(1, 0x7fefff, 0.5));
    layer.add(scene.add.rectangle(W / 2 - 210, top + 84, 420 * (tier >= PASS_TIERS ? 1 : cur / PASS_XP_PER_TIER), 10, 0x3de0ff).setOrigin(0, 0.5));
    layer.add(scene.add.text(W / 2, top + 104, '出擊就會累積經驗（存活越久、擊殺越多越快），每月 1 日重置', textStyle(11, COLORS.dim, false)).setOrigin(0.5));
    const claimed = s.passClaimed ?? [];
    for (let i = 1; i <= PASS_TIERS; i++) {
      const col = (i - 1) % 5;
      const row = Math.floor((i - 1) / 5);
      const x = W / 2 + (col - 2) * 96;
      const y = top + 160 + row * 100;
      const r = reward(i);
      const got = claimed.includes(i);
      const can = i <= tier && !got;
      const big = i % 5 === 0;
      const cell = scene.add.rectangle(x, y, 88, 90, can ? 0x10302f : 0x14102a, 0.96).setStrokeStyle(can ? 2 : 1, can ? 0x5dffb0 : big ? COLORS.gold : 0x2e2650);
      layer.add(cell);
      if (can) scene.tweens.add({ targets: cell, alpha: 0.7, yoyo: true, repeat: -1, duration: 600 });
      layer.add(scene.add.text(x - 38, y - 40, String(i), textStyle(11, big ? '#ffd84d' : COLORS.dim)).setOrigin(0, 0));
      if (scene.textures.exists(r.icon)) {
        const im = scene.add.image(x, y - 8, r.icon);
        im.setScale(34 / Math.max(im.width, im.height));
        if (got || i > tier) im.setAlpha(0.4);
        layer.add(im);
      }
      layer.add(scene.add.text(x, y + 26, r.label, { ...textStyle(10, got ? '#55516e' : '#ffffff', false), align: 'center', wordWrap: { width: 84 } }).setOrigin(0.5, 0.5));
      if (got) layer.add(scene.add.text(x, y - 6, '已領', textStyle(16, '#5dff7a')).setOrigin(0.5).setAngle(-12).setStroke('#07060d', 4));
      if (can) cell.setInteractive({ useHandCursor: true }).on('pointerup', () => claim([i]));
    }
    const all = passClaimable(s);
    const b = makeButton(scene, W / 2 - 110, top + 780, 200, 54, `一鍵領取${all.length ? `（${all.length}）` : ''}`, COLORS.gold, () => claim(all), 17);
    b.setEnabled(all.length > 0);
    layer.add(b);
    layer.add(makeButton(scene, W / 2 + 110, top + 780, 180, 54, '關閉', COLORS.cyan, () => layer.destroy(), 18));
  };
  const claim = (tiers: number[]) => {
    if (!tiers.length) return;
    const sv = loadSave();
    syncPass(sv);
    const items: RewardItem[] = [];
    for (const t of tiers) {
      if (sv.passClaimed.includes(t) || t > passTier(sv)) continue;
      const r = reward(t);
      r.apply(sv);
      sv.passClaimed.push(t);
      items.push({ icon: r.icon, label: r.label, color: r.color });
    }
    writeSave(sv);
    Audio.play('sfx-claim', 0.6);
    onChange();
    draw();
    if (items.length) rewardPopup(scene, '通行證獎勵', items.slice(0, 12));
  };
  draw();
}
