// 選單（狀態／裝備／背包）與商店：用 HTML 疊在遊戲畫面上，文字清楚、清單可以捲動。
import shops from '../../data/shop.json';
import classes from '../../data/classes.json';
import { DIFFICULTY, ITEMS } from '../../systems/combat';
import {
  BASES, RARITIES, SELL_RATE, SLOT_NAME, SLOTS, canUse, equipValue, formatStat, sellPrice,
  type BaseId, type Equip, type Slot, type StatKey,
} from '../../systems/equipment';
import { BAG_EXPAND, BAG_MAX, canAddGear, canAddItem, equippedUids, slotsUsed } from '../../systems/inventory';
import { expToNext, LEVEL_CAP, type Stats } from '../../systems/progression';
import { equip, gameState, statsIfSwapped, statsOf, unequip, useItem } from '../../systems/gameState';
import { OVERLAY_CSS } from './overlay.css';
import { MAPS } from '../../data/maps';
import { collectionReport } from '../../systems/collection';
import { MANUAL_SLOTS, formatPlayTime, readSave, serialize, writeSave, type SaveFile, type SlotId } from '../../systems/save';
import type { SaveRequest } from '../../systems/events';

type MenuTab = 'status' | 'equip' | 'bag' | 'map';
type ShopTab = 'buy' | 'sell';
type Selection = { kind: 'gear'; uid: number } | { kind: 'item'; name: string } | { kind: 'buyItem'; name: string } | { kind: 'buyGear'; base: BaseId } | null;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ITEM_DESC: Record<string, string> = {
  '回復丸': 'HP 回復 50', '大回復丸': 'HP 回復 150', '靈水': 'MP 回復 30', '解毒草': '解除中毒、燒傷', '萬能符': '解除所有狀態異常',
  '銅鑰匙': '可以打開上鎖的鐵箱。用一次就沒了。',
  '擴充布袋': `背包增加 ${BAG_EXPAND} 格（最多 ${BAG_MAX} 格）`,
};
const STAT_ROWS: [keyof Stats, string][] = [['maxHp', 'HP'], ['maxMp', 'MP'], ['atk', '攻擊'], ['def', '防禦'], ['spd', '速度'], ['crit', '爆擊率'], ['mpRegen', 'MP 回復']];

