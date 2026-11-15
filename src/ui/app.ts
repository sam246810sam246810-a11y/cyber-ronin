import { Battle } from '../game/battle';
import { Run, Member } from '../game/run';
import { Input } from '../core/input';
import { sfx, unlockAudio, setMuted, setVibrate, vibrate, playMusic, setMusic } from '../core/audio';
import { iconHtml, hasImage } from '../core/assets';
import { getEvents, track } from '../core/track';
import { CHAPTERS, MAP_ROWS, MapNode, NODE_INFO } from '../data/chapters';
import { EQUIP_TPLS, Item, RARITIES, SLOTS, SLOT_NAME, TPL_MAP, itemStats, statLines, upgradeCost, MERGE_COUNT } from '../data/equipment';
import { Card, cardInfo } from '../data/skills';
import { ALL_PARTNERS, EGG, MAX_FOLLOWERS, MAX_PLV, MAX_STAR, PARTNERS, PartnerId, RECRUITABLE, plvGold, plvMul, shardCost } from '../data/partners';
import { BREAKTHROUGH_OFFER, CHESTS, DAILY_AD_GEMS, GEM_PACKS, NTD_PER_GEM, REVIVE_GEMS, FIRST_PURCHASE_GIFT } from '../data/shop';
import { CARNIVAL_CLAIM_DAYS, CARNIVAL_DAYS, CARNIVAL_PACK, MILESTONES, QUESTS, QUEST_TOTAL_POINTS } from '../data/quests';
import { BUILDINGS, BuildingId, buildCost, buildSeconds, rushGems, AD_RUSH_SEC } from '../data/village';
import { ASSETS } from '../data/assets';
import * as S from '../meta/state';
import { fmtNum } from '../game/util';

type Screen = 'home' | 'equip' | 'shop' | 'village' | 'carnival' | 'map' | 'battle';
type Handler = (arg: string, el: HTMLElement) => void;

const DAY = 86400000;
const params = new URLSearchParams(location.search);

export class App {
  screen: Screen = 'home';
  battle: Battle | null = null;
  run: Run | null = null;
  input: Input;
  root: HTMLElement;
  carnivalDay = 1;
  cards: Card[] = [];
  cardCtx: 'level' | 'chest' | 'rescue' = 'level';
  bot = params.has('bot');
  payCb: (() => void) | null = null;
  equipTab: 'gear' | 'partners' = 'gear';

