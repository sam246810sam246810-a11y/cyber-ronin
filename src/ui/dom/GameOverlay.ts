// 選單（狀態／裝備／背包）與商店：用 HTML 疊在遊戲畫面上，文字清楚、清單可以捲動。
import shops from '../../data/shop.json';
import classes from '../../data/classes.json';
import { DIFFICULTY, ITEMS } from '../../systems/combat';
import {
  BASES, RARITIES, SELL_RATE, SLOT_NAME, SLOTS, canUse, equipName, equipValue, formatStat, sellPrice,
  type BaseId, type Equip, type Slot, type StatKey,
} from '../../systems/equipment';
import { BAG_EXPAND, BAG_MAX, canAddGear, canAddItem, equippedUids, slotsUsed } from '../../systems/inventory';
import { expToNext, LEVEL_CAP, type Stats } from '../../systems/progression';
import { equip, gameState, statsIfSwapped, statsOf, unequip, useItem } from '../../systems/gameState';
import { OVERLAY_CSS } from './overlay.css';
import { MAPS } from '../../data/maps';
import { collectionReport } from '../../systems/collection';
import bestiary from '../../data/bestiary.json';
import enemyData from '../../data/enemies.json';
import { ACHIEVEMENTS } from '../../systems/achievements';
import { MANUAL_SLOTS, formatPlayTime, readSave, serialize, writeSave, type SaveFile, type SlotId } from '../../systems/save';
import type { CreditsInfo, SaveRequest } from '../../systems/events';
import { accept, dailyBounties, dateKey, isReady, offersFrom, progressOf, questDef, rewardText, turnIn, type QuestDef } from '../../systems/quests';
import { className, currentObjective, learnedSkills, setSkillSlot } from '../../systems/gameState';
import skillData from '../../data/skills.json';
import classData from '../../data/classes.json';
import jobData from '../../data/jobs.json';
import { getSettings, updateSettings, type Settings } from '../../systems/settings';
import { sound } from '../../audio/sound';
import { FISH_HITS, FISH_MISSES, inZone, rollFish, type Fish } from '../../systems/fishing';
import { canCook, cook, FOODS, FOOD_BY_NAME } from '../../systems/cooking';
import { MAX_PLUS, RECIPES, SYNTH_COST, craft, enhance, enhanceCost, missingFor, recipeOutput, synthesize } from '../../systems/forge';

type MenuTab = 'status' | 'equip' | 'bag' | 'map' | 'quest' | 'settings' | 'skills' | 'bestiary' | 'achievements';
type ShopTab = 'buy' | 'sell';
type Selection = { kind: 'gear'; uid: number } | { kind: 'item'; name: string } | { kind: 'buyItem'; name: string } | { kind: 'buyGear'; base: BaseId } | null;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ITEM_DESC: Record<string, string> = {
  '回復丸': 'HP 回復 50', '大回復丸': 'HP 回復 150', '靈水': 'MP 回復 30', '解毒草': '解除中毒、燒傷', '萬能符': '解除所有狀態異常',
  '銅鑰匙': '可以打開上鎖的鐵箱。用一次就沒了。',
  '銀鑰匙': '從土蜘蛛身上得到的鑰匙。好像能打開某處更堅固的箱子。（第二章）',
  '狐火的殘焰': '素材。摸起來不燙。',
  '唐傘的破布': '素材。很耐用的油紙布。',
  '野狐的毛': '素材。蓬鬆又保暖。',
  '蜘蛛絲': '素材。比鋼線還堅韌。',
  '玉鋼': '素材。鍛冶屋打造武器用的好鋼。',
  '河童的皿碎片': '素材。又硬又光滑。',
  '泥塊': '素材。黏性很強的泥。',
  '酒吞的葫蘆': '酒吞童子的酒葫蘆。已經空了。',
  '真・神器': '5 枚碎片合而為一的神器。散發著溫暖的光。',
  '珊瑚碎片': '素材。龍宮附近的珊瑚，閃著光。',
  '海坊主的墨': '素材。黑得發亮的墨汁。',
  '鬼的角': '素材。堅硬，帶著怒氣。',
  '神器碎片': '散落在各地的神器碎片。集齊 5 枚，或許會發生什麼……',
  '天狗的羽': '素材。輕盈，帶著風的力量。',
  '鎌鼬的爪': '素材。鋒利得能削斷鐵。',
  '大天狗的團扇': '大天狗交給你的團扇。（第四章）',
  '河童王的冠': '河童王身上掉下來的冠。好像在哪裡會派上用場。（第三章）',
  '擴充布袋': `背包增加 ${BAG_EXPAND} 格（最多 ${BAG_MAX} 格）`,
};
const STAT_ROWS: [keyof Stats, string][] = [['maxHp', 'HP'], ['maxMp', 'MP'], ['atk', '攻擊'], ['def', '防禦'], ['spd', '速度'], ['crit', '爆擊率'], ['mpRegen', 'MP 回復']];

function gearStatLines(e: Equip): string {
  const k = 1 + 0.08 * (e.plus ?? 0);
  const base = Object.fromEntries(Object.entries(BASES[e.base].stats).map(([s, v]) => [s, Math.round(v * k * 10) / 10])) as Record<StatKey, number>;
  const lines = Object.entries(base).map(([k, v]) => `<li>${formatStat(k as StatKey, v)}</li>`);
  for (const a of e.affixes) lines.push(`<li style="color:${RARITIES[Math.max(1, e.rarity)].color}">${formatStat(a.stat, a.value)}</li>`);
  return `<ul class="kf-stats">${lines.join('')}</ul>`;
}

function diffLines(now: Stats, next: Stats): string {
  const rows = STAT_ROWS.map(([k, label]) => {
    const d = Math.round((next[k] - now[k]) * 10) / 10;
    if (!d) return '';
    return `<li class="${d > 0 ? 'kf-up' : 'kf-down'}">${label} ${d > 0 ? '▲' : '▼'}${Math.abs(d)}${k === 'crit' ? '%' : ''}</li>`;
  }).join('');
  return rows ? `<ul class="kf-stats">${rows}</ul>` : '<div class="kf-mute">能力不變</div>';
}

/** 整個遊戲共用一個疊加層 */
let shared: GameOverlay | null = null;
export function getOverlay(): GameOverlay { return (shared ??= new GameOverlay()); }

export class GameOverlay {
  private root: HTMLDivElement;
  private mode: 'menu' | 'shop' | 'save' | 'load' | 'board' | 'forge' | 'credits' | 'fishing' | 'cook' = 'menu';
  private fishSpot = 'pond';
  private fishState: { phase: 'wait' | 'bite' | 'done'; pos: number; dir: number; hits: number; misses: number; fish?: Fish; raf?: number; timer?: number; result?: string } = { phase: 'wait', pos: 0, dir: 1, hits: 0, misses: 0 };
  private credits?: CreditsInfo;
  private onTitle: () => void = () => {};
  private onNGPlus: () => void = () => {};
  private forgeTab: 'craft' | 'enhance' | 'synth' = 'craft';
  private recipe = '';
  private synthSel: number[] = [];
  private saveReq?: SaveRequest;
  private onLoad: (f: SaveFile) => void = () => {};
  private onWarp: (map: string, spawn: string) => void = () => {};
  private beast = '';
  private confirmSlot: SlotId | null = null;
  private menuTab: MenuTab = 'status';
  private shopTab: ShopTab = 'buy';
  private shopId = 'rin';
  private slot: Slot = 'weapon';
  private sel: Selection = null;
  private msg = '';
  private confirmDrop = false;
  private onClose: () => void = () => {};

