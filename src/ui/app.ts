import { Battle, RunResult } from '../game/battle';
import { Input } from '../core/input';
import { sfx, unlockAudio, setMuted, setVibrate, vibrate } from '../core/audio';
import { iconHtml, hasImage } from '../core/assets';
import { getEvents, track } from '../core/track';
import { CHAPTERS, ROOMS_PER_CHAPTER } from '../data/chapters';
import { EQUIP_TPLS, Item, RARITIES, SLOTS, SLOT_NAME, TPL_MAP, itemStats, statLines, upgradeCost, MERGE_COUNT } from '../data/equipment';
import { SKILL_MAP, SkillDef, SkillId } from '../data/skills';
import { BREAKTHROUGH_OFFER, CHESTS, DAILY_AD_GEMS, GEM_PACKS, NTD_PER_GEM, REVIVE_GEMS, FIRST_PURCHASE_GIFT } from '../data/shop';
import { CARNIVAL_CLAIM_DAYS, CARNIVAL_DAYS, CARNIVAL_PACK, MILESTONES, QUESTS, QUEST_TOTAL_POINTS } from '../data/quests';
import { ASSETS } from '../data/assets';
import * as S from '../meta/state';
import { fmtNum } from '../game/util';

type Screen = 'home' | 'equip' | 'shop' | 'carnival' | 'battle';
type Handler = (arg: string, el: HTMLElement) => void;

const DAY = 86400000;

export class App {
  screen: Screen = 'home';
  battle: Battle | null = null;
  input: Input;
  root: HTMLElement;
  carnivalDay = 1;
  pickHandler: ((id: SkillId) => void) | null = null;
  bot = new URLSearchParams(location.search).has('bot');

