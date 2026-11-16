// 信箱：系統消息、更新公告與補償獎勵。開發者禮包只有作品擁有者看得到。
import Phaser from 'phaser';
import { COLORS, H, W, textStyle } from './layout';
import { makeButton } from './ui';
import { RewardItem, rewardPopup } from './chrome';
import { SaveData, loadSave, writeSave } from './storage';
import { Audio } from './audio';
import { isDeveloper } from './cloud';
import { CHAR_ORDER } from '../config/balance';
import { STAGES } from '../config/stages';

interface MailReward extends RewardItem {
  apply: (s: SaveData) => void;
}

export interface Mail {
  id: string;
  title: string;
  from: string;
  date: string;
  body: string;
  rewards?: MailReward[];
  /** 只給開發者（作品擁有者） */
  dev?: boolean;
}

const chips = (n: number): MailReward => ({ icon: 'ui-ic-chip', label: `晶片 ${n.toLocaleString('en-US')}`, apply: (s) => (s.chips += n) });
const credits = (n: number): MailReward => ({ icon: 'ui-ic-coin', label: `信用點 ${n.toLocaleString('en-US')}`, apply: (s) => ((s.credits += n), (s.totalCredits += n)) });
const parts = (n: number): MailReward => ({ icon: 'ui-ic-parts', label: `零件 ${n.toLocaleString('en-US')}`, apply: (s) => (s.parts = (s.parts ?? 0) + n) });
const charT = (n: number): MailReward => ({ icon: 'ui-ic-gacha', label: `浪人券 ×${n}`, apply: (s) => (s.tickets.char += n) });
const equipT = (n: number): MailReward => ({ icon: 'ui-ic-implant', label: `義體券 ×${n}`, apply: (s) => (s.tickets.equip += n) });
const spiritT = (n: number): MailReward => ({ icon: 'spirit-fox', label: `靈符 ×${n}`, apply: (s) => (s.tickets.spirit += n) });
const wild = (n: number): MailReward => ({ icon: 'avatar-kagura', label: `萬能碎片 ${n}`, apply: (s) => (s.wildShards += n) });

/** 新的郵件放最上面 */
export const MAILS: Mail[] = [
  {
    id: 'news-abyss',
    title: '大型更新：深海都市、霓虹塔與賽季通行證',
    from: '營運團隊',
    date: '2026/11/16',
    body: '・第 6 關「深海都市」開放！小心會把人拉進去的漩渦，以及機械海妖利維坦。\n・新模式「霓虹塔」：每 90 秒爬一層，看你能爬多高。\n・賽季通行證、稱號、角色換色皮膚、7 日簽到隨時可看。\n・角色有了日文語音，四隻關卡 Boss 學會了招牌技，兩把特定武器一起帶會觸發武器羈絆。\n送上浪人券與晶片，祝你玩得開心！',
    rewards: [charT(10), chips(1000)],
  },
  {
    id: 'news-koma',
    title: '更新公告：新角色「狛」與武器進化',
    from: '營運團隊',
    date: '2026/11/16',
    body: '新 SR 角色「機巧犬使・狛」加入角色池！帶著機械狼犬阿吽一起戰鬥，還會把經驗晶片叼回來。\n另外：雷射、病毒、軌道打擊、鉤爪也能進化了；戰鬥中會出現隨機事件；角色有了好感度（在「義體 → 好感度」查看）；設定裡可以備份存檔碼；四個關卡都有了專屬 Boss 音樂。\n送上浪人券，祝你抽到狛！',
    rewards: [charT(10)],
  },
  {
    id: 'dev-pack-1',
    dev: true,
    title: '【開發者】超大測試禮包',
    from: '開發組',
    date: '2026/11/15',
    body: '開發者專用的測試禮包：大量資源與抽卡券，並解鎖全部角色、全部關卡與 3 倍速，方便快速測試各種功能。\n（只有作品擁有者看得到這封信）',
    rewards: [
      chips(200000),
      credits(2000000),
      parts(100000),
      charT(500),
      equipT(500),
      spiritT(500),
      wild(10000),
      { icon: 'avatar-misora', label: '解鎖全部角色', apply: (s) => (s.chars = [...CHAR_ORDER]) },
      { icon: 'ui-ic-battle', label: '解鎖全部關卡', apply: (s) => (s.stagesCleared = STAGES.map((x) => x.id)) },
      { icon: 'ui-ic-upgrade', label: '3 倍速特權', apply: (s) => (s.premium = true) },
    ],
  },
  {
    id: 'comp-reset-1',
    title: '【補償】存檔遺失補償',
    from: '營運團隊',
    date: '2026/11/15',
    body: '先前版本的存檔只存在瀏覽器裡，部分玩家更新後進度被清空，造成不便非常抱歉。\n現在已加入雲端存檔，之後更新不會再遺失進度。以下是補償，請收下！',
    rewards: [chips(5000), credits(50000), charT(30), equipT(20), spiritT(20), wild(300)],
  },
  {
    id: 'news-cloud',
    title: '雲端存檔上線',
    from: '營運團隊',
    date: '2026/11/15',
    body: '在 Claude 裡遊玩時，存檔會自動同步到你的帳號（只有你自己讀得到）。\n就算瀏覽器的資料被清除，下次開啟也會從雲端取回進度。\n可以在「設定」裡看到雲端存檔的狀態。',
  },
  {
    id: 'news-1115',
    title: '更新公告：卡池改版與關卡大廳',
    from: '營運團隊',
    date: '2026/11/15',
    body: '・角色池每週輪替主打 SSR，抽到 SSR 時有 70% 是本期主打角色\n・點角色可以看介紹並試看大招\n・保底進度條\n・大廳背景、天氣與音樂會跟著選擇的關卡改變\n・個人檔案頭像改為多排顯示',
  },
  {
    id: 'news-misora',
    title: '新角色登場：星詠歌姬・美空',
    from: '營運團隊',
    date: '2026/11/14',
    body: 'SSR 偶像應援型角色「美空」加入角色池！\n專屬武器「應援之歌」會持續回血並強化攻擊，大招「星光演唱會」分兩段演出。',
    rewards: [charT(10)],
  },
];

