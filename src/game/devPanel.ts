// 開發者面板（只有作品擁有者看得到）：快速加資源、解鎖、在戰鬥中作弊，方便測試。
import type Phaser from 'phaser';
import { CHAR_ORDER, WEAPON_POOL } from '../config/balance';
import { STAGES } from '../config/stages';
import { loadSave, resetSave, writeSave } from './storage';
import { syncPass } from './pass';
import type { GameScene } from '../scenes/GameScene';

type Btn = [string, () => string | void];

export function openDevPanel(scene: Phaser.Scene, game: GameScene | null) {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(5,4,10,.8);font:15px system-ui,sans-serif;color:#e9f6ff;padding:16px;';
  const box = document.createElement('div');
  box.style.cssText =
    'width:min(440px,100%);max-height:90vh;overflow:auto;background:#110d1f;border:2px solid #ffc83d;border-radius:12px;padding:14px;display:grid;gap:10px;';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:18px;color:#ffd84d;';
  title.textContent = game ? '開發者面板（戰鬥中）' : '開發者面板';
  const msg = document.createElement('div');
  msg.style.cssText = 'min-height:18px;font-size:13px;color:#5dff7a;';
  box.append(title);

  let changedSave = false;
  const section = (name: string, btns: Btn[]) => {
    const h = document.createElement('div');
    h.style.cssText = 'font-size:13px;color:#a8a4c8;margin-top:4px;';
    h.textContent = name;
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    for (const [label, fn] of btns) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'padding:10px 6px;border-radius:9px;border:1px solid #3a3560;background:#1a1430;color:#fff;font:600 14px system-ui,sans-serif;';
      b.onclick = () => {
        const r = fn();
        msg.textContent = r ?? `完成：${label}`;
      };
      grid.append(b);
    }
    box.append(h, grid);
  };
  const edit = (f: (s: ReturnType<typeof loadSave>) => void) => {
    const s = loadSave();
    f(s);
    writeSave(s);
    changedSave = true;
  };

  if (game) {
    section('戰鬥', [
      [game.devGod ? '無敵：開' : '無敵：關', () => {
        game.devGod = !game.devGod;
        return `無敵：${game.devGod ? '開' : '關'}`;
      }],
      ['跳到下一隻 Boss', () => game.debugBoss()],
      ['時間 +60 秒', () => game.debugSkip(60)],
      ['升 1 級', () => game.debugLevel()],
      ['武器全滿級', () => game.debugMaxWeapons()],
      ['給寶箱（可進化）', () => game.debugChest()],
      ['大招充滿', () => game.debugUlt()],
      ['清空畫面敵人', () => game.debugKillAll()],
      ['觸發隨機事件', () => (game.debugEvent() ? '已觸發隨機事件' : '目前無法觸發（已有事件進行中）')],
      ['拿一把隨機武器', () => {
        const id = WEAPON_POOL[Math.floor(Math.random() * WEAPON_POOL.length)];
        game.debugGive(id);
      }],
    ]);
  }
  section('資源', [
    ['晶片 +50,000', () => edit((s) => (s.chips += 50000))],
    ['信用點 +500,000', () => edit((s) => (s.credits += 500000))],
    ['零件 +20,000', () => edit((s) => (s.parts += 20000))],
    ['三種抽卡券 +100', () => edit((s) => {
      s.tickets.char += 100;
      s.tickets.equip += 100;
      s.tickets.spirit += 100;
    })],
    ['通行證經驗 +500', () => edit((s) => {
      syncPass(s);
      s.passXp = (s.passXp ?? 0) + 500;
    })],
    ['萬能碎片 +1,000', () => edit((s) => (s.wildShards += 1000))],
    ['全部角色好感 +500', () => edit((s) => {
      s.affinity = s.affinity ?? {};
      for (const c of CHAR_ORDER) s.affinity[c] = (s.affinity[c] ?? 0) + 500;
    })],
  ]);
  section('解鎖與重置', [
    ['全部角色 5 星', () => edit((s) => {
      s.chars = [...CHAR_ORDER];
      for (const c of CHAR_ORDER) s.stars[c] = 5;
    })],
    ['全部關卡通關', () => edit((s) => (s.stagesCleared = STAGES.map((x) => x.id)))],
    ['重看劇情', () => edit((s) => (s.storySeen = []))],
    ['重置信箱領取紀錄', () => edit((s) => {
      s.mailClaimed = [];
      s.mailRead = [];
    })],
    ['重置存檔（清空）', () => {
      if (!confirm('確定要清空整個存檔嗎？（建議先到設定複製存檔碼）')) return '已取消';
      resetSave();
      changedSave = true;
      return '存檔已清空';
    }],
  ]);
  const close = document.createElement('button');
  close.textContent = '關閉';
  close.style.cssText = 'padding:12px;border-radius:10px;border:2px solid #ff3d81;background:#1a1430;color:#fff;font:600 16px system-ui,sans-serif;';
  close.onclick = () => {
    wrap.remove();
    // 大廳改了存檔就重新整理畫面
    if (!game && changedSave) scene.scene.start('Menu');
  };
  box.append(msg, close);
  wrap.append(box);
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup']) wrap.addEventListener(ev, (e) => e.stopPropagation());
  document.body.append(wrap);
}