  constructor(private canvas: HTMLCanvasElement) {
    this.root = document.getElementById('ui')!;
    this.input = new Input(canvas);
    this.root.innerHTML = `<div id="screen"></div><div id="tabs"></div><div id="modals"></div><div id="toasts"></div>`;
    this.root.addEventListener('click', (e) => {
      unlockAudio();
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!el || el.classList.contains('disabled')) return;
      const fn = this.actions[el.dataset.a!];
      if (fn) { e.stopPropagation(); fn(el.dataset.arg ?? '', el); }
    });
    canvas.addEventListener('pointerdown', () => unlockAudio());
    window.addEventListener('resize', () => this.battle?.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.battle?.state === 'play') this.showPause(); });
    setInterval(() => this.tick(), 1000);
    setMuted(S.save.settings.muted);
    setVibrate(S.save.settings.vibrate);
    this.carnivalDay = Math.min(S.currentDay(), CARNIVAL_DAYS);
    this.go('home');
    if (this.bot) setTimeout(() => this.startRun(), 300);
  }

  // ================= 共用 =================
  $(sel: string) { return this.root.querySelector<HTMLElement>(sel)!; }

  go(s: Screen) {
    this.screen = s;
    document.body.classList.toggle('in-battle', s === 'battle');
    this.renderScreen();
  }

  renderScreen() {
    const s = this.screen;
    const html = s === 'home' ? this.homeHtml() : s === 'equip' ? this.equipHtml() : s === 'shop' ? this.shopHtml() : s === 'carnival' ? this.carnivalHtml() : this.battleHtml();
    this.$('#screen').innerHTML = s === 'battle' ? html : this.topbarHtml() + `<div class="page page-${s}">${html}</div>`;
    this.$('#tabs').innerHTML = s === 'battle' ? '' : this.tabsHtml();
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
    return t('shop', '🛒', '商店', !S.save.daily.freeChest || S.save.daily.adGems < DAILY_AD_GEMS.max)
      + t('equip', '🎒', '裝備', this.mergeableCount() > 0)
      + t('home', '⚔️', '冒險')
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

  /** 倒數文字（每秒更新 data-cd） */
  tick() {
    this.root.querySelectorAll<HTMLElement>('[data-cd]').forEach((el) => {
      const ms = Number(el.dataset.cd) - S.now();
      el.textContent = ms > 0 ? fmtTime(ms) : '已結束';
    });
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
    return `
      <div class="badges">${carnival}${offer}</div>
      <div class="logo">${hasImage('logo') ? iconHtml('logo', '') : '<h1>萌爪突擊</h1><p>PAW STRIKE</p>'}</div>
      <div class="hero-stage"><div class="hero-pic">${iconHtml('hero', '🐶')}</div></div>
      <div class="chapter-card ${locked ? 'locked' : ''}">
        <button class="arrow" data-a="chapter" data-arg="-1" ${ch.id === 1 ? 'disabled' : ''}>◀</button>
        <div class="ch-body">
          <div class="ch-icon">${ch.icon}</div>
          <div class="ch-name">${ch.name}・${ch.subtitle}</div>
          <div class="ch-best">${locked ? '🔒 通關上一章解鎖' : S.save.cleared[ch.id] ? '✅ 已通關' : `最佳紀錄 ${best}/${ROOMS_PER_CHAPTER}`}</div>
          <div class="ch-power ${pw < ch.recommendedPower ? 'low' : ''}">推薦戰力 ${fmtNum(ch.recommendedPower)}</div>
        </div>
        <button class="arrow" data-a="chapter" data-arg="1" ${ch.id === CHAPTERS.length ? 'disabled' : ''}>▶</button>
      </div>
      <button class="btn big green start ${locked ? 'disabled' : ''}" data-a="start">開始冒險</button>
      <p class="hint">單指拖曳移動・停下來自動射擊</p>`;
  }

  // ================= 裝備 =================
  equipHtml() {
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
      <div class="stats">
        <span>⚔️ 攻擊 <b>${Math.round(st.atk)}</b></span>
        <span>❤️ 生命 <b>${Math.round(st.maxHp)}</b></span>
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
      <div class="item-detail" style="--rc:${r.color}">
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
    const freePossible = QUEST_TOTAL_POINTS;
    return `
      <div class="carnival-head">
        <h2>🎉 新手 7 日嘉年華</h2>
        <div class="muted small">活動剩餘 <b data-cd="${endAt}"></b>・免費可得 ${freePossible} 積分，最終大獎需 ${maxPts}</div>
      </div>
      <div class="ms-track"><div class="ms-bar"><i style="width:${Math.min(100, (pts / maxPts) * 100)}%"></i></div>${ms}<div class="ms-cur">⭐ ${pts}</div></div>
      <div class="days">${days}</div>
      ${dayLocked ? `<div class="card center muted">第 ${this.carnivalDay} 天任務將在 <b data-cd="${unlockAt}"></b> 後開放</div>` : ''}
      <div class="quests">${quests}</div>
      <button class="card pack wide ${packBought ? 'disabled' : ''}" data-a="carnivalPack">
        <div><b>今日加速包</b><div class="muted small">+${CARNIVAL_PACK.points} 嘉年華積分 ＋ 💎${CARNIVAL_PACK.gems}（每日限購 1）</div></div>
        <div class="price">${packBought ? '已購買' : `NT$ ${CARNIVAL_PACK.ntd}`}</div>
      </button>`;
  }

  // ================= 戰鬥 =================
  battleHtml() {
    return `<button class="pause-btn" data-a="pause">❚❚</button>`;
  }

  startRun() {
    const ch = S.save.selectedChapter;
    if (ch > S.save.unlockedChapter) return;
    this.closeAll();
    this.go('battle');
    this.battle?.stop();
    const b = new Battle(this.canvas, this.input, {
      levelUp: (choices, canReroll) => this.showLevelUp(choices, canReroll),
      died: (canRevive) => this.showRevive(canRevive),
      finished: (r) => this.onFinished(r),
    }, ch, S.playerStats());
    b.bot = this.bot;
    b.timeScale = Math.max(1, Number(new URLSearchParams(location.search).get('speed')) || 1);
    this.battle = b;
    b.start();
  }

  showLevelUp(choices: SkillDef[], canReroll: boolean) {
    const b = this.battle!;
    if (this.bot) { setTimeout(() => b.pickSkill(choices[0].id), 50); return; }
    const card = (s: SkillDef) => {
      const lv = b.L(s.id);
      const stars = s.maxLv < 10 ? Array.from({ length: s.maxLv }, (_, i) => `<i class="${i < lv ? 'on' : ''} ${i === lv ? 'new' : ''}"></i>`).join('') : '';
      return `<button class="skill ${s.evo ? 'evo' : ''}" data-a="pickSkill" data-arg="${s.id}">
        ${s.evo ? '<span class="evo-tag">超武</span>' : ''}
        <div class="sk-ico">${s.icon}</div>
        <div class="sk-name">${s.name}</div>
        <div class="sk-desc">${s.desc}</div>
        <div class="stars">${stars}</div>
      </button>`;
    };
    const owned = Object.entries(b.skills).map(([id, lv]) => `<span title="${id}">${choicesIcon(id as SkillId)}${lv! > 1 ? `<sub>${lv}</sub>` : ''}</span>`).join('');
    this.modal(`
      <h2 class="lvup">升級！ Lv.${b.level}</h2>
      <p class="muted">選擇一個技能</p>
      <div class="skills">${choices.map(card).join('')}</div>
      ${canReroll ? `<button class="btn small blue" data-a="reroll">📺 看廣告重抽（限 1 次）</button>` : ''}
      <div class="owned">${owned}</div>`, 'levelup');
  }

  showRevive(canRevive: boolean) {
    const b = this.battle!;
    if (this.bot) { if (canRevive && new URLSearchParams(location.search).has('revive')) b.revive(); else b.giveUp(); return; }
    if (!canRevive) { b.giveUp(); return; }
    sfx.lose();
    this.modal(`
      <h2>倒下了…</h2>
      <p class="muted">房間 ${b.roomIdx + 1}/${ROOMS_PER_CHAPTER}${b.boss && b.boss.alive ? `・Boss 剩 ${Math.round((b.boss.hp / b.boss.maxHp) * 100)}%` : ''}</p>
      <div class="revive-ring"><span>🐶</span></div>
      <button class="btn big green" data-a="reviveAd">📺 看廣告復活</button>
      <button class="btn ${S.save.gems >= REVIVE_GEMS ? 'blue' : 'disabled'}" data-a="reviveGem">💎 ${REVIVE_GEMS} 復活</button>
      <button class="link" data-a="giveUp">放棄</button>`, 'revive');
  }

  onFinished(r: RunResult) {
    this.closeAll();
    const reward = S.settleRun(r);
    const showOffer = !r.win && S.maybeTriggerOffer({ reachedBoss: r.reachedBoss, bossHpPct: r.bossHpPct, roomsCleared: r.roomsCleared });
    if (this.bot) {
      (window as unknown as { __lastRun: unknown }).__lastRun = { ...r, reward, hurt: this.battle?.hurtBy };
      console.log('[bot] run', JSON.stringify({ win: r.win, rooms: r.roomsCleared, level: r.level, bossHp: r.bossHpPct, kills: r.kills }));
      this.battle?.stop(); this.battle = null; this.go('home');
      return;
    }
    const items = reward.items.map((it) => this.itemCard(it, 'data-a=""')).join('');
    this.modal(`
      <h2 class="${r.win ? 'win' : 'lose'}">${r.win ? '🏆 章節通關！' : '冒險結束'}</h2>
      <div class="result-stats">
        <div><b>${r.roomsCleared}</b><span>房間</span></div>
        <div><b>${r.kills}</b><span>擊倒</span></div>
        <div><b>Lv.${r.level}</b><span>等級</span></div>
      </div>
      <div class="rewards">
        <div class="res">${iconHtml('gold', '🪙')}<b>+${fmtNum(reward.gold)}</b></div>
        ${reward.gems ? `<div class="res">${iconHtml('gem', '💎')}<b>+${reward.gems}</b></div>` : ''}
      </div>
      ${items ? `<div class="bag small">${items}</div>` : ''}
      <button class="btn big green" data-a="toHome">${showOffer ? '繼續' : '回到大廳'}</button>`, 'result', () => {
      this.battle?.stop(); this.battle = null;
      this.go('home');
      if (showOffer) this.showOffer(true);
    });
  }

  showPause() {
    if (!this.battle || this.battle.state !== 'play') return;
    this.battle.pause();
    const b = this.battle;
    const owned = Object.entries(b.skills).map(([id, lv]) => `<span>${choicesIcon(id as SkillId)}${lv! > 1 ? `<sub>${lv}</sub>` : ''}</span>`).join('') || '<span class="muted">尚無技能</span>';
    this.modal(`
      <h2>暫停</h2>
      <div class="owned big">${owned}</div>
      <button class="btn big green" data-a="resume">繼續</button>
      <button class="btn" data-a="toggleMute">${S.save.settings.muted ? '🔇 音效：關' : '🔊 音效：開'}</button>
      <button class="link" data-a="quitRun">放棄本次冒險</button>`, 'pause', () => this.battle?.resume());
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
        <div class="oi" style="--rc:${rc.color}"><div class="item r${it.rarity}" style="--rc:${rc.color}">${iconHtml(`equip_${it.tpl}`, TPL_MAP[it.tpl].icon)}</div><span style="color:${rc.color}">${rc.name}${TPL_MAP[it.tpl].name}</span></div>
        <div class="oi"><div class="item">${iconHtml('gem', '💎')}</div><span>💎 ×${o.gems}</span></div>
        <div class="oi"><div class="item">${iconHtml('gold', '🪙')}</div><span>🪙 ×${fmtNum(o.gold)}</span></div>
      </div>
      <div class="value-note">
        光是 ${o.gems} 鑽石在商店約需 <b>NT$ ${gemValue}</b><br>
        <span class="muted small">史詩裝備在黃金寶箱的機率為 25%（約需 💎 1200）</span>
      </div>
      <button class="btn big gold" data-a="buyOffer">NT$ ${o.ntd}</button>
      <p class="hint small">模擬購買，不會實際扣款</p>`, 'offer');
  }

  /** 模擬金流確認 */
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
  payCb: (() => void) | null = null;

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
      <div class="reveal">${items.map((it) => `<div class="reveal-item" style="--rc:${RARITIES[it.rarity].color}">${this.itemCard(it, 'data-a=""')}<span style="color:${RARITIES[it.rarity].color}">${RARITIES[it.rarity].name}・${TPL_MAP[it.tpl].name}</span></div>`).join('')}</div>
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
      <h3 class="sec">測試工具</h3>
      <p class="muted small">目前嘉年華第 ${S.currentDay()} 天・美術素材 ${loaded}/${ASSETS.length} 已替換・埋點 ${ev.length} 筆</p>
      <button class="btn blue" data-a="nextDay">⏭ 跳到下一天</button>
      <button class="btn blue" data-a="cheat">💰 測試資源（金幣+5萬、鑽石+3000）</button>
      <button class="btn blue" data-a="showEvents">📊 查看最近埋點</button>
      <button class="btn red" data-a="reset">🗑 重置存檔</button>`, 'settings');
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
    pause: () => this.showPause(),
    resume: () => { sfx.click(); this.closeTop(); },
    quitRun: () => { this.closeAll(); this.battle?.giveUp(); },
    pickSkill: (arg) => {
      this.closeAll();
      this.battle?.pickSkill(arg as SkillId);
    },
    reroll: () => {
      this.fakeAd(() => {
        const b = this.battle!;
        const choices = b.reroll();
        this.closeAll();
        this.showLevelUp(choices, false);
      });
    },
    reviveAd: () => { this.fakeAd(() => { this.closeAll(); track('ad_reward', { kind: 'revive' }); this.battle?.revive(); }); },
    reviveGem: () => {
      if (S.save.gems < REVIVE_GEMS) return;
      S.save.gems -= REVIVE_GEMS; S.persist();
      this.closeAll(); this.battle?.revive();
    },
    giveUp: () => { this.closeAll(); this.battle?.giveUp(); },
    toHome: () => { sfx.click(); this.closeTop(); },
    item: (arg) => { if (!arg) return; sfx.click(); this.itemModal(Number(arg)); },
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
      this.modal(`<h3>重置存檔</h3><p>所有裝備、資源與嘉年華進度都會清除，無法復原。</p>
        <div class="row"><button class="btn" data-a="close">取消</button><button class="btn red" data-a="resetOk">確認重置</button></div>`, 'pay');
    },
    resetOk: () => { S.resetSave(); S.onBoot(); this.closeAll(); this.go('home'); this.toast('存檔已重置'); },
  };

  chestReveal(chestId: string, it: Item) {
    const c = CHESTS.find((x) => x.id === chestId)!;
    const m = this.modal(`<div class="chest-open">${iconHtml(`chest_${c.id}`, c.icon, 'shake')}</div>`, 'chest-wrap');
    sfx.click();
    setTimeout(() => { m.remove(); this.rewardModal(it.rarity >= 3 ? '大獎！' : '開箱獲得', [it]); }, 750);
  }
}

function choicesIcon(id: SkillId): string {
  return SKILL_MAP[id]?.icon ?? '?';
}

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}天 ${p(h)}:${p(m)}` : `${p(h)}:${p(m)}:${p(sec)}`;
}

function startOfDay(t: number) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