export function visibleMails(): Mail[] {
  const dev = isDeveloper();
  return MAILS.filter((m) => !m.dev || dev);
}

const claimable = (m: Mail, s: SaveData) => !!m.rewards?.length && !s.mailClaimed.includes(m.id);

/** 信箱紅點數：未讀＋未領 */
export function mailBadge(s: SaveData): number {
  return visibleMails().filter((m) => !s.mailRead.includes(m.id) || claimable(m, s)).length;
}

function claim(scene: Phaser.Scene, mails: Mail[], onChange: () => void) {
  const s = loadSave();
  const items: RewardItem[] = [];
  for (const m of mails) {
    if (!claimable(m, s)) continue;
    for (const r of m.rewards!) {
      r.apply(s);
      items.push({ icon: r.icon, label: r.label });
    }
    s.mailClaimed.push(m.id);
    if (!s.mailRead.includes(m.id)) s.mailRead.push(m.id);
  }
  if (!items.length) return;
  writeSave(s);
  rewardPopup(scene, '領取成功', items.slice(0, 12), onChange);
}

/** 打開信箱；onChange 在領取或讀信後呼叫（用來重畫大廳） */
export function openMailbox(scene: Phaser.Scene, onChange: () => void) {
  const layer = scene.add.container(0, 0).setDepth(120);
  let changed = false;
  const close = () => {
    layer.destroy();
    if (changed) onChange();
  };
  const top = 120;
  const ph = 860;
  const frame = () => {
    layer.removeAll(true);
    layer.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05040a, 0.9).setInteractive());
    layer.add(scene.add.rectangle(W / 2, top + ph / 2, 510, ph, 0x0d0a1c, 0.97).setStrokeStyle(2, COLORS.cyan, 0.7));
  };
  const list = () => {
    frame();
    const s = loadSave();
    layer.add(scene.add.text(W / 2, top + 36, '信箱', textStyle(28, '#ffffff')).setOrigin(0.5).setStroke('#ff3d81', 5));
    const mails = visibleMails();
    mails.forEach((m, i) => {
      const y = top + 110 + i * 104;
      const read = s.mailRead.includes(m.id);
      const gift = claimable(m, s);
      const row = scene.add.rectangle(W / 2, y, 470, 92, read && !gift ? 0x110d1f : 0x1a1530, 0.98).setStrokeStyle(2, gift ? COLORS.gold : read ? 0x3a3168 : COLORS.cyan, 0.9);
      layer.add(row);
      const ic = scene.add.image(W / 2 - 194, y, scene.textures.exists('ui-ic-mail') ? 'ui-ic-mail' : 'ui-ic-codex');
      ic.setScale(54 / Math.max(ic.width, ic.height));
      if (read && !gift) ic.setAlpha(0.45);
      layer.add(ic);
      layer.add(scene.add.text(W / 2 - 154, y - 16, m.title, textStyle(16, m.dev ? '#ffd84d' : read ? '#a9a6c0' : '#ffffff')).setOrigin(0, 0.5));
      layer.add(scene.add.text(W / 2 - 154, y + 16, `${m.from}　${m.date}`, textStyle(12, COLORS.dim, false)).setOrigin(0, 0.5));
      if (gift) layer.add(scene.add.text(W / 2 + 222, y, '有獎勵', textStyle(13, '#ffd84d')).setOrigin(1, 0.5).setStroke('#07060d', 3));
      else if (m.rewards?.length) layer.add(scene.add.text(W / 2 + 222, y, '已領取', textStyle(12, '#5dff7a', false)).setOrigin(1, 0.5));
      if (!read) layer.add(scene.add.circle(W / 2 - 228, y - 38, 7, 0xff2244).setStrokeStyle(2, 0x07060d));
      row.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        Audio.play('sfx-click', 0.35);
        detail(m);
      });
    });
    const any = mails.some((m) => claimable(m, s));
    layer.add(
      makeButton(scene, W / 2 - 120, top + ph - 52, 210, 58, '一鍵領取', any ? COLORS.gold : 0x55506e, () => {
        if (!any) return;
        changed = true;
        claim(scene, mails, () => list());
      }, 20),
    );
    layer.add(makeButton(scene, W / 2 + 120, top + ph - 52, 210, 58, '關閉', COLORS.cyan, close, 20));
  };
  const detail = (m: Mail) => {
    const s = loadSave();
    if (!s.mailRead.includes(m.id)) {
      s.mailRead.push(m.id);
      writeSave(s);
      changed = true;
    }
    frame();
    layer.add(scene.add.text(W / 2, top + 40, m.title, textStyle(20, m.dev ? '#ffd84d' : '#ffffff')).setOrigin(0.5).setStroke('#07060d', 4));
    layer.add(scene.add.text(W / 2, top + 72, `${m.from}　${m.date}`, textStyle(12, COLORS.dim, false)).setOrigin(0.5));
    layer.add(scene.add.rectangle(W / 2, top + 96, 450, 2, COLORS.cyan, 0.4));
    const body = scene.add.text(W / 2 - 220, top + 116, m.body, { ...textStyle(15, '#e9f6ff', false), wordWrap: { width: 440, useAdvancedWrap: true }, lineSpacing: 8 });
    layer.add(body);
    let y = Math.max(top + 330, top + 116 + body.height + 30);
    if (m.rewards?.length) {
      layer.add(scene.add.text(W / 2 - 220, y, '附件獎勵', textStyle(16, '#ffd84d')).setOrigin(0, 0.5));
      y += 34;
      m.rewards.forEach((r, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = W / 2 - 220 + col * 228;
        const yy = y + row * 50;
        layer.add(scene.add.rectangle(x + 108, yy, 216, 44, 0x14102a, 0.95).setStrokeStyle(1, 0x3a3168));
        if (scene.textures.exists(r.icon)) {
          const im = scene.add.image(x + 22, yy, r.icon);
          im.setScale(34 / Math.max(im.width, im.height));
          layer.add(im);
        }
        layer.add(scene.add.text(x + 46, yy, r.label, textStyle(13, '#ffffff', false)).setOrigin(0, 0.5));
      });
    }
    const can = claimable(m, loadSave());
    if (m.rewards?.length)
      layer.add(
        makeButton(scene, W / 2 - 120, top + ph - 52, 210, 58, can ? '領取' : '已領取', can ? COLORS.gold : 0x55506e, () => {
          if (!claimable(m, loadSave())) return;
          changed = true;
          claim(scene, [m], () => detail(m));
        }, 20),
      );
    layer.add(makeButton(scene, m.rewards?.length ? W / 2 + 120 : W / 2, top + ph - 52, 210, 58, '返回', COLORS.cyan, list, 20));
  };
  list();
  layer.setAlpha(0);
  scene.tweens.add({ targets: layer, alpha: 1, duration: 160 });
}