  constructor(private canvas: HTMLCanvasElement) {
    this.root = document.getElementById('ui')!;
    this.input = new Input(canvas);
    this.root.innerHTML = `<div id="screen"></div><div id="tabs"></div><div id="modals"></div><div id="toasts"></div>`;
    this.root.addEventListener('click', (e) => {
      unlockAudio();
      this.syncMusic();
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!el || el.classList.contains('disabled')) return;
      const fn = this.actions[el.dataset.a!];
      if (fn) { e.stopPropagation(); fn(el.dataset.arg ?? '', el); }
    });
    canvas.addEventListener('pointerdown', () => { unlockAudio(); this.syncMusic(); });
    window.addEventListener('resize', () => this.battle?.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.battle?.state === 'play') this.showPause(); });
    setInterval(() => this.tick(), 1000);
    setMuted(S.save.settings.muted);
    setVibrate(S.save.settings.vibrate);
    setMusic(S.save.settings.music);
    this.carnivalDay = Math.min(S.currentDay(), CARNIVAL_DAYS);
    S.tickVillage();
    this.go('home');
    if (this.bot) setTimeout(() => this.startRun(), 300);
  }

  // ================= 共用 =================
  $(sel: string) { return this.root.querySelector<HTMLElement>(sel)!; }

  syncMusic() { playMusic(this.screen === 'battle' ? 'battle' : 'menu'); }

  go(s: Screen) {
    this.screen = s;
    this.syncMusic();
    document.body.classList.toggle('in-battle', s === 'battle');
    this.renderScreen();
  }

  renderScreen() {
    const s = this.screen;
    const html = s === 'home' ? this.homeHtml() : s === 'equip' ? this.equipHtml() : s === 'shop' ? this.shopHtml()
      : s === 'village' ? this.villageHtml() : s === 'carnival' ? this.carnivalHtml() : s === 'map' ? this.mapHtml() : this.battleHtml();
    const bare = s === 'battle' || s === 'map';
    this.$('#screen').innerHTML = s === 'battle' ? html : (s === 'map' ? '' : this.topbarHtml()) + `<div class="page page-${s}">${html}</div>`;
    this.$('#tabs').innerHTML = bare ? '' : this.tabsHtml();
    if (s === 'map' && this.run && !this.bot) S.saveRun(this.run.snapshot());
    if (s === 'map') requestAnimationFrame(() => this.$('.node.can')?.scrollIntoView({ block: 'center' }));
    this.tick();
  }

  refresh() { if (this.screen !== 'battle') this.renderScreen(); }

  topbarHtml() {
    return `<div class="topbar">
      <div class="res">${iconHtml('gold', '🪙')}<b>${fmtNum(S.save.gold)}</b></div>
      <div class="res">${iconHtml('gem', '💎')}<b>${fmtNum(S.save.gems)}</b></div>
      <div class="power">戰力 <b>${fmtNum(S.power())}</b></div>
      <button class="icon-btn" data-a="settings">⚙️</button>
    </div>`;
  }

  tabsHtml() {
    const dot = (b: boolean) => (b ? '<i class="dot"></i>' : '');
    const t = (id: Screen, icon: string, name: string, d = false) =>
      `<button class="tab ${this.screen === id ? 'on' : ''}" data-a="tab" data-arg="${id}"><span>${icon}</span>${name}${dot(d)}</button>`;
    const v = S.save.village;
    return t('shop', '🛒', '商店', !S.save.daily.freeChest || S.save.daily.adGems < DAILY_AD_GEMS.max)
      + t('equip', '🎒', '隊伍', this.mergeableCount() > 0 || S.partnerUpgradable())
      + t('home', '⚔️', '冒險')
      + t('village', '🏘️', '村莊', !v.building && BUILDINGS.some((b) => S.bLevel(b.id) < b.maxLv && S.save.gold >= buildCost(b, S.bLevel(b.id))))
      + t('carnival', '🎉', '嘉年華', this.carnivalClaimable() && !S.carnivalEnded());
  }

  toast(msg: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.$('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  modal(html: string, cls = '', onClose?: () => void): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = `modal-wrap ${cls}`;
    wrap.innerHTML = `<div class="modal">${html}</div>`;
    (wrap as HTMLElement & { _close?: () => void })._close = onClose;
    this.$('#modals').appendChild(wrap);
    this.tick();
    return wrap;
  }

  closeTop() {
    const all = this.$('#modals').children;
    const top = all[all.length - 1] as (HTMLElement & { _close?: () => void }) | undefined;
    if (!top) return;
    top.remove();
    top._close?.();
  }

  closeAll() { this.$('#modals').innerHTML = ''; }

  itemCard(it: Item, extra = '') {
    const t = TPL_MAP[it.tpl];
    const r = RARITIES[it.rarity];
    const eq = S.isEquipped(it.uid);
    return `<div class="item r${it.rarity}" style="--rc:${r.color}" data-a="item" data-arg="${it.uid}" ${extra}>
      ${iconHtml(`equip_${it.tpl}`, t.icon)}
      <span class="lv">Lv.${it.level}</span>
      ${eq ? '<span class="eq">E</span>' : ''}
    </div>`;
  }

  partnerIcon(pid: PartnerId, cls = '') {
    return iconHtml(pid === 'shiba' ? 'hero' : `partner_${pid}`, PARTNERS[pid].icon, cls);
  }

  teamHtml(run: Run, pickable = false) {
    return `<div class="team">${run.team.map((m) => {
      const p = PARTNERS[m.pid];
      const pct = m.down ? 0 : (m.hp / m.maxHp) * 100;
      const can = pickable && m.star < MAX_STAR;
      return `<div class="mem ${m.down ? 'down' : ''} ${pickable ? (can ? 'pick' : 'disabled') : ''}" ${pickable ? `data-a="campStar" data-arg="${m.uid}"` : ''}>
        <div class="mem-ico">${this.partnerIcon(m.pid)}</div>
        <div class="mem-star">${'★'.repeat(m.star)}</div>
        <div class="mem-hp"><i style="width:${pct}%"></i></div>
        <div class="mem-name">${m.down ? '倒下' : p.name.slice(-2)}</div>
      </div>`;
    }).join('')}${Array.from({ length: MAX_FOLLOWERS + 1 - run.team.length }, () => '<div class="mem empty">＋</div>').join('')}</div>`;
  }

  tick() {
    if (S.tickVillage()) { this.toast('🏘️ 建造完成！'); if (this.screen === 'village' || this.screen === 'home') this.refresh(); }
    this.root.querySelectorAll<HTMLElement>('[data-cd]').forEach((el) => {
      const ms = Number(el.dataset.cd) - S.now();
      el.textContent = ms > 0 ? fmtTime(ms) : '已結束';
    });
    const bar = this.root.querySelector<HTMLElement>('.build-bar i');
    const b = S.save.village.building;
    if (bar && b) bar.style.width = `${(1 - S.buildRemainSec() / b.total) * 100}%`;
    const rush = this.root.querySelector<HTMLElement>('[data-a=rush]');
    if (rush && b) rush.textContent = `💎 ${rushGems(S.buildRemainSec())} 立即完成`;
  }

  mergeableCount() {
    const seen = new Map<string, number>();
    for (const it of S.save.items) if (it.rarity < RARITIES.length - 1) { const k = `${it.tpl}|${it.rarity}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
    let n = 0;
    for (const v of seen.values()) n += Math.floor(v / MERGE_COUNT);
    return n;
  }

  carnivalClaimable() {
    return QUESTS.some((q) => S.questUnlocked(q) && S.questDone(q) && !S.questClaimed(q))
      || MILESTONES.some((m, i) => S.carnivalPoints() >= m.points && !S.save.carnival.claimedMilestones.includes(i));
  }

  // ================= 大廳 =================
  homeHtml() {
    const ch = CHAPTERS[S.save.selectedChapter - 1];
    const locked = ch.id > S.save.unlockedChapter;
    const pw = S.power();
    const best = S.save.best[ch.id] ?? 0;
    const offer = S.offerActive() ? `<button class="float-badge offer" data-a="offer">🎁<span>突破禮包</span><em data-cd="${S.save.offer.expiresAt}"></em></button>` : '';
    const carnival = S.carnivalEnded() ? '' : `<button class="float-badge carnival" data-a="tab" data-arg="carnival">🎉<span>7日嘉年華</span>${this.carnivalClaimable() ? '<i class="dot"></i>' : ''}</button>`;
    const unlocked = S.unlockedPartners();
    const roster = ['shiba' as PartnerId, ...RECRUITABLE].map((p) => {
      const ok = p === 'shiba' || unlocked.includes(p);
      return `<span class="ros ${ok ? '' : 'locked'}" title="${PARTNERS[p].name}">${this.partnerIcon(p)}${ok ? '' : '<i>🔒</i>'}</span>`;
    }).join('');
    return `
      <div class="badges">${carnival}${offer}</div>
      <div class="logo">${hasImage('logo') ? iconHtml('logo', '') : '<h1>萌爪突擊</h1><p>PAW STRIKE</p>'}</div>
      <div class="hero-stage"><div class="caravan-pic">${['shiba', 'cat', 'rabbit', 'bear'].map((p, i) => `<span style="animation-delay:${i * 0.15}s">${this.partnerIcon(p as PartnerId)}</span>`).join('')}</div></div>
      <div class="roster"><span class="muted small">可招募夥伴</span><div>${roster}</div></div>
      <div class="chapter-card ${locked ? 'locked' : ''}">
        <button class="arrow" data-a="chapter" data-arg="-1" ${ch.id === 1 ? 'disabled' : ''}>◀</button>
        <div class="ch-body">
          <div class="ch-icon">${ch.icon}</div>
          <div class="ch-name">${ch.name}・${ch.subtitle}</div>
          <div class="ch-best">${locked ? '🔒 通關上一章解鎖' : S.save.cleared[ch.id] ? '✅ 已通關' : `最遠到第 ${Math.min(best, MAP_ROWS)}/${MAP_ROWS} 層`}</div>
          <div class="ch-power ${pw < ch.recommendedPower ? 'low' : ''}">推薦戰力 ${fmtNum(ch.recommendedPower)}</div>
        </div>
        <button class="arrow" data-a="chapter" data-arg="1" ${ch.id === CHAPTERS.length ? 'disabled' : ''}>▶</button>
      </div>
      ${S.save.activeRun ? `<button class="btn big gold start" data-a="continue">繼續冒險</button><button class="link" data-a="abandonSaved">放棄進行中的冒險</button>`
        : `<button class="btn big green start ${locked ? 'disabled' : ''}" data-a="start">出發冒險</button>`}
      <p class="hint">單指轉向・隊伍會一直前進並自動攻擊</p>`;
  }

  // ================= 地圖 =================
  mapHtml() {
    const run = this.run!;
    const avail = new Set(run.available().map((n) => n.id));
    const ROW_H = 92;
    const H = MAP_ROWS * ROW_H + 40;
    const y = (row: number) => H - 50 - row * ROW_H;
    const all = run.map.flat();
    const byId = new Map(all.map((n) => [n.id, n]));
    const lines = all.flatMap((a) => a.next.map((id) => {
      const b = byId.get(id)!;
      const walked = run.visited.includes(a.id) && run.visited.includes(b.id);
      return `<line x1="${a.x * 100}%" y1="${y(a.row)}" x2="${b.x * 100}%" y2="${y(b.row)}" class="${walked ? 'walked' : ''}"/>`;
    })).join('');
    const nodes = all.map((n) => {
      const info = NODE_INFO[n.kind];
      const cls = run.visited.includes(n.id) ? 'done' : avail.has(n.id) ? 'can' : '';
      const cur = run.pos?.id === n.id ? 'cur' : '';
      return `<button class="node k-${n.kind} ${cls} ${cur}" style="left:${n.x * 100}%;top:${y(n.row)}px" ${avail.has(n.id) ? `data-a="node" data-arg="${n.id}"` : ''}>
        <span>${info.icon}</span><em>${info.name}</em></button>`;
    }).join('');
    return `
      ${!S.save.flags.tutMap ? '<div class="tut-bubble">👇 點發光的節點出發！每層選一條路，第 9 層是 Boss</div>' : ''}
      <div class="map-top">
        <div class="map-title"><b>${run.ch.name}・${run.ch.subtitle}</b><span>Lv.${run.level}・🪙 ${fmtNum(run.gold)}</span></div>
        ${this.teamHtml(run)}
        <div class="row tight"><button class="btn small" data-a="mapHelp">圖例</button><button class="btn small red" data-a="abandon">放棄冒險</button></div>
      </div>
      <div class="map" style="height:${H}px"><svg class="map-lines" width="100%" height="${H}">${lines}</svg>${nodes}</div>`;
  }

  // ================= 裝備 =================
  equipHtml() {
    const seg = `<div class="seg"><button class="${this.equipTab === 'gear' ? 'on' : ''}" data-a="equipTab" data-arg="gear">🎒 隊長裝備${this.mergeableCount() ? '<i class="dot"></i>' : ''}</button><button class="${this.equipTab === 'partners' ? 'on' : ''}" data-a="equipTab" data-arg="partners">🐾 夥伴${S.partnerUpgradable() ? '<i class="dot"></i>' : ''}</button></div>`;
    return seg + (this.equipTab === 'gear' ? this.gearHtml() : this.partnersHtml());
  }

  partnersHtml() {
    const hall = S.bLevel('hall');
    const cards = ALL_PARTNERS.map((p) => {
      const def = PARTNERS[p];
      const d = S.save.partners[p];
      const locked = p !== 'shiba' && def.unlockHall > hall;
      const max = d.lv >= MAX_PLV;
      const need = shardCost(d.lv);
      const can = !locked && S.canUpgradePartner(p);
      return `<button class="pcard ${locked ? 'locked' : ''} ${can ? 'can' : ''}" data-a="partner" data-arg="${p}">
        <span class="p-lv">Lv.${d.lv}</span>
        <div class="p-ico">${this.partnerIcon(p)}</div>
        <b>${def.name}</b>
        <span class="small muted">${def.role}</span>
        <div class="p-bar"><i style="width:${max ? 100 : Math.min(100, (d.shards / need) * 100)}%"></i><span>${max ? 'MAX' : `${d.shards}/${need}`}</span></div>
        ${locked ? `<span class="p-lock">🔒 招募所 Lv.${def.unlockHall}</span>` : ''}
      </button>`;
    }).join('');
    return `<p class="hint small">夥伴的永久等級會讓牠在每次冒險中更強；碎片來自冒險、寶箱與夥伴蛋</p><div class="pgrid">${cards}</div>`;
  }

  partnerModal(p: PartnerId) {
    const def = PARTNERS[p];
    const d = S.save.partners[p];
    const max = d.lv >= MAX_PLV;
    const locked = p !== 'shiba' && def.unlockHall > S.bLevel('hall');
    const need = shardCost(d.lv), gold = plvGold(d.lv);
    const pct = (x: number) => Math.round((plvMul(x) - 1) * 100);
    this.modal(`
      <button class="x" data-a="close">✕</button>
      <div class="p-detail"><div class="p-ico big">${this.partnerIcon(p)}</div>
        <div><h3>${def.name}</h3><div class="muted">${def.role}・永久 Lv.${d.lv}/${MAX_PLV}</div></div></div>
      <p>${def.desc}</p>
      <ul class="statlist"><li>冒險中傷害 +${pct(d.lv)}%${max ? '' : ` → <b>+${pct(d.lv + 1)}%</b>`}</li><li>冒險中生命 +${pct(d.lv)}%${max ? '' : ` → <b>+${pct(d.lv + 1)}%</b>`}</li></ul>
      ${locked ? `<p class="muted">🔒 需要村莊招募所 Lv.${def.unlockHall} 才能在冒險中招募；碎片可以先存著。</p>` : ''}
      ${max ? '<button class="btn disabled">已達最高等級</button>' : `<button class="btn ${!locked && S.canUpgradePartner(p) ? 'green' : 'disabled'}" data-a="upPartner" data-arg="${p}">升級：碎片 ${d.shards}/${need}・🪙 ${fmtNum(gold)}</button>`}`, 'partner-modal');
  }

  eggReveal(got: PartnerId[]) {
    this.refresh();
    const m = this.modal(`<div class="chest-open">${iconHtml('egg', '🥚', 'shake')}</div>`, 'chest-wrap');
    sfx.click();
    setTimeout(() => {
      m.remove();
      sfx.buy(); vibrate(30);
      this.modal(`<h2 class="win">孵化成功！</h2>
        <div class="reveal">${got.map((p) => `<div class="reveal-item"><div class="item">${this.partnerIcon(p)}</div><span>${PARTNERS[p].name}<br>碎片 ×${EGG.shardsPerDraw}</span></div>`).join('')}</div>
        <button class="btn big green" data-a="close">太棒了！</button>`, 'reward', () => this.refresh());
    }, 800);
  }

  gearHtml() {
    const st = S.playerStats();
    const slots = SLOTS.map((slot) => {
      const it = S.equippedItem(slot);
      return `<div class="slot"><div class="slot-name">${SLOT_NAME[slot]}</div>${it ? this.itemCard(it) : '<div class="item empty">＋</div>'}</div>`;
    });
    const items = [...S.save.items].sort((a, b) => b.rarity - a.rarity || a.tpl.localeCompare(b.tpl) || b.level - a.level);
    const mc = this.mergeableCount();
    return `
      <div class="equip-top">
        <div class="slots">${slots[0]}${slots[1]}</div>
        <div class="hero-mini">${iconHtml('hero', '🐶')}</div>
        <div class="slots">${slots[2]}${slots[3]}</div>
      </div>
      <p class="hint small">隊長的裝備會強化整支隊伍</p>
      <div class="stats">
        <span>⚔️ 隊伍攻擊 <b>${Math.round(st.atk)}</b></span>
        <span>❤️ 隊伍生命 <b>${Math.round(st.maxHp)}</b></span>
        <span>⚡ 攻速 <b>${st.aspd.toFixed(2)}</b></span>
        <span>🍀 爆擊 <b>${Math.round(st.crit * 100)}%</b></span>
        <span>💥 爆傷 <b>${Math.round(st.critDmg * 100)}%</b></span>
        <span>🛡️ 減傷 <b>${Math.round(st.dmgReduce * 100)}%</b></span>
      </div>
      <div class="bag-head">
        <span>背包（${items.length}）</span>
        <button class="btn small ${mc ? 'gold' : 'disabled'}" data-a="mergeAll">一鍵合成${mc ? `（${mc}）` : ''}</button>
      </div>
      <div class="bag">${items.map((i) => this.itemCard(i)).join('')}</div>
      <p class="hint">3 件相同的同品質裝備可合成更高品質：普通 → 優秀 → 稀有 → 史詩 → 傳說 → 神話</p>`;
  }

  itemModal(uid: number) {
    const it = S.findItem(uid);
    if (!it) return;
    const t = TPL_MAP[it.tpl];
    const r = RARITIES[it.rarity];
    const stats = statLines(itemStats(it));
    const maxed = it.level >= r.maxLv;
    const cost = upgradeCost(it.level);
    const partners = S.mergePartners(uid);
    const same = S.save.items.filter((o) => o.tpl === it.tpl && o.rarity === it.rarity).length;
    const canMerge = partners.length >= MERGE_COUNT - 1;
    const eq = S.isEquipped(uid);
    const next = it.rarity < RARITIES.length - 1 ? RARITIES[it.rarity + 1] : null;
    this.modal(`
      <button class="x" data-a="close">✕</button>
      <div class="item-detail">
        <div class="item big r${it.rarity}" style="--rc:${r.color}">${iconHtml(`equip_${it.tpl}`, t.icon)}</div>
        <div>
          <div class="rname" style="color:${r.color}">${r.name}</div>
          <h3>${t.name}</h3>
          <div class="muted">${SLOT_NAME[t.slot]}・Lv.${it.level}/${r.maxLv}</div>
        </div>
      </div>
      <ul class="statlist">${stats.map((s) => `<li>${s}</li>`).join('')}</ul>
      <div class="merge-box">
        ${next ? `合成進度 <b>${Math.min(same, MERGE_COUNT)}/${MERGE_COUNT}</b> → <span style="color:${next.color}">${next.name}</span>（屬性 ×${(next.mult / r.mult).toFixed(2)}）` : '已達最高品質'}
      </div>
      <div class="row">
        <button class="btn ${eq ? 'disabled' : 'blue'}" data-a="equip" data-arg="${uid}">${eq ? '已裝備' : '裝備'}</button>
        <button class="btn ${maxed || S.save.gold < cost ? 'disabled' : 'green'}" data-a="upgrade" data-arg="${uid}">${maxed ? '已滿級' : `強化 🪙${fmtNum(cost)}`}</button>
        <button class="btn ${canMerge ? 'gold' : 'disabled'}" data-a="merge" data-arg="${uid}">合成</button>
      </div>`, 'item-modal');
  }

  // ================= 村莊 =================
  villageHtml() {
    const v = S.save.village;
    const b = v.building;
    const busy = b ? BUILDINGS.find((x) => x.id === b.id)! : null;
    const banner = busy && b ? `<div class="card building-now">
        <div class="bn-head"><span class="bn-ico">🔨</span><div><b>${busy.name} 升級到 Lv.${S.bLevel(busy.id) + 1}</b><div class="muted small">剩餘 <span data-cd="${b.finishAt}"></span></div></div></div>
        <div class="build-bar"><i style="width:${(1 - S.buildRemainSec() / b.total) * 100}%"></i></div>
        <div class="row">
          <button class="btn small green ${b.adUsed ? 'disabled' : ''}" data-a="adRush">📺 加速 ${AD_RUSH_SEC / 60} 分鐘</button>
          <button class="btn small gold" data-a="rush">💎 ${rushGems(S.buildRemainSec())} 立即完成</button>
        </div>
      </div>` : `<div class="card building-now idle"><span class="bn-ico">👷</span> 建築師有空，選一棟房子升級吧！</div>`;
    const cards = BUILDINGS.map((d) => {
      const lv = S.bLevel(d.id);
      const max = lv >= d.maxLv;
      const cost = buildCost(d, lv);
      const ok = !max && !b && S.save.gold >= cost;
      return `<div class="card bld ${b?.id === d.id ? 'busy' : ''}">
        <div class="bld-ico">${iconHtml(`bld_${d.id}`, d.icon)}<span class="bld-lv">Lv.${lv}</span></div>
        <div class="bld-body">
          <b>${d.name}</b>
          <div class="small">${lv ? d.effect(lv) : (d.id === 'hall' ? d.effect(0) : '尚未建造')}</div>
          ${max ? '<div class="small muted">已達最高等級</div>' : `<div class="small next">下一級：${d.effect(lv + 1)}</div>`}
        </div>
        ${max ? '' : `<button class="btn small ${ok ? 'green' : 'disabled'}" data-a="build" data-arg="${d.id}">🪙 ${fmtNum(cost)}<small>${fmtTime(buildSeconds(lv) * 1000)}</small></button>`}
      </div>`;
    }).join('');
    return `<div class="village-head"><h2>🏘️ 毛毛村</h2><p class="muted small">蓋房子永久強化隊伍・一次只能蓋一棟</p></div>${banner}<div class="blds">${cards}</div>`;
  }

  // ================= 商店 =================
  shopHtml() {
    const sv = S.save;
    const first = !sv.shop.anyPurchase ? `<div class="banner first">
        <div>🎀 <b>首儲禮</b>：首次購買任何商品，額外贈送<span style="color:${RARITIES[FIRST_PURCHASE_GIFT.rarity].color}">【${RARITIES[FIRST_PURCHASE_GIFT.rarity].name}】${TPL_MAP[FIRST_PURCHASE_GIFT.tpl].name}</span></div>
      </div>` : '';
    const goldChest = CHESTS[1];
    const pityLeft = goldChest.pity!.every - sv.shop.goldPity;
    const chests = CHESTS.map((c) => {
      const cost = c.cost.gold ? `🪙 ${fmtNum(c.cost.gold)}` : `💎 ${c.cost.gems}`;
      const ok = S.canAffordChest(c);
      return `<div class="card chest">
        <div class="chest-ico">${iconHtml(`chest_${c.id}`, c.icon)}</div>
        <div class="cname">${c.name}</div>
        ${c.pity ? `<div class="muted small">再 ${pityLeft} 次必得傳說</div>` : '<div class="muted small">普通～稀有</div>'}
        <button class="btn ${ok ? 'gold' : 'disabled'}" data-a="chest" data-arg="${c.id}">${cost}</button>
        <button class="link" data-a="odds" data-arg="${c.id}">機率說明</button>
      </div>`;
    }).join('');
    const packs = GEM_PACKS.map((p) => {
      const dbl = !sv.shop.firstBuy[p.id];
      const per = p.gems / p.ntd, base = 1 / NTD_PER_GEM;
      const extra = Math.round((per / base - 1) * 100);
      return `<button class="card pack" data-a="buyPack" data-arg="${p.id}">
        ${dbl ? '<span class="tag">首購雙倍</span>' : ''}
        <div class="pack-ico">${iconHtml('gem', '💎')}</div>
        <div class="gems">${p.gems}${dbl ? ` <s>+${p.gems}</s>` : ''}</div>
        ${extra > 0 ? `<div class="muted small">比最小包多 ${extra}%</div>` : '<div class="muted small">&nbsp;</div>'}
        <div class="price">NT$ ${p.ntd}</div>
      </button>`;
    }).join('');
    return `${first}
      <h2 class="sec">每日免費</h2>
      <div class="grid2">
        <div class="card chest">
          <div class="chest-ico">${iconHtml('chest_wood', '📦')}</div><div class="cname">每日木箱</div>
          <button class="btn ${sv.daily.freeChest ? 'disabled' : 'green'}" data-a="freeChest">${sv.daily.freeChest ? '明天再來' : '免費開啟'}</button>
        </div>
        <div class="card chest">
          <div class="chest-ico">${iconHtml('gem', '💎')}</div><div class="cname">看廣告領鑽石</div>
          <button class="btn ${sv.daily.adGems >= DAILY_AD_GEMS.max ? 'disabled' : 'green'}" data-a="adGems">📺 +${DAILY_AD_GEMS.perAd}（${sv.daily.adGems}/${DAILY_AD_GEMS.max}）</button>
        </div>
      </div>
      <h2 class="sec">夥伴蛋</h2>
      <div class="grid2">
        <div class="card chest">
          <div class="chest-ico">${iconHtml('egg', '🥚')}</div><div class="cname">夥伴蛋</div>
          <div class="muted small">${EGG.draws} 份夥伴碎片</div>
          <button class="btn ${sv.gems >= EGG.gems ? 'gold' : 'disabled'}" data-a="egg">💎 ${EGG.gems}</button>
          <button class="link" data-a="eggOdds">機率說明</button>
        </div>
        <div class="card chest">
          <div class="chest-ico"><span class="ico emo">🐣</span></div><div class="cname">每日免費蛋</div>
          <div class="muted small">看廣告孵一顆</div>
          <button class="btn ${sv.daily.adEgg ? 'disabled' : 'green'}" data-a="adEgg">${sv.daily.adEgg ? '明天再來' : '📺 免費孵化'}</button>
        </div>
      </div>
      <h2 class="sec">寶箱</h2>
      <div class="grid2">${chests}</div>
      <h2 class="sec">鑽石</h2>
      <div class="grid2">${packs}</div>
      <p class="hint">⚠️ 測試版：所有購買均為模擬，不會實際扣款。</p>`;
  }

  // ================= 嘉年華 =================
  carnivalHtml() {
    if (S.carnivalEnded()) return `<div class="card center"><h2>🎉 7日嘉年華已結束</h2><p class="muted">感謝參與！</p></div>`;
    const cur = S.currentDay();
    const pts = S.carnivalPoints();
    const maxPts = MILESTONES[MILESTONES.length - 1].points;
    const endAt = startOfDay(S.save.firstLaunch) + CARNIVAL_CLAIM_DAYS * DAY;
    const days = Array.from({ length: CARNIVAL_DAYS }, (_, i) => i + 1).map((d) => {
      const lock = d > cur;
      const hasClaim = QUESTS.some((q) => q.day === d && S.questUnlocked(q) && S.questDone(q) && !S.questClaimed(q));
      return `<button class="day ${d === this.carnivalDay ? 'on' : ''} ${lock ? 'lock' : ''}" data-a="cday" data-arg="${d}">第${d}天${lock ? '<small>🔒</small>' : ''}${hasClaim ? '<i class="dot"></i>' : ''}</button>`;
    }).join('');
    const ms = MILESTONES.map((m, i) => {
      const got = S.save.carnival.claimedMilestones.includes(i);
      const can = pts >= m.points && !got;
      const rc = m.item ? RARITIES[m.item.rarity].color : '';
      return `<button class="ms ${got ? 'got' : can ? 'can' : ''}" style="left:${(m.points / maxPts) * 100}%" data-a="milestone" data-arg="${i}">
        <span class="ms-ico" ${rc ? `style="border-color:${rc}"` : ''}>${m.item ? iconHtml(`equip_${m.item.tpl}`, m.icon) : m.icon}</span>
        <span class="ms-pt">${m.points}</span>
      </button>`;
    }).join('');
    const dayLocked = this.carnivalDay > cur;
    const unlockAt = startOfDay(S.save.firstLaunch) + (this.carnivalDay - 1) * DAY;
    const quests = QUESTS.filter((q) => q.day === this.carnivalDay).map((q) => {
      const v = Math.min(S.save.counters[q.key], q.target);
      const claimed = S.questClaimed(q), done = S.questDone(q);
      const btn = dayLocked ? `<button class="btn small disabled">未解鎖</button>`
        : claimed ? `<button class="btn small disabled">已領取</button>`
        : done ? `<button class="btn small gold" data-a="claimQuest" data-arg="${q.id}">領取</button>`
        : `<button class="btn small blue" data-a="goQuest" data-arg="${q.key}">前往</button>`;
      return `<div class="quest ${claimed ? 'claimed' : ''}">
        <div class="qinfo"><div>${q.text}</div>
          <div class="qbar"><i style="width:${(v / q.target) * 100}%"></i><span>${v}/${q.target}</span></div></div>
        <div class="qpts">+${q.points}</div>${btn}</div>`;
    }).join('');
    const packBought = S.save.carnival.packDays.includes(cur);
    return `
      <div class="carnival-head">
        <h2>🎉 新手 7 日嘉年華</h2>
        <div class="muted small">活動剩餘 <b data-cd="${endAt}"></b>・免費可得 ${QUEST_TOTAL_POINTS} 積分，最終大獎需 ${maxPts}</div>
      </div>
      <div class="ms-track"><div class="ms-bar"><i style="width:${Math.min(100, (pts / maxPts) * 100)}%"></i></div>${ms}</div>
      <div class="center small"><b>目前積分 ⭐ ${pts}</b></div>
      <div class="days">${days}</div>
      ${dayLocked ? `<div class="card center muted">第 ${this.carnivalDay} 天任務將在 <b data-cd="${unlockAt}"></b> 後開放</div>` : ''}
      <div class="quests">${quests}</div>
      <button class="card pack wide ${packBought ? 'disabled' : ''}" data-a="carnivalPack">
        <div><b>今日加速包</b><div class="muted small">+${CARNIVAL_PACK.points} 嘉年華積分 ＋ 💎${CARNIVAL_PACK.gems}（每日限購 1）</div></div>
        <div class="price">${packBought ? '已購買' : `NT$ ${CARNIVAL_PACK.ntd}`}</div>
      </button>`;
  }

  battleHtml() { return `<button class="pause-btn" data-a="pause">❚❚</button>`; }

  // ================= 冒險流程 =================
  /** 讀回中斷的冒險 */
  resumeRun(): boolean {
    const r = Run.restore(S.save.activeRun);
    if (!r) { S.clearRun(); this.refresh(); this.toast('存檔無法讀取，已清除'); return false; }
    this.closeAll();
    this.run = r;
    this.go('map');
    track('run_resume', { row: r.pos?.row ?? 0 });
    return true;
  }

  startRun() {
    const ch = S.save.selectedChapter;
    if (ch > S.save.unlockedChapter) return;
    this.closeAll();
    if (S.save.activeRun && !this.bot) { this.resumeRun(); return; }
    this.run = new Run(ch, S.playerStats(), S.runBonus());
    this.go('map');
    if (this.bot) this.botMap();
  }

  enterNode(id: number) {
    const run = this.run!;
    const node = run.map.flat().find((n) => n.id === id);
    if (!node || !run.available().includes(node)) return;
    run.enter(node);
    sfx.click();
    switch (node.kind) {
      case 'battle': case 'elite': case 'boss': this.startBattle(node); break;
      case 'rescue': this.showRescue(); break;
      case 'camp': this.showCamp(); break;
      case 'chest': this.showChest(); break;
      case 'shop': this.showShop(); break;
    }
  }

  startBattle(node: MapNode) {
    const run = this.run!;
    this.go('battle');
    this.battle?.stop();
    const b = new Battle(this.canvas, this.input, {
      levelUp: () => this.showLevelUp(),
      died: (canRevive) => this.showRevive(canRevive),
      cleared: () => this.onCleared(node),
    }, run, node.kind, node.row);
    b.bot = this.bot;
    b.timeScale = Math.max(1, Number(params.get('speed')) || 1);
    b.stopOnRelease = S.save.settings.stopOnRelease;
    b.tutMove = !S.save.flags.tutMove && !this.bot;
    b.onTutDone = () => { S.save.flags.tutMove = true; S.persist(); };
    this.battle = b;
    b.start();
  }

  onCleared(node: MapNode) {
    const run = this.run!;
    this.battle?.stop();
    this.battle = null;
    if (node.kind === 'boss') { run.gainShards(10); this.endRun(true); return; }
    run.gainShards(node.kind === 'elite' ? 4 : 1);
    let drop: Item | null = null;
    if (node.kind === 'elite') {
      const d = { tpl: S.randomTpl(), rarity: Math.random() < 0.3 + 0.15 * (run.ch.id - 1) ? 2 : 1 };
      run.items.push(d);
      drop = { uid: -1, tpl: d.tpl, rarity: d.rarity, level: 1 };
    }
    this.go('map');
    if (drop && !this.bot) this.rewardModal('菁英掉落！', [drop], ['冒險結束後放入背包']);
    if (this.bot) this.botMap();
  }

  endRun(win: boolean) {
    const run = this.run!;
    const inBattle = !!this.battle;
    this.battle?.stop();
    this.battle = null;
    this.closeAll();
    // 在戰鬥中倒下 → 該層不算通過
    const rows = run.pos ? run.pos.row + (inBattle ? 0 : 1) : 0;
    const reward = S.settleRun({
      win, chapter: run.ch.id, battles: run.battles, rows, gold: run.gold, kills: run.kills,
      eliteKills: run.eliteKills, bossKills: run.bossKills, evolutions: run.evolutions, recruits: run.recruits, drops: run.items, shards: run.shards,
    });
    track('run_end', { win, chapter: run.ch.id, rows, level: run.level, team: run.team.map((m) => `${m.pid}${m.star}`), combos: [...run.combos] });
    const showOffer = !win && S.maybeTriggerOffer({ reachedBoss: run.reachedBoss, bossHpPct: run.bossHpPct, rows });
    this.run = null;
    if (this.bot) {
      (window as unknown as { __lastRun: unknown }).__lastRun = { win, rows, level: run.level, bossHp: run.bossHpPct, kills: run.kills, team: run.team.map((m) => `${m.pid}${m.star}${m.down ? 'x' : ''}`), combos: [...run.combos], gold: reward.gold };
      this.go('home');
      return;
    }
    this.go('home');
    const items = reward.items.map((it) => this.itemCard(it, 'data-a=""')).join('');
    this.modal(`
      <h2 class="${win ? 'win' : 'lose'}">${win ? '🏆 章節通關！' : '冒險結束'}</h2>
      <div class="team-small">${run.team.map((m) => `<span class="${m.down ? 'down' : ''}">${this.partnerIcon(m.pid)}<sub>${'★'.repeat(m.star)}</sub></span>`).join('')}</div>
      <div class="result-stats">
        <div><b>${rows}/${MAP_ROWS}</b><span>層數</span></div>
        <div><b>${run.kills}</b><span>擊倒</span></div>
        <div><b>Lv.${run.level}</b><span>等級</span></div>
      </div>
      <div class="rewards">
        <div class="res">${iconHtml('gold', '🪙')}<b>+${fmtNum(reward.gold)}</b></div>
        ${reward.gems ? `<div class="res">${iconHtml('gem', '💎')}<b>+${reward.gems}</b></div>` : ''}
      </div>
      ${items ? `<div class="bag small">${items}</div>` : ''}
      ${Object.keys(reward.shards).length ? `<div class="shard-row">${Object.entries(reward.shards).map(([p, n]) => `<span>${this.partnerIcon(p as PartnerId)}<b>×${n}</b></span>`).join('')}</div><p class="muted small">夥伴碎片可在「隊伍 → 夥伴」升級</p>` : ''}
      <button class="btn big green" data-a="close">${showOffer ? '繼續' : '回到大廳'}</button>`, 'result', () => {
      this.refresh();
      if (showOffer) this.showOffer(true);
    });
  }

  // ---------- 卡片 ----------
  cardHtml(c: Card, i: number) {
    const info = cardInfo(c);
    const run = this.run!;
    let ico = `<span class="sk-emo">${info.icon}</span>`;
    let stars = '';
    if (c.kind === 'recruit' || c.kind === 'star') ico = this.partnerIcon(c.partner);
    if (c.kind === 'star') {
      const lv = run.member(c.partner)?.star ?? 0;
      stars = Array.from({ length: MAX_STAR }, (_, k) => `<i class="${k < lv ? 'on' : ''} ${k === lv ? 'new' : ''}"></i>`).join('');
    }
    if (c.kind === 'buff') {
      const lv = run.L(c.id);
      stars = lv ? `<span class="muted small">已有 ${lv} 級</span>` : '';
    }
    return `<button class="skill k-${c.kind} ${info.gold ? 'evo' : ''}" data-a="pickCard" data-arg="${i}">
      <span class="evo-tag">${info.tag}</span>
      <div class="sk-ico">${ico}</div>
      <div class="sk-name">${info.name}</div>
      <div class="sk-desc">${info.desc}</div>
      <div class="stars">${stars}</div>
    </button>`;
  }

  showCards(title: string, sub: string, ctx: 'level' | 'chest' | 'rescue', cards: Card[], allowReroll: boolean) {
    this.cardCtx = ctx;
    if (ctx === 'level' && !S.save.flags.tutCard && !this.bot) setTimeout(() => { S.save.flags.tutCard = true; S.persist(); }, 0);
    this.cards = cards;
    const run = this.run!;
    if (this.bot) { setTimeout(() => this.actions.pickCard('0', this.root), 30); return; }
    this.modal(`
      <h2 class="lvup">${title}</h2>
      <p class="muted">${sub}</p>
      <div class="skills">${cards.map((c, i) => this.cardHtml(c, i)).join('')}</div>
      ${ctx === 'level' && !S.save.flags.tutCard ? '<p class="tut-inline">💡 小提示：前期多招募夥伴，隊伍越長火力越強；把夥伴升到 3 星可解鎖金色「合體技」！</p>' : ''}
      ${allowReroll && run.rerolls > 0 ? `<button class="btn small blue" data-a="reroll">📺 看廣告重抽（剩 ${run.rerolls} 次）</button>` : ''}
      ${ctx !== 'level' ? `<button class="link" data-a="skipCards">略過</button>` : ''}
      ${this.teamHtml(run)}`, 'levelup');
  }

  showLevelUp() {
    const run = this.run!;
    this.showCards(`升級！ Lv.${run.level}`, '選擇一張卡片', 'level', run.rollCards(), true);
  }

  showRescue() {
    const run = this.run!;
    const pool = run.recruitable();
    let cards: Card[];
    if (run.followers < MAX_FOLLOWERS && pool.length) {
      const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 2);
      cards = shuffled.map((p) => ({ kind: 'recruit', partner: p }));
    } else {
      cards = run.team.filter((m) => m.star < MAX_STAR).sort(() => Math.random() - 0.5).slice(0, 2).map((m) => ({ kind: 'star', partner: m.pid }));
    }
    if (!cards.length) { const g = run.price(80); run.gold += g; this.toast(`隊伍已滿，獲得 🪙${g}`); this.refresh(); return; }
    this.showCards('🐾 救援！', '受困的動物想加入你的隊伍', 'rescue', cards, false);
  }

  showChest() {
    const run = this.run!;
    const g = run.price(60 + 15 * (run.pos?.row ?? 0));
    run.gold += g;
    const sp = run.gainShards(3);
    sfx.buy();
    this.showCards('🎁 寶箱', `獲得 🪙${g}、${PARTNERS[sp].name}碎片 ×3，再選一張卡片`, 'chest', run.rollCards(), false);
  }

  showCamp() {
    const run = this.run!;
    const anyDown = run.team.some((m) => m.down);
    if (this.bot) { run.healAll(0.5, true); this.refresh(); this.botMap(); return; }
    this.modal(`
      <h2>🏕️ 營火</h2>
      <p class="muted">選一件事做</p>
      <button class="btn big green" data-a="campHeal">🍲 休息：全隊回復 50%${anyDown ? '，救回倒下的夥伴' : ''}</button>
      <p class="muted small">或點選一位夥伴讓牠升星（傷害 +35%、生命 +25%）</p>
      <div class="team-pick">${this.teamHtml(run, true)}</div>`, 'camp');
  }

  showShop() {
    const run = this.run!;
    if (this.bot) { this.refresh(); this.botMap(); return; }
    const items = [
      { id: 'heal', icon: '🧺', name: '野餐便當', desc: '全隊回復 40%，救回倒下的夥伴', price: run.price(70) },
      { id: 'recruit', icon: '🐾', name: '招募券', desc: '隨機招募一隻新夥伴', price: run.price(130), ok: run.followers < MAX_FOLLOWERS && run.recruitable().length > 0 },
      { id: 'star', icon: '⭐', name: '升星糖果', desc: '隨機一位夥伴升星', price: run.price(110), ok: run.team.some((m) => m.star < MAX_STAR) },
      { id: 'card', icon: '🃏', name: '技能卡包', desc: '三選一技能', price: run.price(150) },
    ];
    this.modal(`
      <h2>🛒 行商</h2>
      <p class="muted">本局金幣：🪙 <b>${fmtNum(run.gold)}</b>（花掉的不會帶回家）</p>
      <div class="shop-list">${items.map((it) => `<div class="shop-item ${it.ok === false || run.gold < it.price ? 'disabled' : ''}">
        <span class="si-ico">${it.icon}</span><div class="si-body"><b>${it.name}</b><div class="small muted">${it.desc}</div></div>
        <button class="btn small gold" data-a="runShop" data-arg="${it.id}:${it.price}">🪙 ${it.price}</button></div>`).join('')}</div>
      <button class="btn green" data-a="leaveShop">離開</button>`, 'shop-modal');
  }

  showRevive(canRevive: boolean) {
    const b = this.battle!;
    if (this.bot) { if (canRevive && params.has('revive')) b.revive(); else this.endRun(false); return; }
    if (!canRevive) { this.endRun(false); return; }
    sfx.lose();
    const run = this.run!;
    this.modal(`
      <h2>隊長倒下了…</h2>
      <p class="muted">第 ${b.row + 1}/${MAP_ROWS} 層${b.boss && b.boss.alive ? `・Boss 剩 ${Math.round((b.boss.hp / b.boss.maxHp) * 100)}%` : ''}</p>
      <div class="revive-ring"><span>🐶</span></div>
      <p class="small">復活後隊長滿血，倒下的夥伴也會回來（50% 生命）</p>
      <button class="btn big green" data-a="reviveAd">📺 看廣告復活</button>
      <button class="btn ${S.save.gems >= REVIVE_GEMS ? 'blue' : 'disabled'}" data-a="reviveGem">💎 ${REVIVE_GEMS} 復活</button>
      <button class="link" data-a="giveUp">放棄（本局金幣 🪙${fmtNum(run.gold)} 仍可帶回）</button>`, 'revive');
  }

  showPause() {
    if (!this.battle || this.battle.state !== 'play') return;
    this.battle.pause();
    const run = this.run!;
    const combos = [...run.combos].map((c) => cardInfo({ kind: 'combo', id: c }).name).join('、');
    this.modal(`
      <h2>暫停</h2>
      ${this.teamHtml(run)}
      ${combos ? `<p class="small">合體技：${combos}</p>` : ''}
      <button class="btn big green" data-a="resume">繼續</button>
      <button class="btn" data-a="toggleMute">${S.save.settings.muted ? '🔇 音效：關' : '🔊 音效：開'}</button>
      <button class="link" data-a="quitRun">放棄本次冒險</button>`, 'pause', () => this.battle?.resume());
  }

  // ---------- 機器人自動走地圖 ----------
  botMap() {
    setTimeout(() => {
      const run = this.run;
      if (!run || this.screen !== 'map' || this.$('#modals').children.length) return;
      const pref = ['camp', 'rescue', 'battle', 'chest', 'shop', 'elite', 'boss'];
      const lowHp = run.leader.hp / run.leader.maxHp < 0.5;
      const opts = run.available().sort((a, b) => {
        const pa = pref.indexOf(a.kind) - (lowHp && a.kind === 'camp' ? 10 : 0);
        const pb = pref.indexOf(b.kind) - (lowHp && b.kind === 'camp' ? 10 : 0);
        return pa - pb;
      });
      if (opts[0]) this.enterNode(opts[0].id);
    }, 60);
  }

  // ================= 商業化彈窗 =================
  showOffer(fromFail = false) {
    if (!S.offerActive()) return;
    const o = BREAKTHROUGH_OFFER;
    const it = { tpl: o.item.tpl, rarity: o.item.rarity };
    const rc = RARITIES[it.rarity];
    const gemValue = Math.round(o.gems * NTD_PER_GEM);
    this.modal(`
      <button class="x" data-a="close">✕</button>
      <div class="offer-head">
        ${fromFail ? '<div class="offer-sub">差一點就過關了！</div>' : ''}
        <h2>🎁 ${o.title}</h2>
        <div class="offer-timer">⏰ 限時 <b data-cd="${S.save.offer.expiresAt}"></b>・限購 1 次</div>
      </div>
      <div class="offer-items">
        <div class="oi"><div class="item r${it.rarity}" style="--rc:${rc.color}">${iconHtml(`equip_${it.tpl}`, TPL_MAP[it.tpl].icon)}</div><span style="color:${rc.color}">${rc.name}${TPL_MAP[it.tpl].name}</span></div>
        <div class="oi"><div class="item">${iconHtml('gem', '💎')}</div><span>💎 ×${o.gems}</span></div>
        <div class="oi"><div class="item">${iconHtml('gold', '🪙')}</div><span>🪙 ×${fmtNum(o.gold)}</span></div>
      </div>
      <div class="value-note">
        光是 ${o.gems} 鑽石在商店約需 <b>NT$ ${gemValue}</b><br>
        <span class="muted small">5000 金幣可以把訓練場從 0 蓋到 Lv.3 以上</span>
      </div>
      <button class="btn big gold" data-a="buyOffer">NT$ ${o.ntd}</button>
      <p class="hint small">模擬購買，不會實際扣款</p>`, 'offer');
  }

  confirmPay(ntd: number, title: string, onOk: () => void) {
    this.modal(`
      <h3>確認購買</h3>
      <p>${title}</p>
      <div class="price big">NT$ ${ntd}</div>
      <p class="muted small">【測試版】這是模擬購買，不會收取任何費用。</p>
      <div class="row">
        <button class="btn" data-a="close">取消</button>
        <button class="btn gold" data-a="payOk">確認付款</button>
      </div>`, 'pay');
    this.payCb = onOk;
  }

  fakeAd(onDone: () => void) {
    let n = 3;
    const m = this.modal(`<div class="ad"><div class="muted">廣告播放中（模擬）</div><div class="ad-count">${n}</div></div>`, 'ad-wrap');
    const iv = setInterval(() => {
      n--;
      const el = m.querySelector('.ad-count');
      if (el) el.textContent = String(n);
      if (n <= 0) { clearInterval(iv); m.remove(); onDone(); }
    }, 1000);
  }

  rewardModal(title: string, items: Item[], extras: string[] = []) {
    sfx.buy(); vibrate(30);
    this.modal(`
      <h2 class="win">${title}</h2>
      <div class="reveal">${items.map((it) => `<div class="reveal-item">${this.itemCard(it, 'data-a=""')}<span style="color:${RARITIES[it.rarity].color}">${RARITIES[it.rarity].name}・${TPL_MAP[it.tpl].name}</span></div>`).join('')}</div>
      ${extras.map((e) => `<div class="extra">${e}</div>`).join('')}
      <button class="btn big green" data-a="close">太棒了！</button>`, 'reward', () => this.refresh());
  }

  showSettings() {
    const loaded = ASSETS.filter((a) => hasImage(a.key)).length;
    const ev = getEvents();
    this.modal(`
      <button class="x" data-a="close">✕</button>
      <h2>設定</h2>
      <button class="btn" data-a="toggleMute">${S.save.settings.muted ? '🔇 音效：關' : '🔊 音效：開'}</button>
      <button class="btn" data-a="toggleVibe">${S.save.settings.vibrate ? '📳 震動：開' : '📴 震動：關'}</button>
      <button class="btn" data-a="toggleMusic">${S.save.settings.music ? '🎵 音樂：開' : '🎵 音樂：關'}</button>
      <button class="btn" data-a="toggleStop">${S.save.settings.stopOnRelease ? '✋ 放開手指：隊伍停下' : '➡️ 放開手指：隊伍繼續前進'}</button>
      <h3 class="sec">測試工具</h3>
      <p class="muted small">目前嘉年華第 ${S.currentDay()} 天・美術素材 ${loaded}/${ASSETS.length} 已替換・埋點 ${ev.length} 筆</p>
      <button class="btn blue" data-a="nextDay">⏭ 跳到下一天</button>
      <button class="btn blue" data-a="cheat">💰 測試資源（金幣+5萬、鑽石+3000）</button>
      <button class="btn blue" data-a="showEvents">📊 查看最近埋點</button>
      <button class="btn red" data-a="reset">🗑 重置存檔</button>`, 'settings');
  }

  chestReveal(chestId: string, it: Item) {
    const c = CHESTS.find((x) => x.id === chestId)!;
    const m = this.modal(`<div class="chest-open">${iconHtml(`chest_${c.id}`, c.icon, 'shake')}</div>`, 'chest-wrap');
    sfx.click();
    setTimeout(() => { m.remove(); this.rewardModal(it.rarity >= 3 ? '大獎！' : '開箱獲得', [it]); }, 750);
  }

  // ================= 動作 =================
  actions: Record<string, Handler> = {
    tab: (arg) => { sfx.click(); this.closeAll(); if (arg === 'carnival') this.carnivalDay = Math.min(S.currentDay(), CARNIVAL_DAYS); this.go(arg as Screen); },
    close: () => { sfx.click(); this.closeTop(); },
    settings: () => { sfx.click(); this.showSettings(); },
    chapter: (arg) => {
      const n = S.save.selectedChapter + Number(arg);
      if (n < 1 || n > CHAPTERS.length) return;
      sfx.click(); S.save.selectedChapter = n; S.persist(); this.refresh();
    },
    start: () => { sfx.click(); this.startRun(); },
    node: (arg) => { if (!S.save.flags.tutMap) { S.save.flags.tutMap = true; S.persist(); } this.enterNode(Number(arg)); },
    mapHelp: () => {
      this.modal(`<button class="x" data-a="close">✕</button><h3>地圖圖例</h3>
        <div class="legend">${Object.values(NODE_INFO).map((n) => `<div><span>${n.icon}</span><b>${n.name}</b><em>${n.desc}</em></div>`).join('')}</div>`, 'legend-modal');
    },
    abandon: () => {
      this.modal(`<h3>放棄冒險？</h3><p>會直接結算，帶回目前的金幣與掉落。</p>
        <div class="row"><button class="btn" data-a="close">取消</button><button class="btn red" data-a="abandonOk">放棄</button></div>`, 'pay');
    },
    abandonOk: () => { this.closeAll(); this.endRun(false); },
    pause: () => this.showPause(),
    resume: () => { sfx.click(); this.closeTop(); },
    quitRun: () => { this.closeAll(); this.endRun(false); },
    pickCard: (arg) => {
      const run = this.run!;
      const card = this.cards[Number(arg)];
      if (!card) return;
      this.closeAll();
      const combo = run.apply(card);
      if (this.cardCtx === 'level') this.battle?.afterPick(combo, cardInfo(card).name);
      else {
        if (combo) { sfx.evo(); this.toast(`✨ ${cardInfo(card).name}`); } else sfx.pick();
        this.refresh();
        if (this.bot) this.botMap();
      }
    },
    skipCards: () => { this.closeAll(); this.refresh(); },
    reroll: () => {
      this.fakeAd(() => {
        const run = this.run!;
        run.rerolls--;
        track('card_reroll', {});
        this.closeAll();
        this.showCards(`升級！ Lv.${run.level}`, '選擇一張卡片', this.cardCtx, run.rollCards(), true);
      });
    },
    campHeal: () => { const run = this.run!; run.healAll(0.5, true); sfx.levelup(); this.closeAll(); this.refresh(); this.toast('全隊休息完畢'); },
    campStar: (arg) => {
      const run = this.run!;
      const m = run.team.find((x) => x.uid === Number(arg)) as Member | undefined;
      if (!m || m.star >= MAX_STAR) return;
      run.apply({ kind: 'star', partner: m.pid });
      sfx.levelup(); this.closeAll(); this.refresh();
      this.toast(`${PARTNERS[m.pid].name} 升到 ${m.star} 星！`);
    },
    runShop: (arg, el) => {
      const run = this.run!;
      const [id, p] = arg.split(':');
      const price = Number(p);
      if (run.gold < price) return;
      run.gold -= price;
      sfx.buy();
      track('run_shop', { id, price });
      if (id === 'heal') run.healAll(0.4, true);
      if (id === 'recruit') { const pool = run.recruitable(); run.addMember(pool[Math.floor(Math.random() * pool.length)]); }
      if (id === 'star') { const c = run.team.filter((m) => m.star < MAX_STAR); const m = c[Math.floor(Math.random() * c.length)]; run.apply({ kind: 'star', partner: m.pid }); }
      el.closest('.shop-item')?.classList.add('disabled');
      if (id === 'card') { this.closeAll(); this.showCards('🃏 技能卡包', '選擇一張卡片', 'chest', run.rollCards(), false); return; }
      this.closeAll(); this.showShop();
    },
    leaveShop: () => { this.closeAll(); this.refresh(); },
    reviveAd: () => { this.fakeAd(() => { this.closeAll(); track('ad_reward', { kind: 'revive' }); this.battle?.revive(); }); },
    reviveGem: () => {
      if (S.save.gems < REVIVE_GEMS) return;
      S.save.gems -= REVIVE_GEMS; S.persist();
      this.closeAll(); this.battle?.revive();
    },
    giveUp: () => { this.closeAll(); this.endRun(false); },
    item: (arg) => { if (!arg || Number(arg) < 0) return; sfx.click(); this.itemModal(Number(arg)); },
    equip: (arg) => { S.equip(Number(arg)); sfx.pick(); this.closeTop(); this.refresh(); },
    upgrade: (arg) => {
      if (S.upgrade(Number(arg))) { sfx.pick(); vibrate(15); this.closeTop(); this.refresh(); this.itemModal(Number(arg)); }
    },
    merge: (arg) => {
      const it = S.merge(Number(arg));
      if (it) { this.closeTop(); this.refresh(); this.rewardModal('合成成功！', [it]); }
    },
    mergeAll: () => {
      const before = new Set(S.save.items.map((i) => `${i.uid}:${i.rarity}`));
      const n = S.mergeAll();
      if (!n) return;
      const upgraded = S.save.items.filter((i) => !before.has(`${i.uid}:${i.rarity}`));
      this.refresh();
      this.rewardModal(`合成 ${n} 次！`, upgraded);
    },
    build: (arg) => {
      const err = S.startBuild(arg as BuildingId);
      if (err) { this.toast(err); return; }
      sfx.buy(); this.refresh();
    },
    rush: () => {
      if (!S.rushBuild()) { this.toast('鑽石不足'); return; }
      sfx.levelup(); this.toast('🏘️ 建造完成！'); this.refresh();
    },
    adRush: () => { this.fakeAd(() => { S.adRushBuild(); this.refresh(); }); },
    chest: (arg) => {
      const it = S.openChest(arg);
      if (!it) { this.toast('資源不足'); return; }
      this.refresh(); this.chestReveal(arg, it);
    },
    freeChest: () => {
      if (S.save.daily.freeChest) return;
      const it = S.openChest('wood', true);
      if (it) { this.refresh(); this.chestReveal('wood', it); }
    },
    adGems: () => {
      if (S.save.daily.adGems >= DAILY_AD_GEMS.max) return;
      this.fakeAd(() => { if (S.watchAdForGems()) { sfx.buy(); this.toast(`💎 +${DAILY_AD_GEMS.perAd}`); this.refresh(); } });
    },
    odds: (arg) => {
      const c = CHESTS.find((x) => x.id === arg)!;
      this.modal(`<button class="x" data-a="close">✕</button><h3>${c.name} 機率</h3>
        <table class="odds">${c.odds.map((o, i) => o > 0 ? `<tr><td style="color:${RARITIES[i].color}">${RARITIES[i].name}</td><td>${(o * 100).toFixed(1)}%</td></tr>` : '').join('')}</table>
        ${c.pity ? `<p class="muted small">保底：每 ${c.pity.every} 次內必得 ${RARITIES[c.pity.minRarity].name} 以上</p>` : ''}
        <p class="muted small">裝備種類：${EQUIP_TPLS.map((t) => t.name).join('、')}，各 1/${EQUIP_TPLS.length}</p>`, 'odds-modal');
    },
    buyPack: (arg) => {
      const p = GEM_PACKS.find((x) => x.id === arg)!;
      this.confirmPay(p.ntd, `💎 ${p.gems} 鑽石${S.save.shop.firstBuy[p.id] ? '' : `（首購再送 ${p.gems}）`}`, () => {
        const r = S.buyGemPack(arg);
        this.refresh();
        this.rewardModal('購買成功！', r.gift ? [r.gift] : [], [`💎 +${r.gems + r.bonus}`]);
      });
    },
    payOk: () => { this.closeTop(); const cb = this.payCb; this.payCb = null; cb?.(); },
    offer: () => { sfx.click(); this.showOffer(); },
    buyOffer: () => {
      this.confirmPay(BREAKTHROUGH_OFFER.ntd, BREAKTHROUGH_OFFER.title, () => {
        const it = S.buyOffer();
        this.closeAll(); this.refresh();
        this.rewardModal('購買成功！', [it], [`💎 +${BREAKTHROUGH_OFFER.gems}`, `🪙 +${fmtNum(BREAKTHROUGH_OFFER.gold)}`]);
      });
    },
    cday: (arg) => { sfx.click(); this.carnivalDay = Number(arg); this.refresh(); },
    claimQuest: (arg) => { if (S.claimQuest(arg)) { sfx.coin(); this.refresh(); } },
    goQuest: (arg) => {
      sfx.click();
      if (['upgrades', 'merges'].includes(arg)) this.go('equip');
      else if (arg === 'chests') this.go('shop');
      else if (arg === 'builds') this.go('village');
      else this.go('home');
    },
    milestone: (arg) => {
      const r = S.claimMilestone(Number(arg));
      if (!r) { const m = MILESTONES[Number(arg)]; this.toast(`需要 ${m.points} 積分：${m.label}`); return; }
      this.refresh();
      if (typeof r === 'object') this.rewardModal('獲得大獎！', [r]);
      else { sfx.buy(); this.toast(`獲得 ${MILESTONES[Number(arg)].label}`); }
    },
    carnivalPack: () => {
      if (S.save.carnival.packDays.includes(S.currentDay())) return;
      this.confirmPay(CARNIVAL_PACK.ntd, `嘉年華加速包：+${CARNIVAL_PACK.points} 積分、💎${CARNIVAL_PACK.gems}`, () => {
        if (S.buyCarnivalPack()) { sfx.buy(); this.refresh(); this.toast(`積分 +${CARNIVAL_PACK.points}`); }
      });
    },
    toggleMute: (_a, el) => {
      S.save.settings.muted = !S.save.settings.muted; S.persist(); setMuted(S.save.settings.muted);
      el.textContent = S.save.settings.muted ? '🔇 音效：關' : '🔊 音效：開';
    },
    toggleMusic: (_a, el) => {
      S.save.settings.music = !S.save.settings.music; S.persist(); setMusic(S.save.settings.music);
      el.textContent = S.save.settings.music ? '🎵 音樂：開' : '🎵 音樂：關';
    },
    toggleStop: (_a, el) => {
      S.save.settings.stopOnRelease = !S.save.settings.stopOnRelease; S.persist();
      if (this.battle) this.battle.stopOnRelease = S.save.settings.stopOnRelease;
      el.textContent = S.save.settings.stopOnRelease ? '✋ 放開手指：隊伍停下' : '➡️ 放開手指：隊伍繼續前進';
    },
    continue: () => { sfx.click(); this.resumeRun(); },
    abandonSaved: () => {
      this.modal(`<h3>放棄進行中的冒險？</h3><p>會直接結算，帶回目前的金幣、碎片與掉落。</p>
        <div class="row"><button class="btn" data-a="close">取消</button><button class="btn red" data-a="abandonSavedOk">放棄</button></div>`, 'pay');
    },
    abandonSavedOk: () => { this.closeAll(); if (this.resumeRun()) this.endRun(false); },
    equipTab: (arg) => { sfx.click(); this.equipTab = arg as 'gear' | 'partners'; this.refresh(); },
    partner: (arg) => { sfx.click(); this.partnerModal(arg as PartnerId); },
    upPartner: (arg) => {
      if (!S.upgradePartner(arg as PartnerId)) { this.toast('碎片或金幣不足'); return; }
      sfx.levelup(); vibrate(20); this.closeTop(); this.refresh(); this.partnerModal(arg as PartnerId);
    },
    egg: () => { const got = S.openEgg(); if (!got) { this.toast('鑽石不足'); return; } this.eggReveal(got); },
    adEgg: () => { if (S.save.daily.adEgg) return; this.fakeAd(() => { const got = S.openEgg(true); if (got) this.eggReveal(got); }); },
    eggOdds: () => {
      this.modal(`<button class="x" data-a="close">✕</button><h3>夥伴蛋 機率</h3>
        <p>每顆蛋抽 ${EGG.draws} 次，每次獲得 ${EGG.shardsPerDraw} 片碎片</p>
        <table class="odds">${ALL_PARTNERS.map((p) => `<tr><td>${PARTNERS[p].icon} ${PARTNERS[p].name}</td><td>${(100 / ALL_PARTNERS.length).toFixed(1)}%</td></tr>`).join('')}</table>
        <p class="muted small">尚未在村莊解鎖的夥伴，碎片會先保留，解鎖後即可使用。</p>`, 'odds-modal');
    },
    toggleVibe: (_a, el) => {
      S.save.settings.vibrate = !S.save.settings.vibrate; S.persist(); setVibrate(S.save.settings.vibrate);
      el.textContent = S.save.settings.vibrate ? '📳 震動：開' : '📴 震動：關';
    },
    nextDay: () => { S.debugNextDay(); this.carnivalDay = Math.min(S.currentDay(), CARNIVAL_DAYS); this.closeAll(); this.refresh(); this.toast(`已跳到第 ${S.currentDay()} 天`); },
    cheat: () => { S.save.gold += 50000; S.save.gems += 3000; S.persist(); this.closeAll(); this.refresh(); },
    showEvents: () => {
      const ev = getEvents().slice(-25).reverse();
      this.modal(`<button class="x" data-a="close">✕</button><h3>最近埋點</h3><pre class="events">${ev.map((e) => `${new Date(e.t).toLocaleTimeString()} ${e.e} ${e.p ? JSON.stringify(e.p) : ''}`).join('\n')}</pre>`, 'events-modal');
    },
    reset: () => {
      this.modal(`<h3>重置存檔</h3><p>所有裝備、資源、村莊與嘉年華進度都會清除，無法復原。</p>
        <div class="row"><button class="btn" data-a="close">取消</button><button class="btn red" data-a="resetOk">確認重置</button></div>`, 'pay');
    },
    resetOk: () => { S.resetSave(); S.onBoot(); this.closeAll(); this.go('home'); this.toast('存檔已重置'); },
  };
}

function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}天 ${p(h)}:${p(m)}`;
  if (h > 0) return `${p(h)}:${p(m)}:${p(sec)}`;
  return `${p(m)}:${p(sec)}`;
}

function startOfDay(t: number) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