function gearStatLines(e: Equip): string {
  const base = BASES[e.base].stats as Record<StatKey, number>;
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
  private mode: 'menu' | 'shop' | 'save' | 'load' = 'menu';
  private saveReq?: SaveRequest;
  private onLoad: (f: SaveFile) => void = () => {};
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
  openSave(req: SaveRequest, onClose: () => void): void { this.mode = 'save'; this.saveReq = req; this.open(onClose); }
  openLoad(onLoad: (f: SaveFile) => void, onClose: () => void): void { this.mode = 'load'; this.onLoad = onLoad; this.open(onClose); }

  private open(onClose: () => void): void {
    this.onClose = onClose; this.sel = null; this.msg = ''; this.confirmDrop = false; this.confirmSlot = null;
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    if (this.root.hidden) return;
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
    return `<div class="kf-col" style="grid-column:1 / -1;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;align-content:start">
      <div class="kf-tag" style="grid-column:1 / -1">${tip}</div>${cards}<div class="kf-msg" style="grid-column:1 / -1">${esc(this.msg)}</div></div>`;
  }

  private render(): void {
    if (this.mode === 'save' || this.mode === 'load') {
      const title = this.mode === 'save' ? '地藏・存檔' : '讀取存檔';
      this.root.innerHTML = `<div class="kf-panel" role="dialog" aria-label="${title}"><div class="kf-head"><span class="kf-title">${title}</span><span class="kf-spacer"></span>
        <button class="kf-close" data-act="close" aria-label="關閉">✕</button></div><div class="kf-body">${this.slotView()}</div></div>`;
      return;
    }
    const s = gameState;
    const tabs = this.mode === 'menu'
      ? ([['status', '狀態'], ['equip', '裝備'], ['bag', '背包'], ['map', '收集']] as const).map(([k, t]) => `<button class="kf-tab" data-tab="${k}" aria-selected="${this.menuTab === k}">${t}</button>`).join('')
      : ([['buy', '購買'], ['sell', '賣出']] as const).map(([k, t]) => `<button class="kf-tab" data-stab="${k}" aria-selected="${this.shopTab === k}">${t}</button>`).join('');
    const title = this.mode === 'menu' ? '選單' : '鈴屋';
    const body = this.mode === 'menu'
      ? (this.menuTab === 'status' ? this.statusView() : this.menuTab === 'equip' ? this.equipView() : this.menuTab === 'map' ? this.mapView() : this.bagView())
      : (this.shopTab === 'buy' ? this.buyView() : this.sellView());
    this.root.innerHTML = `<div class="kf-panel" role="dialog" aria-label="${title}">
      <div class="kf-head"><span class="kf-title">${title}</span>${tabs}<span class="kf-spacer"></span>
        <span class="kf-mute">背包 ${slotsUsed(s)}/${s.capacity}</span>
        <span class="kf-money">● ${s.money} 文</span><button class="kf-close" data-act="close" aria-label="關閉">✕</button></div>
      <div class="kf-body">${body}</div></div>`;
  }

  private statusView(): string {
    const s = gameState, st = statsOf(s), cls = classes[s.classId];
    const next = s.level >= LEVEL_CAP ? 0 : expToNext(s.level);
    const pct = next ? Math.floor((s.exp / next) * 100) : 100;
    return `<div class="kf-col">
        <div class="kf-card"><h3>燈・${cls.name}　Lv.${s.level}</h3>
          <div class="kf-tag">經驗 ${next ? `${s.exp} / ${next}（還差 ${next - s.exp}）` : '已達目前等級上限'}</div>
          <div class="kf-bar"><i style="width:${pct}%"></i></div>
          <dl class="kf-grid">
            <dt>HP</dt><dd>${Math.ceil(s.hp)} / ${st.maxHp}</dd><dt>MP</dt><dd>${Math.floor(s.mp)} / ${st.maxMp}</dd>
            <dt>攻擊</dt><dd>${st.atk}</dd><dt>防禦</dt><dd>${st.def}</dd><dt>速度</dt><dd>${st.spd}</dd>
            <dt>爆擊率</dt><dd>${st.crit}%</dd><dt>MP 回復</dt><dd>${st.mpRegen} / 秒</dd>
          </dl></div></div>
      <div class="kf-col"><div class="kf-sec">裝備中</div>
        ${SLOTS.map((sl) => { const g = this.worn(sl); return `<div class="kf-row" data-goslot="${sl}"><span class="k">${SLOT_NAME[sl]}</span><span class="n" style="color:${g ? RARITIES[g.rarity].color : '#6b6780'}">${g ? esc(BASES[g.base].name) : '（空）'}</span></div>`; }).join('')}
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
      return `<div class="kf-row" data-slot="${sl}" aria-selected="${this.slot === sl}"><span class="k">${SLOT_NAME[sl]}</span><span class="n" style="color:${g ? RARITIES[g.rarity].color : '#6b6780'}">${g ? esc(BASES[g.base].name) : '（空）'}</span></div>`;
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
    return `<h3 style="color:${RARITIES[g.rarity].color}">${esc(BASES[g.base].name)}</h3><div class="kf-tag">${RARITIES[g.rarity].name}・${SLOT_NAME[BASES[g.base].slot]}${BASES[g.base].tier >= 2 ? '・上等' : ''}</div>`;
  }

  private bagList(selling: boolean): string {
    const s = gameState, worn = equippedUids(s);
    const items = Object.entries(s.items).filter(([, n]) => n > 0);
    const gear = s.gear.filter((g) => !worn.has(g.uid)).sort((a, b) => SLOTS.indexOf(BASES[a.base].slot) - SLOTS.indexOf(BASES[b.base].slot) || b.rarity - a.rarity);
    const rows: string[] = [];
    rows.push('<div class="kf-sec">道具</div>');
    rows.push(items.length ? items.map(([n, c]) => `<div class="kf-row" data-item="${esc(n)}" aria-selected="${this.sel?.kind === 'item' && this.sel.name === n}"><span class="n">${esc(n)}</span><span class="q">×${c}</span>${selling ? `<span class="kf-money">${this.itemSell(n)} 文</span>` : ''}</div>`).join('') : '<div class="kf-empty">沒有道具</div>');
    rows.push('<div class="kf-sec">裝備（沒穿在身上的）</div>');
    rows.push(gear.length ? gear.map((g) => `<div class="kf-row" data-gear="${g.uid}" aria-selected="${this.sel?.kind === 'gear' && this.sel.uid === g.uid}"><span class="k">${SLOT_NAME[BASES[g.base].slot]}</span><span class="n" style="color:${RARITIES[g.rarity].color}">${esc(BASES[g.base].name)}</span>${selling ? `<span class="kf-money">${sellPrice(equipValue(g))} 文</span>` : ''}</div>`).join('') : '<div class="kf-empty">沒有多的裝備</div>');
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
      const usable = !!ITEMS[sel.name] && sel.name !== '擴充布袋';
      return `<div class="kf-card"><h3>${esc(sel.name)}　×${n}</h3><div>${ITEM_DESC[sel.name] ?? ''}</div><div class="kf-btns">
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
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-saveslot],[data-loadslot],[data-act],[data-tab],[data-stab],[data-slot],[data-goslot],[data-equip],[data-item],[data-gear],[data-buyitem],[data-buygear]');
    if (!el) { if (e.target === this.root) this.close(); return; }
    const d = el.dataset, s = gameState;
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
