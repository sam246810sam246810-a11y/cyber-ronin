// 稱號：達成條件解鎖，選一個顯示在大廳頭像下與個人檔案。
import Phaser from 'phaser';
import { COLORS, H, W, textStyle } from './layout';
import { makeButton } from './ui';
import { SaveData, loadSave, writeSave } from './storage';
import { Audio } from './audio';
import { CHAR_ORDER } from '../config/balance';
import { affinityLevel, anyMaxAffinity } from './affinity';

export interface TitleDef {
  id: string;
  name: string;
  how: string;
  color: string;
  ok: (s: SaveData) => boolean;
}

export const TITLES: TitleDef[] = [
  { id: 'rookie', name: '新人浪人', how: '一開始就有', color: '#c9c6e0', ok: () => true },
  { id: 'win1', name: '初次通關', how: '通關任一關卡', color: '#7fd4ff', ok: (s) => s.wins >= 1 },
  { id: 'win20', name: '百戰浪人', how: '通關 20 次', color: '#ff6ab0', ok: (s) => s.wins >= 20 },
  { id: 'kills', name: '千人斬', how: '單場擊殺 2000', color: '#ff6b80', ok: (s) => s.bestKills >= 2000 },
  { id: 'abyss', name: '深海征服者', how: '通關深海都市', color: '#7fefff', ok: (s) => s.stagesCleared.includes('abyss') },
  { id: 'tower10', name: '登塔者', how: '霓虹塔到達第 10 層', color: '#7fefff', ok: (s) => (s.towerBest ?? 0) >= 10 },
  { id: 'tower25', name: '霓虹塔之主', how: '霓虹塔到達第 25 層', color: '#ffd84d', ok: (s) => (s.towerBest ?? 0) >= 25 },
  { id: 'endless', name: '不死身', how: '無盡模式存活 20 分鐘', color: '#ffd84d', ok: (s) => (s.endlessBest?.time ?? 0) >= 1200 },
  { id: 'gacha', name: '抽卡狂人', how: '累計抽 100 次', color: '#ff9ad0', ok: (s) => Math.max(s.gachaPulls ?? 0, s.totalPulls ?? 0) >= 100 },
  { id: 'koma', name: '機犬之友', how: '狛的好感度 Lv3', color: '#5dffb0', ok: (s) => affinityLevel(s, 'koma') >= 3 },
  { id: 'bond', name: '羈絆之證', how: '任一角色好感度 Lv5', color: '#5dffb0', ok: (s) => anyMaxAffinity(s) },
  { id: 'collector', name: '收藏家', how: '擁有全部角色', color: '#ffd84d', ok: (s) => CHAR_ORDER.every((c) => s.chars.includes(c)) },
];

export function currentTitle(s: SaveData): TitleDef | null {
  const t = TITLES.find((x) => x.id === s.title);
  return t && t.ok(s) ? t : null;
}

export function openTitles(scene: Phaser.Scene, onChange: () => void) {
  const layer = scene.add.container(0, 0).setDepth(60);
  const draw = () => {
    layer.removeAll(true);
    const s = loadSave();
    layer.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.9).setInteractive());
    const top = Math.max(90, H / 2 - 400);
    layer.add(scene.add.rectangle(W / 2, top + 390, 500, 800, 0x0d0a1c, 0.97).setStrokeStyle(2, COLORS.gold, 0.7));
    layer.add(scene.add.text(W / 2, top + 26, '稱號', textStyle(26, '#ffd84d')).setOrigin(0.5).setStroke('#07060d', 5));
    const cur = currentTitle(s);
    TITLES.forEach((t, i) => {
      const y = top + 80 + i * 54;
      const ok = t.ok(s);
      const sel = cur?.id === t.id;
      const row = scene.add.rectangle(W / 2, y, 460, 46, sel ? 0x2a2110 : 0x14102a, 0.95).setStrokeStyle(sel ? 2 : 1, sel ? COLORS.gold : 0x2e2650);
      layer.add(row);
      layer.add(scene.add.text(46, y, t.name, textStyle(17, ok ? t.color : '#55516e')).setOrigin(0, 0.5));
      layer.add(scene.add.text(W - 46, y, sel ? '使用中' : ok ? '點一下使用' : t.how, textStyle(12, sel ? '#ffd84d' : ok ? '#5dff7a' : COLORS.dim, false)).setOrigin(1, 0.5));
      if (ok)
        row.setInteractive({ useHandCursor: true }).on('pointerup', () => {
          const sv = loadSave();
          sv.title = t.id;
          writeSave(sv);
          Audio.play('sfx-click', 0.4);
          onChange();
          draw();
        });
    });
    layer.add(makeButton(scene, W / 2, top + 760, 220, 54, '關閉', COLORS.cyan, () => layer.destroy(), 20));
  };
  draw();
}