  constructor() {
    if (!document.getElementById('kf-style')) {
      const st = document.createElement('style'); st.id = 'kf-style'; st.textContent = OVERLAY_CSS; document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.className = 'kf-overlay';
    this.root.hidden = true;
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
    // 擋住觸控事件，避免傳到遊戲畫布
    for (const t of ['pointerdown', 'pointerup', 'touchstart', 'touchend']) this.root.addEventListener(t, (e) => e.stopPropagation());
  }

  get isOpen(): boolean { return !this.root.hidden; }

  openMenu(onClose: () => void): void { this.mode = 'menu'; this.open(onClose); }
  openShop(shopId: string, onClose: () => void): void { this.mode = 'shop'; this.shopId = shopId; this.shopTab = 'buy'; this.open(onClose); }
  openCredits(info: CreditsInfo, onTitle: () => void, onContinue: () => void, onNGPlus: () => void): void { this.mode = 'credits'; this.credits = info; this.onTitle = onTitle; this.onNGPlus = onNGPlus; this.open(onContinue); }
  openCook(onClose: () => void): void { this.mode = 'cook'; this.open(onClose); }
  openFishing(spot: string, onClose: () => void): void {
    this.mode = 'fishing'; this.fishSpot = spot;
    this.fishState = { phase: 'wait', pos: 0, dir: 1, hits: 0, misses: 0 };
    this.open(onClose);
    this.startFishing();
  }

  /** 釣魚：等 1～3 秒上鉤，指針左右跑，在綠色區域按「拉」 */
  private startFishing(): void {
    const f = this.fishState;
    f.timer = window.setTimeout(() => {
      if (this.mode !== 'fishing' || this.root.hidden) return;
      f.phase = 'bite'; f.fish = rollFish(this.fishSpot); f.pos = 0; f.dir = 1;
      this.render();
      let last = performance.now();
      const speed = 1.1 + (0.3 - (f.fish.zone ?? 0.3)) * 3; // 越難的魚跑越快
      const step = (t: number) => {
        if (f.phase !== 'bite' || this.root.hidden) return;
        f.pos += f.dir * speed * ((t - last) / 1000); last = t;
        if (f.pos > 1) { f.pos = 1; f.dir = -1; } else if (f.pos < 0) { f.pos = 0; f.dir = 1; }
        const m = this.root.querySelector<HTMLElement>('.kf-needle'); if (m) m.style.left = `${f.pos * 100}%`;
        f.raf = requestAnimationFrame(step);
      };
      f.raf = requestAnimationFrame(step);
    }, 1000 + Math.random() * 2000);
  }

  private fishPull(): void {
    const f = this.fishState;
    if (f.phase !== 'bite' || !f.fish) return;
    if (inZone(f.pos, f.fish.zone)) f.hits++; else f.misses++;
    if (f.hits >= FISH_HITS) {
      f.phase = 'done'; gameState.items[f.fish.name] = (gameState.items[f.fish.name] ?? 0) + 1;
      f.result = `釣到了「${f.fish.name}」！${f.fish.desc}`; sound.sfx('chest');
    } else if (f.misses >= FISH_MISSES) { f.phase = 'done'; f.result = '魚跑掉了……'; sound.sfx('wrong'); }
    else sound.sfx(inZone(f.pos, f.fish.zone) ? 'pickup' : 'hit');
    this.render();
  }

  private fishingView(): string {
    const f = this.fishState;
    const body = f.phase === 'wait' ? '<div style="font-size:16px">靜靜等待……浮標動了就要準備！</div>'
      : f.phase === 'bite' ? `<div style="font-size:16px;color:#f2c94c">上鉤了！指針進到綠色區域時按「拉！」</div>
          <div style="position:relative;height:28px;width:min(420px,80vw);background:#2a2640;border-radius:6px;overflow:hidden;margin:10px auto">
            <div style="position:absolute;top:0;bottom:0;left:${(0.5 - f.fish!.zone / 2) * 100}%;width:${f.fish!.zone * 100}%;background:#3a8a4a"></div>
            <div class="kf-needle" style="position:absolute;top:0;bottom:0;width:4px;margin-left:-2px;background:#f2e6c9;left:${f.pos * 100}%"></div></div>
          <div class="kf-tag">成功 ${f.hits}/${FISH_HITS}・失手 ${f.misses}/${FISH_MISSES}</div>
          <div class="kf-btns" style="justify-content:center"><button class="kf-btn" data-act="pull" style="min-width:140px;min-height:48px;font-size:18px">拉！</button></div>`
      : `<div style="font-size:16px">${esc(f.result ?? '')}</div><div class="kf-btns" style="justify-content:center"><button class="kf-btn" data-act="fishAgain">再釣一次</button><button class="kf-btn secondary" data-act="close">收竿</button></div>`;
    return `<div class="kf-col" style="grid-column:1 / -1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center">${body}</div>`;
  }

  private cookView(): string {
    const s = gameState;
    const rows = FOODS.map((f) => {
      const ok = canCook(s, f);
      const mats = Object.entries(f.mats).map(([n, c]) => `<span class="${(s.items[n] ?? 0) >= c ? 'kf-up' : 'kf-down'}">${esc(n)} ${s.items[n] ?? 0}/${c}</span>`).join('、');
      return `<div class="kf-card"><h3>${esc(f.name)}${s.items[f.name] ? `　<span class="kf-tag">持有 ${s.items[f.name]}</span>` : ''}</h3><div>${esc(f.desc)}</div><div class="kf-tag">材料：${mats}</div>
        <div class="kf-btns"><button class="kf-btn" data-cookfood="${esc(f.name)}" ${ok ? '' : 'disabled'}>料理</button></div></div>`;
    }).join('');
    return `<div class="kf-col" style="grid-column:1 / -1;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;align-content:start">
      <div class="kf-tag" style="grid-column:1 / -1">做好的料理在「選單 → 背包」使用。有加成的料理，效果時間內再吃會重新計時。</div>${rows}<div class="kf-msg" style="grid-column:1 / -1">${esc(this.msg)}</div></div>`;
  }

  openBoard(onClose: () => void): void { this.mode = 'board'; this.open(onClose); }
  openForge(onClose: () => void): void { this.mode = 'forge'; this.forgeTab = 'craft'; this.recipe = ''; this.synthSel = []; this.open(onClose); }
  openSave(req: SaveRequest, onClose: () => void, onWarp: (map: string, spawn: string) => void = () => {}): void { this.mode = 'save'; this.saveReq = req; this.onWarp = onWarp; this.open(onClose); }
  openLoad(onLoad: (f: SaveFile) => void, onClose: () => void): void { this.mode = 'load'; this.onLoad = onLoad; this.open(onClose); }

  private open(onClose: () => void): void {
    this.onClose = onClose; this.sel = null; this.msg = ''; this.confirmDrop = false; this.confirmSlot = null;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    if (this.root.hidden) return;
    if (this.fishState.raf) cancelAnimationFrame(this.fishState.raf);
    if (this.fishState.timer) clearTimeout(this.fishState.timer);
    this.fishState.phase = 'done';
    this.root.hidden = true;
    this.onClose();
  }

  // ---------- 畫面 ----------
  private slotView(): string {
    const saving = this.mode === 'save';
    const slots: SlotId[] = saving ? MANUAL_SLOTS : ['auto', ...MANUAL_SLOTS];
    const cards = slots.map((slot) => {
      const f = readSave(slot);
      const name = slot === 'auto' ? '自動存檔' : `存檔 ${Number(slot) + 1}`;
      const info = f ? `<div>燈・${classes[f.state.classId].name}　Lv.${f.state.level}　${esc(f.areaName)}</div>
        <div class="kf-tag">遊玩 ${formatPlayTime(f.state.playTime ?? 0)}・${new Date(f.savedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>` : '<div class="kf-mute">（空）</div>';
      const confirming = this.confirmSlot === slot;
      const btn = saving
        ? `<button class="kf-btn" data-saveslot="${slot}">${f ? (confirming ? '確定覆蓋？' : '覆蓋存檔') : '存在這裡'}</button>`
        : `<button class="kf-btn" data-loadslot="${slot}" ${f ? '' : 'disabled'}>讀取</button>`;
      return `<div class="kf-card"><h3>${name}</h3>${info}<div class="kf-btns">${btn}</div></div>`;
    }).join('');
    const tip = saving ? '在地藏前可以存檔。換地圖時也會自動存檔。' : '選一個存檔繼續。';
    const name = (m: string) => String(((MAPS[m] as { properties?: { name: string; value: unknown }[] }).properties ?? []).find((p) => p.name === 'displayName')?.value ?? m);
    const here = this.saveReq ? `jizo:${this.saveReq.map}:${this.saveReq.spawn}` : '';
    const travel = saving ? [...gameState.flags].filter((f) => f.startsWith('jizo:') && f !== here && MAPS[f.split(':')[1]])
      .map((f) => { const [, m, sp] = f.split(':'); return `<button class="kf-btn secondary" data-warp="${m}:${sp}">${esc(name(m))}${sp === 'jizo_entry' ? '（入口）' : ''}</button>`; }).join('') : '';
    const travelBox = saving ? `<div class="kf-card" style="grid-column:1 / -1"><h3>傳送到其他地藏</h3>${travel ? `<div class="kf-btns">${travel}</div>` : '<div class="kf-mute">參拜過其他地藏後，就能從這裡傳送過去。</div>'}</div>` : '';
    return `<div class="kf-col" style="grid-column:1 / -1;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;align-content:start">
      <div class="kf-tag" style="grid-column:1 / -1">${tip}</div>${travelBox}${cards}<div class="kf-msg" style="grid-column:1 / -1">${esc(this.msg)}</div></div>`;
  }

  private questCard(id: string, q: QuestDef, actions: string): string {
    const s = gameState, p = s.quests[id];
    const status = !p ? '' : p.status === 'done' ? '<span class="kf-up">✔ 已完成</span>'
      : isReady(s, id) ? '<span class="kf-up">可以交付</span>' : `<span class="kf-tag">進度 ${progressOf(s, id)}/${q.target.count}</span>`;
    const who = q.giver === 'board' ? '告示板' : ({ taro: '太郎', ume: '阿梅', tesshin: '鐵心', rin: '阿鈴' } as Record<string, string>)[q.giver] ?? q.giver;
    return `<div class="kf-card"><h3>${esc(q.name)}</h3><div>${esc(q.desc)}</div>
      <div class="kf-tag">獎勵：${esc(rewardText(q))}・回報：${who}</div><div>${status}</div>${actions ? `<div class="kf-btns">${actions}</div>` : ''}</div>`;
  }

  private boardView(): string {
    const s = gameState, today = dateKey(new Date());
    const offers = offersFrom(s, 'board').map((id) => this.questCard(id, questDef(id, s.flags)!, `<button class="kf-btn" data-accept="${id}">接受</button>`));
    const mine = Object.keys(s.quests).filter((id) => s.quests[id].status === 'active' && questDef(id, s.flags)?.giver === 'board' && !id.startsWith('daily:'))
      .map((id) => this.questCard(id, questDef(id, s.flags)!, isReady(s, id) ? `<button class="kf-btn" data-turnin="${id}">交付</button>` : ''));
    const daily = Object.entries(dailyBounties(today, s.flags)).map(([id, q]) => {
      const p = s.quests[id];
      const act = !p ? `<button class="kf-btn" data-accept="${id}">接受</button>` : p.status === 'active' && isReady(s, id) ? `<button class="kf-btn" data-turnin="${id}">交付</button>` : '';
      return this.questCard(id, q, act);
    });
    return `<div class="kf-col" style="display:flex;flex-direction:column;gap:8px"><div class="kf-sec">委託</div>${[...mine, ...offers].join('') || '<div class="kf-empty">目前沒有新的委託。劇情推進後會有更多。</div>'}</div>
      <div class="kf-col" style="display:flex;flex-direction:column;gap:8px"><div class="kf-sec">今日懸賞（${today}，每天換新）</div>${daily.join('') || '<div class="kf-empty">還沒有懸賞。</div>'}<div class="kf-msg">${esc(this.msg)}</div></div>`;
  }

  private skillsView(): string {
    const s = gameState, sk = skillData as Record<string, { name: string; mp: number; cd: number; desc: string }>;
    const learned = learnedSkills(s);
    const later = Object.entries((classData[s.classId] as { later: Record<string, number> }).later).filter(([id]) => !learned.includes(id));
    const rows = learned.map((id) => {
      const k = sk[id], slot = s.skillSlots.indexOf(id);
      return `<div class="kf-card"><h3>${esc(k.name)}${slot >= 0 ? `　<span class="kf-up">技能鈕 ${slot + 1}</span>` : ''}</h3><div>${esc(k.desc)}</div>
        <div class="kf-tag">MP ${k.mp}・冷卻 ${k.cd} 秒</div>
        <div class="kf-btns"><button class="kf-btn secondary" data-slot0="${id}" ${slot === 0 ? 'disabled' : ''}>裝到技能鈕 1</button><button class="kf-btn secondary" data-slot1="${id}" ${slot === 1 ? 'disabled' : ''}>裝到技能鈕 2</button></div></div>`;
    }).join('');
    const jobs = jobData as Record<string, { name: string; base: string }>;
    const jobHint = s.job ? `已轉職為「${className(s)}」` : `Lv10 且第一章結束後，可以找宮司爺爺轉職（${Object.values(jobs).filter((j) => j.base === s.classId).map((j) => j.name).join('／')}）`;
    return `<div class="kf-col" style="display:flex;flex-direction:column;gap:8px"><div class="kf-sec">已學會（點按鈕把技能裝到右下角的技能鈕）</div>${rows}</div>
      <div class="kf-col"><div class="kf-sec">之後會學會</div>${later.map(([id, lv]) => `<div class="kf-row"><span class="n">${esc(sk[id].name)}</span><span class="kf-tag">Lv.${lv}</span></div>`).join('') || '<div class="kf-empty">職業技能都學會了。</div>'}
        <div class="kf-sec">轉職</div><div class="kf-tag">${esc(jobHint)}</div><div class="kf-msg">${esc(this.msg)}</div></div>`;
  }

  private bestiaryView(): string {
    const s = gameState, B = bestiary as Record<string, { area: string; desc: string }>;
    const E = enemyData as Record<string, { name: string; hp: number; atk: number; def: number; elite?: boolean; drops?: { item: string; chance: number }[] }>;
    const ids = Object.keys(B), seen = ids.filter((k) => (s.kills[k] ?? 0) > 0);
    const list = ids.map((k) => {
      const known = (s.kills[k] ?? 0) > 0;
      return `<div class="kf-row" data-beast="${k}" aria-selected="${this.beast === k}"><span class="n">${known ? esc(E[k].name) : '？？？'}</span><span class="q">${known ? `×${s.kills[k]}` : ''}</span></div>`;
    }).join('');
    const k = this.beast, known = k && (s.kills[k] ?? 0) > 0;
    const det = !k ? '<div class="kf-empty">打倒過的妖怪會自動收錄。點左邊查看。</div>' : !known ? '<div class="kf-empty">還沒打倒過這種妖怪。</div>'
      : `<div class="kf-card"><h3>${esc(E[k].name)}${E[k].elite ? '　<span class="kf-tag">強敵</span>' : ''}</h3><div class="kf-tag">出沒：${esc(B[k].area)}・打倒 ${s.kills[k]} 隻</div>
        <div>${esc(B[k].desc)}</div><dl class="kf-grid"><dt>HP</dt><dd>${E[k].hp}</dd><dt>攻擊</dt><dd>${E[k].atk}</dd><dt>防禦</dt><dd>${E[k].def}</dd></dl>
        <div class="kf-sec">掉落</div><div>${(E[k].drops ?? []).map((d) => `${esc(d.item)}（${Math.round(d.chance * 100)}%）`).join('、') || '—'}</div></div>`;
    return `<div class="kf-col"><div class="kf-sec">收錄 ${seen.length}/${ids.length}</div>${list}</div><div class="kf-col">${det}</div>`;
  }

  private achievementsView(): string {
    const s = gameState, got = ACHIEVEMENTS.filter((a) => s.flags.has(`ach:${a.id}`)).length;
    const rows = ACHIEVEMENTS.map((a) => {
      const done = s.flags.has(`ach:${a.id}`);
      const rw = [a.reward.money ? `${a.reward.money} 文` : '', ...Object.entries(a.reward.items ?? {}).map(([n, c]) => `${n} ×${c}`)].filter(Boolean).join('、');
      return `<div class="kf-row" style="${done ? '' : 'opacity:.55'}"><span class="k">${done ? '<span class="kf-up">✔</span>' : '・'}</span><span class="n"><b>${esc(a.name)}</b>　<span class="kf-tag">${esc(a.desc)}</span></span><span class="kf-tag">${esc(rw)}</span></div>`;
    }).join('');
    return `<div class="kf-col" style="grid-column:1 / -1"><div class="kf-sec">達成 ${got}/${ACHIEVEMENTS.length}</div>${rows}</div>`;
  }

  private settingsView(): string {
    const st = getSettings(), s = gameState;
    const row = (key: keyof Settings, label: string, values: [number, string][]) => `<div class="kf-sec">${label}</div><div class="kf-btns">${values.map(([v, t]) =>
      `<button class="kf-tab" data-setting="${key}" data-value="${v}" aria-selected="${Math.abs(st[key] - v) < 0.01}">${t}</button>`).join('')}</div>`;
    const vol: [number, string][] = [[0, '關'], [0.25, '小'], [0.5, '中'], [0.75, '大'], [1, '最大']];
    const order = ['easy', 'normal', 'hard'] as const, cur = order.indexOf(s.difficulty);
    const diffs = order.map((d, i) => `<button class="kf-tab" data-diff="${d}" aria-selected="${d === s.difficulty}" ${i > cur ? 'disabled style="opacity:.35"' : ''}>${DIFFICULTY[d].name}</button>`).join('');
    return `<div class="kf-col">${row('music', '音樂', vol)}${row('sfx', '音效', vol)}
        ${row('buttonAlpha', '觸控按鈕透明度', [[0.4, '很透明'], [0.7, '半透明'], [1, '不透明']])}
        <div class="kf-tag" style="margin-top:8px">聲音要在第一次點畫面後才會開始（瀏覽器的規定）。</div></div>
      <div class="kf-col"><div class="kf-sec">難度</div><div class="kf-btns">${diffs}</div>
        <div class="kf-tag">遊戲中只能調降，不能調高。下次進入地圖時生效。</div><div class="kf-msg">${esc(this.msg)}</div></div>`;
  }

  private questView(): string {
    const s = gameState;
    const active = Object.keys(s.quests).filter((id) => s.quests[id].status === 'active' && questDef(id, s.flags));
    const done = Object.keys(s.quests).filter((id) => s.quests[id].status === 'done' && questDef(id, s.flags));
    return `<div class="kf-col" style="display:flex;flex-direction:column;gap:8px"><div class="kf-sec">主線</div><div class="kf-card"><h3>${esc(currentObjective(s.flags))}</h3></div>
        <div class="kf-sec">進行中</div>${active.map((id) => this.questCard(id, questDef(id, s.flags)!, '')).join('') || '<div class="kf-empty">沒有進行中的任務。頭上有「！」的人有事想拜託你，村子神社前的告示板也有委託。</div>'}</div>
      <div class="kf-col"><div class="kf-sec">已完成（${done.length}）</div>${done.map((id) => `<div class="kf-row"><span class="n">${esc(questDef(id, s.flags)!.name)}</span><span class="kf-up">✔</span></div>`).join('') || '<div class="kf-empty">還沒有完成的任務。</div>'}</div>`;
  }

  private forgeView(): string {
    const s = gameState;
    if (this.forgeTab === 'craft') {
      const list = Object.entries(RECIPES).map(([id, r]) => {
        const can = missingFor(s, r).length === 0;
        return `<div class="kf-row" data-recipe="${id}" aria-selected="${this.recipe === id}"><span class="n">${esc(BASES[recipeOutput(r, s.classId)].name)}</span><span class="${can ? 'kf-up' : 'kf-mute'}">${can ? '可以打造' : '材料不足'}</span></div>`;
      }).join('');
      let det = '<div class="kf-empty">選一張配方。素材從怪物身上掉落。</div>';
      const r = RECIPES[this.recipe];
      if (r) {
        const fake: Equip = { uid: -1, base: recipeOutput(r, s.classId), rarity: r.rarity, affixes: [] };
        const mats = Object.entries(r.mats).map(([n, c]) => `<li class="${(s.items[n] ?? 0) >= c ? 'kf-up' : 'kf-down'}">${esc(n)} ${s.items[n] ?? 0}/${c}</li>`).join('');
        const now = statsOf(s), slot = BASES[fake.base].slot;
        s.gear.push(fake); const next = statsIfSwapped(s, slot, -1); s.gear.pop();
        det = `<div class="kf-card">${this.gearTitle(fake)}${gearStatLines(fake)}<div class="kf-sec">換上後</div>${diffLines(now, next)}
          <div class="kf-sec">材料</div><ul class="kf-stats">${mats}<li class="${s.money >= r.money ? 'kf-up' : 'kf-down'}">${r.money} 文</li></ul>
          <div class="kf-btns"><button class="kf-btn" data-act="craft" ${missingFor(s, r).length ? 'disabled' : ''}>打造</button></div></div>`;
      }
      return `<div class="kf-col">${list}</div><div class="kf-col">${det}<div class="kf-msg">${esc(this.msg)}</div></div>`;
    }
    if (this.forgeTab === 'enhance') {
      const worn = equippedUids(s);
      const list = [...s.gear].sort((a, b) => Number(worn.has(b.uid)) - Number(worn.has(a.uid))).map((g) =>
        `<div class="kf-row" data-gear="${g.uid}" aria-selected="${this.sel?.kind === 'gear' && this.sel.uid === g.uid}"><span class="k">${SLOT_NAME[BASES[g.base].slot]}</span><span class="n" style="color:${RARITIES[g.rarity].color}">${esc(equipName(g))}</span>${worn.has(g.uid) ? '<span class="kf-tag">裝備中</span>' : ''}</div>`).join('');
      let det = '<div class="kf-empty">選一件要強化的裝備。每強化一級，基礎能力 +8%。</div>';
      const g = this.sel?.kind === 'gear' ? s.gear.find((x) => x.uid === (this.sel as { uid: number }).uid) : undefined;
      if (g) {
        const plus = g.plus ?? 0;
        if (plus >= MAX_PLUS) det = `<div class="kf-card">${this.gearTitle(g)}${gearStatLines(g)}<div class="kf-up">已經強化到最高 +${MAX_PLUS}</div></div>`;
        else {
          const c = enhanceCost(plus), next: Equip = { ...g, plus: plus + 1 };
          const ok = (s.items['玉鋼'] ?? 0) >= c.mats['玉鋼'] && s.money >= c.money;
          det = `<div class="kf-card">${this.gearTitle(g)}<div class="kf-sec">強化後（+${plus + 1}）</div>${gearStatLines(next)}
            <div class="kf-sec">花費</div><ul class="kf-stats"><li class="${(s.items['玉鋼'] ?? 0) >= c.mats['玉鋼'] ? 'kf-up' : 'kf-down'}">玉鋼 ${s.items['玉鋼'] ?? 0}/${c.mats['玉鋼']}</li><li class="${s.money >= c.money ? 'kf-up' : 'kf-down'}">${c.money} 文</li></ul>
            <div class="kf-btns"><button class="kf-btn" data-act="enhance" ${ok ? '' : 'disabled'}>強化</button></div></div>`;
        }
      }
      return `<div class="kf-col">${list}</div><div class="kf-col">${det}<div class="kf-msg">${esc(this.msg)}</div></div>`;
    }
    const worn = equippedUids(s);
    const first = this.synthSel.length ? s.gear.find((g) => g.uid === this.synthSel[0])?.rarity : undefined;
    const list = s.gear.filter((g) => !worn.has(g.uid) && g.rarity < 4).sort((a, b) => a.rarity - b.rarity).map((g) => {
      const picked = this.synthSel.includes(g.uid), blocked = first != null && g.rarity !== first && !picked;
      return `<div class="kf-row" data-synth="${g.uid}" aria-selected="${picked}" style="${blocked ? 'opacity:.35' : ''}"><span class="k">${picked ? '✔' : RARITIES[g.rarity].name}</span><span class="n" style="color:${RARITIES[g.rarity].color}">${esc(equipName(g))}</span></div>`;
    }).join('') || '<div class="kf-empty">背包裡沒有可以合成的裝備（穿在身上的、傳說的不能合成）。</div>';
    const ok = this.synthSel.length === 3 && s.money >= SYNTH_COST;
    const next = first != null ? RARITIES[Math.min(4, first + 1)] : null;
    return `<div class="kf-col"><div class="kf-tag">選 3 件同樣稀有度的裝備</div>${list}</div>
      <div class="kf-col"><div class="kf-card"><h3>合成</h3><div>已選 ${this.synthSel.length}/3</div>
        ${next ? `<div>會得到一件隨機的 <span style="color:${next.color}">${next.name}</span> 裝備</div>` : ''}<div class="kf-tag">花費 ${SYNTH_COST} 文。強化等級不會保留。</div>
        <div class="kf-btns"><button class="kf-btn" data-act="synth" ${ok ? '' : 'disabled'}>合成</button><button class="kf-btn secondary" data-act="synthClear">清除選擇</button></div></div><div class="kf-msg">${esc(this.msg)}</div></div>`;
  }

  private creditsView(): string {
    const c = this.credits!;
    const staff = [['企劃・PRD', '你'], ['程式・關卡・劇本', 'Claude'], ['像素美術', '程式產生（原創）'], ['音樂・音效', 'Web Audio 即時合成（原創）'], ['遊戲引擎', 'Phaser 3'], ['特別感謝', '一路陪燈走到最後的你']];
    return `<div class="kf-col" style="grid-column:1 / -1;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:16px">
      <div style="font-size:12px;color:#a39fb8;letter-spacing:.3em">狐火行　KITSUNEBI</div>
      <h2 style="margin:0;font-size:26px;color:#f2e6c9;text-shadow:0 3px 0 #c23b2f">${esc(c.title)}</h2>
      <div class="kf-tag">${esc(c.sub)}</div>
      <div style="display:grid;grid-template-columns:auto auto;gap:4px 18px;margin:8px 0">${staff.map(([k, v]) => `<span class="kf-mute" style="text-align:right">${k}</span><span style="text-align:left">${v}</span>`).join('')}</div>
      <div style="max-width:46ch;color:#f2c94c;font-size:12px">${esc(c.hint)}</div>
      <div class="kf-btns" style="justify-content:center"><button class="kf-btn" data-act="toTitle">回到標題</button><button class="kf-btn secondary" data-act="close">繼續遊玩</button><button class="kf-btn secondary" data-act="ngplus">開始二周目</button></div>
      <div class="kf-tag">二周目：保留等級、職業、裝備與金錢，劇情重新開始，妖怪更強、寶箱更好。神社旁的百鬼塔也已經開放。</div>
    </div>`;
  }

  private render(): void {
    if (this.mode === 'fishing' || this.mode === 'cook') {
      const title = this.mode === 'fishing' ? '釣魚' : '料理';
      this.root.innerHTML = `<div class="kf-panel" role="dialog" aria-label="${title}"><div class="kf-head"><span class="kf-title">${title}</span><span class="kf-spacer"></span>
        <button class="kf-close" data-act="close" aria-label="關閉">✕</button></div><div class="kf-body">${this.mode === 'fishing' ? this.fishingView() : this.cookView()}</div></div>`;
      return;
    }
    if (this.mode === 'credits') {
      this.root.innerHTML = `<div class="kf-panel" role="dialog" aria-label="片尾"><div class="kf-body">${this.creditsView()}</div></div>`;
      return;
    }
    if (this.mode === 'forge') {
      const tabs = ([['craft', '打造'], ['enhance', '強化'], ['synth', '合成']] as const).map(([k, t]) => `<button class="kf-tab" data-ftab="${k}" aria-selected="${this.forgeTab === k}">${t}</button>`).join('');
      this.root.innerHTML = `<div class="kf-panel" role="dialog" aria-label="鍛冶屋"><div class="kf-head"><span class="kf-title">鍛冶屋</span>${tabs}<span class="kf-spacer"></span>
        <span class="kf-mute">玉鋼 ${gameState.items['玉鋼'] ?? 0}</span><span class="kf-money">● ${gameState.money} 文</span><button class="kf-close" data-act="close" aria-label="關閉">✕</button></div><div class="kf-body">${this.forgeView()}</div></div>`;
      return;
    }
    if (this.mode === 'board') {
      this.root.innerHTML = `<div class="kf-panel" role="dialog" aria-label="告示板"><div class="kf-head"><span class="kf-title">告示板</span><span class="kf-spacer"></span>
        <span class="kf-money">● ${gameState.money} 文</span><button class="kf-close" data-act="close" aria-label="關閉">✕</button></div><div class="kf-body">${this.boardView()}</div></div>`;
      return;
    }
    if (this.mode === 'save' || this.mode === 'load') {
      const title = this.mode === 'save' ? '地藏・存檔' : '讀取存檔';
      this.root.innerHTML = `<div class="kf-panel" role="dialog" aria-label="${title}"><div class="kf-head"><span class="kf-title">${title}</span><span class="kf-spacer"></span>
        <button class="kf-close" data-act="close" aria-label="關閉">✕</button></div><div class="kf-body">${this.slotView()}</div></div>`;
      return;
    }
    const s = gameState;
    const tabs = this.mode === 'menu'
      ? ([['status', '狀態'], ['quest', '任務'], ['skills', '技能'], ['equip', '裝備'], ['bag', '背包'], ['map', '收集'], ['bestiary', '圖鑑'], ['achievements', '成就'], ['settings', '設定']] as const).map(([k, t]) => `<button class="kf-tab" data-tab="${k}" aria-selected="${this.menuTab === k}">${t}</button>`).join('')
      : ([['buy', '購買'], ['sell', '賣出']] as const).map(([k, t]) => `<button class="kf-tab" data-stab="${k}" aria-selected="${this.shopTab === k}">${t}</button>`).join('');
    const title = this.mode === 'menu' ? '選單' : '鈴屋';
    const body = this.mode === 'menu'
      ? (this.menuTab === 'status' ? this.statusView() : this.menuTab === 'equip' ? this.equipView() : this.menuTab === 'map' ? this.mapView() : this.menuTab === 'quest' ? this.questView() : this.menuTab === 'settings' ? this.settingsView() : this.menuTab === 'skills' ? this.skillsView() : this.menuTab === 'bestiary' ? this.bestiaryView() : this.menuTab === 'achievements' ? this.achievementsView() : this.bagView())
      : (this.shopTab === 'buy' ? this.buyView() : this.sellView());
    this.root.innerHTML = `<div class="kf-panel" role="dialog" aria-label="${title}">
      <div class="kf-head"><span class="kf-title">${title}</span><div class="kf-tabs">${tabs}</div>
        <span class="kf-mute">背包 ${slotsUsed(s)}/${s.capacity}</span>
        <span class="kf-money">● ${s.money} 文</span><button class="kf-close" data-act="close" aria-label="關閉">✕</button></div>
      <div class="kf-body">${body}</div></div>`;
  }

  private statusView(): string {
    const s = gameState, st = statsOf(s);
    const next = s.level >= LEVEL_CAP ? 0 : expToNext(s.level);
    const pct = next ? Math.floor((s.exp / next) * 100) : 100;
    return `<div class="kf-col">
        <div class="kf-card"><h3>燈・${className(s)}　Lv.${s.level}</h3>
          <div class="kf-tag">經驗 ${next ? `${s.exp} / ${next}（還差 ${next - s.exp}）` : '已達目前等級上限'}</div>
          <div class="kf-bar"><i style="width:${pct}%"></i></div>
          <dl class="kf-grid">
            <dt>HP</dt><dd>${Math.ceil(s.hp)} / ${st.maxHp}</dd><dt>MP</dt><dd>${Math.floor(s.mp)} / ${st.maxMp}</dd>
            <dt>攻擊</dt><dd>${st.atk}</dd><dt>防禦</dt><dd>${st.def}</dd><dt>速度</dt><dd>${st.spd}</dd>
            <dt>爆擊率</dt><dd>${st.crit}%</dd><dt>MP 回復</dt><dd>${st.mpRegen} / 秒</dd>
          </dl></div></div>
      <div class="kf-col"><div class="kf-sec">裝備中</div>
        ${SLOTS.map((sl) => { const g = this.worn(sl); return `<div class="kf-row" data-goslot="${sl}"><span class="k">${SLOT_NAME[sl]}</span><span class="n" style="color:${g ? RARITIES[g.rarity].color : '#6b6780'}">${g ? esc(equipName(g)) : '（空）'}</span></div>`; }).join('')}
        <div class="kf-sec">難度</div><div>${DIFFICULTY[s.difficulty].name}</div></div>`;
  }

  private mapView(): string {
    const s = gameState, r = collectionReport(MAPS, s.openedChests, s.flags);
    const visited = r.areas.filter((a) => s.flags.has(`visited:${a.key}`));
    const rows = visited.map((a) => {
      const done = a.chests[0] + a.secrets[0] === a.chests[1] + a.secrets[1];
      return `<div class="kf-row"><span class="n">${esc(a.name)}${done ? ' <span class="kf-up">✔</span>' : ''}</span>
        <span class="q">寶箱 ${a.chests[0]}/${a.chests[1]}</span><span class="q">隱藏 ${a.secrets[0]}/${a.secrets[1]}</span></div>`;
    }).join('');
    const unknown = r.areas.length - visited.length;
    return `<div class="kf-col"><div class="kf-sec">各區域</div>${rows || '<div class="kf-empty">還沒有去過任何地方。</div>'}
        ${unknown ? `<div class="kf-empty">還有 ${unknown} 個沒去過的區域</div>` : ''}</div>
      <div class="kf-col"><div class="kf-card"><h3>總收集度 ${r.percent}%</h3><div class="kf-bar"><i style="width:${r.percent}%"></i></div>
        <div class="kf-tag">打開寶箱、找到隱藏的密道和房間都會增加收集度。牆上有裂縫的地方打打看；跟著狐火走也會有發現。</div>
        <div class="kf-sec">小地圖標記</div>
        <ul class="kf-stats"><li><span style="color:#4fd8ff">●</span> 自己</li><li><span style="color:#f2c94c">■</span> 沒開的寶箱</li><li><span style="color:#7fe08a">■</span> 出入口</li>
        <li><span style="color:#ff4a4a">■</span> 妖怪</li><li><span style="color:#8a8aa0">■</span> 關著的門</li><li><span style="color:#ff5ae0">■</span> 古井／重要地點</li></ul></div></div>`;
  }

  private worn(slot: Slot): Equip | undefined { const u = gameState.equipped[slot]; return gameState.gear.find((g) => g.uid === u); }

  private equipView(): string {
    const s = gameState;
    const worn = equippedUids(s);
    const left = SLOTS.map((sl) => {
      const g = this.worn(sl);
      return `<div class="kf-row" data-slot="${sl}" aria-selected="${this.slot === sl}"><span class="k">${SLOT_NAME[sl]}</span><span class="n" style="color:${g ? RARITIES[g.rarity].color : '#6b6780'}">${g ? esc(equipName(g)) : '（空）'}</span></div>`;
    }).join('');
    const cur = this.worn(this.slot);
    const now = statsOf(s);
    const options = s.gear.filter((g) => BASES[g.base].slot === this.slot && !worn.has(g.uid));
    const curCard = cur ? `<div class="kf-card"><div class="kf-tag">裝備中・${SLOT_NAME[this.slot]}</div>${this.gearTitle(cur)}${gearStatLines(cur)}
        <div class="kf-btns"><button class="kf-btn secondary" data-act="unequip">卸下</button></div></div>` : `<div class="kf-empty">${SLOT_NAME[this.slot]}沒有裝備。</div>`;
    const list = options.length ? options.map((g) => {
      const usable = canUse(g, s.classId);
      return `<div class="kf-card">${this.gearTitle(g)}${gearStatLines(g)}
        ${usable ? diffLines(now, statsIfSwapped(s, this.slot, g.uid)) : '<div class="kf-down">其他職業的武器，不能裝備</div>'}
        <div class="kf-btns"><button class="kf-btn" data-equip="${g.uid}" ${usable ? '' : 'disabled'}>裝備</button></div></div>`;
    }).join('') : '<div class="kf-empty">背包裡沒有可以換的。</div>';
    return `<div class="kf-col"><div class="kf-sec">點部位查看可替換的裝備</div>${left}<div class="kf-msg">${esc(this.msg)}</div></div>
      <div class="kf-col" style="display:flex;flex-direction:column;gap:8px">${curCard}<div class="kf-sec">可替換</div>${list}</div>`;
  }

  private gearTitle(g: Equip): string {
    return `<h3 style="color:${RARITIES[g.rarity].color}">${esc(equipName(g))}</h3><div class="kf-tag">${RARITIES[g.rarity].name}・${SLOT_NAME[BASES[g.base].slot]}${BASES[g.base].tier >= 2 ? '・上等' : ''}</div>`;
  }

  private bagList(selling: boolean): string {
    const s = gameState, worn = equippedUids(s);
    const items = Object.entries(s.items).filter(([, n]) => n > 0);
    const gear = s.gear.filter((g) => !worn.has(g.uid)).sort((a, b) => SLOTS.indexOf(BASES[a.base].slot) - SLOTS.indexOf(BASES[b.base].slot) || b.rarity - a.rarity);
    const rows: string[] = [];
    rows.push('<div class="kf-sec">道具</div>');
    rows.push(items.length ? items.map(([n, c]) => `<div class="kf-row" data-item="${esc(n)}" aria-selected="${this.sel?.kind === 'item' && this.sel.name === n}"><span class="n">${esc(n)}</span><span class="q">×${c}</span>${selling ? `<span class="kf-money">${this.itemSell(n)} 文</span>` : ''}</div>`).join('') : '<div class="kf-empty">沒有道具</div>');
    rows.push('<div class="kf-sec">裝備（沒穿在身上的）</div>');
    rows.push(gear.length ? gear.map((g) => `<div class="kf-row" data-gear="${g.uid}" aria-selected="${this.sel?.kind === 'gear' && this.sel.uid === g.uid}"><span class="k">${SLOT_NAME[BASES[g.base].slot]}</span><span class="n" style="color:${RARITIES[g.rarity].color}">${esc(equipName(g))}</span>${selling ? `<span class="kf-money">${sellPrice(equipValue(g))} 文</span>` : ''}</div>`).join('') : '<div class="kf-empty">沒有多的裝備</div>');
    return rows.join('');
  }

  private itemSell(name: string): number {
    const p = shops.rin.items.find((i) => i.item === name)?.price ?? 25;
    return sellPrice(p);
  }

  private bagView(): string {
    return `<div class="kf-col">${this.bagList(false)}</div><div class="kf-col">${this.detail(false)}<div class="kf-msg">${esc(this.msg)}</div></div>`;
  }

  private detail(selling: boolean): string {
    const s = gameState, sel = this.sel;
    if (!sel) return `<div class="kf-empty">${selling ? '選一樣要賣的東西。' : '點左邊的東西查看。'}</div>`;
    if (sel.kind === 'item') {
      const n = s.items[sel.name] ?? 0;
      if (!n) return '<div class="kf-empty">已經用完了。</div>';
      const usable = (!!ITEMS[sel.name] && sel.name !== '擴充布袋') || !!FOOD_BY_NAME[sel.name];
      return `<div class="kf-card"><h3>${esc(sel.name)}　×${n}</h3><div>${ITEM_DESC[sel.name] ?? FOOD_BY_NAME[sel.name]?.desc ?? ''}</div><div class="kf-btns">
        ${selling ? `<button class="kf-btn" data-act="sellItem">賣出 1 個（${this.itemSell(sel.name)} 文）</button>`
          : usable ? '<button class="kf-btn" data-act="useItem">使用</button>' : ''}</div></div>`;
    }
    if (sel.kind === 'gear') {
      const g = s.gear.find((x) => x.uid === sel.uid);
      if (!g) return '<div class="kf-empty">已經不在背包裡了。</div>';
      const usable = canUse(g, s.classId), slot = BASES[g.base].slot;
      const cmp = usable ? `<div class="kf-sec">換上後</div>${diffLines(statsOf(s), statsIfSwapped(s, slot, g.uid))}` : '<div class="kf-down">其他職業的武器，不能裝備</div>';
      const btns = selling
        ? `<button class="kf-btn" data-act="sellGear">賣出（${sellPrice(equipValue(g))} 文）</button>`
        : `<button class="kf-btn" data-act="equipSel" ${usable ? '' : 'disabled'}>裝備</button>
           <button class="kf-btn danger" data-act="drop">${this.confirmDrop ? '確定丟掉？' : '丟掉'}</button>`;
      return `<div class="kf-card">${this.gearTitle(g)}${gearStatLines(g)}${cmp}<div class="kf-btns">${btns}</div></div>`;
    }
    return '';
  }

  private buyView(): string {
    const s = gameState, shop = (shops as Record<string, { items: { item: string; price: number }[]; equipment: string[] }>)[this.shopId];
    const items = shop.items.map((i) => `<div class="kf-row" data-buyitem="${esc(i.item)}" aria-selected="${this.sel?.kind === 'buyItem' && this.sel.name === i.item}"><span class="n">${esc(i.item)}</span><span class="kf-money">${i.price} 文</span></div>`).join('');
    const gear = (shop.equipment as BaseId[]).filter((b) => !BASES[b].class || BASES[b].class === s.classId)
      .map((b) => `<div class="kf-row" data-buygear="${b}" aria-selected="${this.sel?.kind === 'buyGear' && this.sel.base === b}"><span class="k">${SLOT_NAME[BASES[b].slot]}</span><span class="n">${esc(BASES[b].name)}</span><span class="kf-money">${BASES[b].price} 文</span></div>`).join('');
    let det = '<div class="kf-empty">選一樣要買的東西。</div>';
    const sel = this.sel;
    if (sel?.kind === 'buyItem') {
      const price = shop.items.find((i) => i.item === sel.name)!.price;
      const bagItem = sel.name === '擴充布袋';
      const ok = s.money >= price && (bagItem ? s.capacity < BAG_MAX : canAddItem(s, sel.name));
      det = `<div class="kf-card"><h3>${esc(sel.name)}</h3><div>${ITEM_DESC[sel.name] ?? ''}</div>${bagItem ? `<div class="kf-tag">目前 ${s.capacity} 格</div>` : `<div class="kf-tag">持有 ${s.items[sel.name] ?? 0}</div>`}
        <div class="kf-btns"><button class="kf-btn" data-act="buyItem" ${ok ? '' : 'disabled'}>買（${price} 文）</button></div></div>`;
    } else if (sel?.kind === 'buyGear') {
      const b = BASES[sel.base], price = b.price;
      const fake: Equip = { uid: -1, base: sel.base, rarity: 0, affixes: [] };
      const now = statsOf(s);
      const nextSt = (() => { s.gear.push(fake); const r = statsIfSwapped(s, b.slot, -1); s.gear.pop(); return r; })();
      det = `<div class="kf-card">${this.gearTitle(fake)}${gearStatLines(fake)}<div class="kf-sec">換上後</div>${diffLines(now, nextSt)}
        <div class="kf-btns"><button class="kf-btn" data-act="buyGear" ${s.money >= price && canAddGear(s) ? '' : 'disabled'}>買（${price} 文）</button></div></div>`;
    }
    return `<div class="kf-col"><div class="kf-sec">道具</div>${items}<div class="kf-sec">裝備（普通品質）</div>${gear}</div>
      <div class="kf-col">${det}<div class="kf-msg">${esc(this.msg)}</div></div>`;
  }

  private sellView(): string {
    return `<div class="kf-col"><div class="kf-tag">賣價是原價的 ${Math.round(SELL_RATE * 100)}%。穿在身上的不能賣。</div>${this.bagList(true)}</div>
      <div class="kf-col">${this.detail(true)}<div class="kf-msg">${esc(this.msg)}</div></div>`;
  }

  // ---------- 操作 ----------
  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cookfood],[data-warp],[data-beast],[data-slot0],[data-slot1],[data-setting],[data-diff],[data-ftab],[data-recipe],[data-synth],[data-accept],[data-turnin],[data-saveslot],[data-loadslot],[data-act],[data-tab],[data-stab],[data-slot],[data-goslot],[data-equip],[data-item],[data-gear],[data-buyitem],[data-buygear]');
    if (!el) { if (e.target === this.root) this.close(); return; }
    const d = el.dataset, s = gameState;
    if (d.act === 'pull') { this.fishPull(); return; }
    if (d.act === 'fishAgain') { this.fishState = { phase: 'wait', pos: 0, dir: 1, hits: 0, misses: 0 }; this.render(); this.startFishing(); return; }
    if (d.cookfood) { this.msg = cook(s, d.cookfood) ?? '材料不夠'; if (this.msg !== '材料不夠') sound.sfx('heal'); this.render(); return; }
    if (d.warp) { const [m, sp] = d.warp.split(':'); this.root.hidden = true; this.onWarp(m, sp); return; }
    if (d.beast) { this.beast = d.beast; this.render(); return; }
    if (d.slot0 || d.slot1) { setSkillSlot(s, d.slot0 ? 0 : 1, (d.slot0 ?? d.slot1)!); this.msg = '換好了'; this.render(); return; }
    if (d.setting) {
      updateSettings({ [d.setting]: Number(d.value) } as Partial<Settings>);
      sound.applyVolume(); sound.sfx('select');
      this.render(); return;
    }
    if (d.diff) {
      const order = ['easy', 'normal', 'hard'];
      if (order.indexOf(d.diff) <= order.indexOf(s.difficulty)) { s.difficulty = d.diff as typeof s.difficulty; this.msg = `難度改成「${DIFFICULTY[s.difficulty].name}」`; }
      this.render(); return;
    }
    if (d.act === 'toTitle') { this.root.hidden = true; this.onTitle(); return; }
    if (d.act === 'ngplus') { this.root.hidden = true; this.onNGPlus(); return; }
    if (d.ftab) { this.forgeTab = d.ftab as 'craft' | 'enhance' | 'synth'; this.sel = null; this.msg = ''; this.synthSel = []; this.render(); return; }
    if (d.recipe) { this.recipe = d.recipe; this.msg = ''; this.render(); return; }
    if (d.synth) {
      const uid = Number(d.synth), g = s.gear.find((x) => x.uid === uid);
      const first = this.synthSel.length ? s.gear.find((x) => x.uid === this.synthSel[0])?.rarity : undefined;
      if (this.synthSel.includes(uid)) this.synthSel = this.synthSel.filter((u) => u !== uid);
      else if (g && this.synthSel.length < 3 && (first == null || g.rarity === first)) this.synthSel.push(uid);
      this.msg = ''; this.render(); return;
    }
    if (d.act === 'craft') { this.msg = craft(s, this.recipe).message; this.render(); return; }
    if (d.act === 'enhance' && this.sel?.kind === 'gear') { this.msg = enhance(s, this.sel.uid).message; this.render(); return; }
    if (d.act === 'synth') { this.msg = synthesize(s, this.synthSel).message; this.synthSel = []; this.render(); return; }
    if (d.act === 'synthClear') { this.synthSel = []; this.render(); return; }
    if (d.accept) { if (accept(s, d.accept)) this.msg = `接受了「${questDef(d.accept, s.flags)?.name}」`; this.render(); return; }
    if (d.turnin) { this.msg = turnIn(s, d.turnin) ?? ''; this.render(); return; }
    if (d.saveslot != null && this.saveReq) {
      const slot = (d.saveslot === 'auto' ? 'auto' : Number(d.saveslot)) as SlotId;
      if (readSave(slot) && this.confirmSlot !== slot) { this.confirmSlot = slot; this.render(); return; }
      const ok = writeSave(slot, serialize(s, this.saveReq.map, this.saveReq.spawn, this.saveReq.areaName));
      this.confirmSlot = null;
      this.msg = ok ? `已存到存檔 ${Number(slot) + 1}` : '存檔失敗：這個瀏覽器不允許儲存資料（例如無痕模式）';
      this.render(); return;
    }
    if (d.loadslot != null) {
      const f = readSave((d.loadslot === 'auto' ? 'auto' : Number(d.loadslot)) as SlotId);
      if (f) { this.root.hidden = true; this.onLoad(f); }
      return;
    }
    if (d.act !== 'close') this.confirmSlot = null;
    if (d.act !== 'drop') this.confirmDrop = false;
    if (d.tab) { this.menuTab = d.tab as MenuTab; this.sel = null; this.msg = ''; }
    else if (d.stab) { this.shopTab = d.stab as ShopTab; this.sel = null; this.msg = ''; }
    else if (d.slot) { this.slot = d.slot as Slot; this.msg = ''; }
    else if (d.goslot) { this.menuTab = 'equip'; this.slot = d.goslot as Slot; }
    else if (d.equip) { equip(s, Number(d.equip)); this.msg = '換好了'; }
    else if (d.item) { this.sel = { kind: 'item', name: d.item }; this.msg = ''; }
    else if (d.gear) { this.sel = { kind: 'gear', uid: Number(d.gear) }; this.msg = ''; }
    else if (d.buyitem) { this.sel = { kind: 'buyItem', name: d.buyitem }; this.msg = ''; }
    else if (d.buygear) { this.sel = { kind: 'buyGear', base: d.buygear as BaseId }; this.msg = ''; }
    else switch (d.act) {
      case 'close': this.close(); return;
      case 'unequip': this.msg = unequip(s, this.slot) ? '卸下了' : '背包滿了，卸不下來'; break;
      case 'useItem': if (this.sel?.kind === 'item') this.msg = useItem(s, this.sel.name) ?? '現在不需要用'; break;
      case 'equipSel': if (this.sel?.kind === 'gear' && equip(s, this.sel.uid)) { this.msg = '換好了'; this.sel = null; } break;
      case 'drop':
        if (this.sel?.kind !== 'gear') break;
        if (!this.confirmDrop) { this.confirmDrop = true; break; }
        { const uid = this.sel.uid; s.gear = s.gear.filter((g) => g.uid !== uid); }
        this.sel = null; this.confirmDrop = false; this.msg = '丟掉了';
        break;
      case 'sellItem': if (this.sel?.kind === 'item' && (s.items[this.sel.name] ?? 0) > 0) {
        const n = this.sel.name; s.items[n]--; if (s.items[n] <= 0) { delete s.items[n]; this.sel = null; }
        const p = this.itemSell(n); s.money += p; this.msg = `賣掉 ${n}，得到 ${p} 文`;
      } break;
      case 'sellGear': if (this.sel?.kind === 'gear') {
        const uid = this.sel.uid, g = s.gear.find((x) => x.uid === uid);
        if (g) { const p = sellPrice(equipValue(g)); s.gear = s.gear.filter((x) => x.uid !== uid); s.money += p; this.msg = `賣掉 ${BASES[g.base].name}，得到 ${p} 文`; }
        this.sel = null;
      } break;
      case 'buyItem': if (this.sel?.kind === 'buyItem') {
        const name = this.sel.name, price = shops.rin.items.find((i) => i.item === name)!.price;
        if (s.money < price) { this.msg = '錢不夠'; break; }
        if (name === '擴充布袋') { if (s.capacity >= BAG_MAX) { this.msg = '背包已經是最大了'; break; } s.capacity += BAG_EXPAND; }
        else { if (!canAddItem(s, name)) { this.msg = '背包滿了'; break; } s.items[name] = (s.items[name] ?? 0) + 1; }
        s.money -= price; this.msg = `買了 ${name}`;
      } break;
      case 'buyGear': if (this.sel?.kind === 'buyGear') {
        const base = this.sel.base, price = BASES[base].price;
        if (s.money < price) { this.msg = '錢不夠'; break; }
        if (!canAddGear(s)) { this.msg = '背包滿了'; break; }
        s.gear.push({ uid: s.nextUid++, base, rarity: 0, affixes: [] }); s.money -= price;
        this.msg = `買了 ${BASES[base].name}，到「選單 → 裝備」換上吧`;
      } break;
    }
    this.render();
  }
}
