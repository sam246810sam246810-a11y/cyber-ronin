import Phaser from 'phaser';
import { BOSSES, CHARACTERS, CHAR_ORDER, ENEMIES, EVOLUTIONS, PASSIVES, PASSIVE_POOL, UNLOCKS, WEAPONS, WEAPON_POOL, WeaponId } from '../config/balance';
import { RELICS, ULTIMATES } from '../config/expansion';
import { CHAR_RARITY, MAX_STAR, SPIRITS, SPIRIT_SETS, spiritLevel } from '../config/gacha';
import { STAGES } from '../config/stages';
import { MOD_RARITY, fmtStat } from '../config/meta';
import { T } from '../i18n/zh-TW';
import { COLORS, H, W, textStyle } from '../game/layout';
import { header, makeButton, setupLogicalCamera } from '../game/ui';
import { enter, goTo, lobbyBackground } from '../game/chrome';
import { loadSave } from '../game/storage';
import { Audio } from '../game/audio';
import { ownsChar, starOf, unlockCost } from '../game/gacha';

type Tab = 'chars' | 'weapons' | 'items' | 'relics' | 'enemies' | 'spirits';

interface Entry {
  icon: string;
  name: string;
  desc: string;
  seen: boolean;
  hint?: string;
  /** 外框顏色（稀有度等） */
  color?: number;
  /** 右上角小字（稀有度、Lv 等） */
  tag?: string;
}

/** 大招效果說明 */
const ULT_DESC: Record<string, string> = {
  jin: '全螢幕刀光：秒殺畫面內的雜兵，重創精英與 Boss',
  zero: '畫面內敵人停住 3 秒並感染病毒，之後承受的傷害 +50%',
  tetsu: '電磁衝擊波擊退並麻痺 2 秒，連續 8 道落雷，自己 3 秒無敵',
  oboro: '2 秒內分身連斬 8 次，每一斬都命中畫面內所有敵人；期間無敵',
  hayabusa: '鎖定血量最高的 5 個目標射下衛星光柱，Boss 受到最大生命 12% 傷害',
  kagura: '百鬼橫掃全畫面，存活的敵人恐懼逃跑 4 秒，接著狐火大爆發（兩段傷害）',
  misora: '畫面內敵人著迷停住 2.5 秒並受傷，自己回復 40% 生命、3 秒無敵，接著彩虹爆發（兩段傷害）',
};

/** 專屬武器屬於哪個角色 */
const SIGNATURE: Partial<Record<WeaponId, string>> = { shadow: '影忍・朧', railgun: '狙擊手・隼', talisman: '陰陽師・神樂', song: '歌姬・美空' };

export class CodexScene extends Phaser.Scene {
  private tab: Tab = 'chars';
  private selected = 0;

  constructor() {
    super('Codex');
  }

  create() {
    setupLogicalCamera(this);
    Audio.playLobby();
    this.selected = 0;
    this.draw();
    enter(this);
  }

  private entries(): Entry[] {
    const s = loadSave();
    const hintFor = (id: string) => {
      const u = UNLOCKS.find((x) => x.id === id);
      return u && !s.unlocked.includes(u.id) ? T.unlockHint(u.hint) : undefined;
    };
    if (this.tab === 'chars') {
      return CHAR_ORDER.map((id) => {
        const c = CHARACTERS[id];
        const r = CHAR_RARITY[id];
        const owned = ownsChar(s, id);
        const st = starOf(s, id);
        const u = ULTIMATES[id];
        const w = WEAPONS[c.weapon];
        const lines = [
          `${c.role}　${owned ? '★'.repeat(st) + '☆'.repeat(MAX_STAR - st) : `未擁有（碎片 ${s.shards[id] ?? 0}/${unlockCost(id)}）`}`,
          `生命 ${c.maxHp}　移動 ${Math.round(c.speedMult * 100)}%${c.armor ? `　護甲 ${c.armor}` : ''}`,
          `特性：${c.trait}`,
          `專屬武器「${w.name}」：${w.desc.replace('專屬武器：', '')}`,
          `大招「${u.name}」（能量：${u.gauge}）：${ULT_DESC[id] ?? ''}`,
        ];
        return { icon: this.textures.exists(`avatar-${id}`) ? `avatar-${id}` : `char-${id}`, name: c.name, desc: lines.join('\n'), seen: true, color: MOD_RARITY[r].color, tag: MOD_RARITY[r].name, dim: !owned } as Entry & { dim: boolean };
      });
    }
    if (this.tab === 'weapons') {
      const evolved: WeaponId[] = EVOLUTIONS.map((e) => e.result);
      const sig = Object.keys(SIGNATURE) as WeaponId[];
      return [...WEAPON_POOL, ...evolved, ...sig].map((id) => {
        const w = WEAPONS[id];
        const evo = EVOLUTIONS.find((e) => e.result === id);
        let desc = w.desc;
        if (evo) desc = `${w.desc}\n${T.evolution}：${WEAPONS[evo.weapon].name} 滿級 ＋ ${PASSIVES[evo.passive].name}`;
        if (SIGNATURE[id]) desc = `${w.desc}\n角色專屬：${SIGNATURE[id]}的起始武器`;
        return {
          icon: `icon-${id}`,
          name: w.name,
          desc,
          seen: s.seenWeapons.includes(id),
          hint: SIGNATURE[id] ? `使用「${SIGNATURE[id]}」出擊後解鎖` : hintFor(id),
          color: evo ? COLORS.gold : SIGNATURE[id] ? COLORS.magenta : undefined,
          tag: evo ? '進化' : SIGNATURE[id] ? '專屬' : undefined,
        };
      });
    }
    if (this.tab === 'items') {
      return PASSIVE_POOL.map((id) => {
        const p = PASSIVES[id];
        return { icon: `icon-${id}`, name: p.name, desc: `每級：${p.desc}（最高 Lv ${p.maxLevel}）`, seen: s.seenPassives.includes(id), hint: hintFor(id) };
      });
    }
    if (this.tab === 'relics') {
      return RELICS.map((r) => ({
        icon: `relic-${r.id}`,
        name: r.name,
        desc: r.desc,
        seen: (s.seenRelics ?? []).includes(r.id),
        hint: '在遊戲中取得一次後解鎖（打倒精英、黑市、事件）',
        color: r.curse ? 0xff3d3d : undefined,
        tag: r.curse ? '詛咒' : undefined,
      }));
    }
    if (this.tab === 'spirits') {
      return SPIRITS.map((sp) => {
        const lv = spiritLevel(s.spirits[sp.id] ?? 0);
        const set = SPIRIT_SETS.find((x) => x.members.includes(sp.id));
        return {
          icon: `spirit-${sp.id}`,
          name: sp.name,
          desc: `${MOD_RARITY[sp.rarity].name} 式神　${lv ? `目前 Lv ${lv}` : '未取得'}\n每級：${fmtStat(sp.stat, sp.per)}（最高 Lv 10）\n圖鑑組合「${set?.name ?? ''}」：${set?.desc ?? ''}`,
          seen: lv > 0,
          hint: `${MOD_RARITY[sp.rarity].name} 式神：從靈物池抽到`,
          color: MOD_RARITY[sp.rarity].color,
          tag: lv ? `Lv${lv}` : MOD_RARITY[sp.rarity].name,
        };
      });
    }
    // 敵人：基本敵人、各關卡的新敵人、Boss
    const where = (stageName: string) => `出沒：${stageName}`;
    const grunts: Entry[] = (['drone', 'thug', 'husk', 'gunner', 'elite'] as const).map((k) => {
      const e = ENEMIES[k];
      return { icon: e.tex, name: e.name, desc: `${e.desc}\n${where('各關卡')}`, seen: s.seenEnemies.includes(k), color: k === 'elite' ? COLORS.gold : undefined, tag: k === 'elite' ? '精英' : undefined };
    });
    const skins: Entry[] = [];
    for (const st of STAGES) {
      for (const sk of Object.values(st.skins)) {
        if (!sk) continue;
        skins.push({ icon: sk.tex, name: sk.name, desc: `${sk.desc}\n${where(st.name)}`, seen: s.seenEnemies.includes(sk.tex), hint: `在「${st.name}」打倒一次後解鎖` });
      }
    }
    const bosses: Entry[] = BOSSES.map((b) => ({ icon: b.tex, name: b.title, desc: `BOSS　${b.desc}\n${where(b.final ? '霓虹貧民窟（最終 Boss）' : '各關卡')}`, seen: s.seenEnemies.includes(b.tex), color: 0xff2244, tag: 'BOSS' }));
    for (const st of STAGES) {
      const fb = st.finalBoss;
      if (!fb) continue;
      bosses.push({ icon: fb.tex, name: fb.title, desc: `BOSS　${fb.desc}\n${where(`${st.name}（最終 Boss）`)}`, seen: s.seenEnemies.includes(fb.tex), hint: `在「${st.name}」打倒一次後解鎖`, color: 0xff2244, tag: 'BOSS' });
    }
    return [...grunts, ...skins, ...bosses];
  }

  private draw() {
    this.children.removeAll(true);
    this.tweens.killAll();
    lobbyBackground(this, 0.75);
    header(this, T.codexTitle, null, () => goTo(this, 'Menu'));

    const tabs: [Tab, string][] = [
      ['chars', '角色'],
      ['weapons', T.tabWeapons],
      ['items', T.tabItems],
      ['relics', '遺物'],
      ['enemies', T.tabEnemies],
      ['spirits', '式神'],
    ];
    tabs.forEach(([t, label], i) => {
      makeButton(this, W / 2 + ((i % 3) - 1) * 164, 110 + Math.floor(i / 3) * 50, 150, 44, label, COLORS.violet, () => {
        this.tab = t;
        this.selected = 0;
        this.draw();
      }, 17).setActive2(this.tab === t);
    });

    const list = this.entries();
    const found = list.filter((e) => e.seen).length;
    const isChars = this.tab === 'chars';
    const owned = isChars ? CHAR_ORDER.filter((id) => ownsChar(loadSave(), id)).length : found;
    this.add.text(W / 2, 200, isChars ? `擁有 ${owned} / ${list.length}` : `${found} / ${list.length}`, textStyle(14, COLORS.dim, false)).setOrigin(0.5);

    const cols = isChars ? 3 : list.length > 16 ? 5 : 4;
    const cell = isChars ? 150 : cols === 5 ? 98 : 112;
    const x0 = W / 2 - (cols * cell) / 2 + cell / 2;
    const y0 = 222 + cell / 2;
    list.forEach((e, i) => {
      const x = x0 + (i % cols) * cell;
      const y = y0 + Math.floor(i / cols) * cell;
      const sel = i === this.selected;
      const dim = (e as Entry & { dim?: boolean }).dim;
      const edge = e.color ?? 0x2e2650;
      const bg = this.add.rectangle(x, y, cell - 8, cell - 8, sel ? 0x1c1838 : COLORS.panel, 0.95).setStrokeStyle(sel ? 3 : 2, sel ? COLORS.cyan : edge, e.seen ? 1 : 0.4);
      if (this.textures.exists(e.icon)) {
        const img = this.add.image(x, y - 10, e.icon);
        const src = img.texture.getSourceImage();
        // 敵人與 Boss 的圖四周留白很多，用身體的高度來縮放
        const padded = this.tab === 'enemies' && /^(enemy|boss)-/.test(e.icon);
        img.setScale(padded ? Math.min((cell * 0.66) / (src.height * 0.68), (cell * 1.05) / src.width / 0.5) : (cell * 0.62) / Math.max(src.width, src.height));
        if (!e.seen) img.setTintFill(0x1a1630);
        else if (dim) img.setTint(0x4a4466);
      }
      if (e.tag && e.seen) this.add.text(x + cell / 2 - 8, y - cell / 2 + 6, e.tag, textStyle(10, '#ffd84d')).setOrigin(1, 0).setStroke('#07060d', 3);
      this.add.text(x, y + cell / 2 - 20, e.seen ? e.name : T.unknown, textStyle(11, e.seen ? (dim ? '#8a86a8' : '#e9f6ff') : COLORS.dim, false)).setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerup', () => {
        this.selected = i;
        Audio.play('sfx-click', 0.3);
        this.draw();
      });
    });

    // 詳細說明
    const e = list[this.selected];
    if (e) {
      const rows = Math.ceil(list.length / cols);
      const py = Math.min(H - 150, y0 + rows * cell - cell / 2 + 12);
      const ph = H - py - 16;
      this.add.rectangle(W / 2, py + ph / 2, 510, ph, 0x0b0916, 0.95).setStrokeStyle(1, e.color ?? COLORS.magenta, 0.7);
      this.add.text(36, py + 14, e.seen ? e.name : T.unknown, textStyle(20, e.seen ? '#ffffff' : COLORS.dim)).setOrigin(0, 0);
      const desc = e.seen ? e.desc : e.hint ?? '尚未遇見。';
      this.add.text(36, py + 46, desc, { ...textStyle(14, '#c9c6e0', false), wordWrap: { width: 470, useAdvancedWrap: true }, lineSpacing: 6 }).setOrigin(0, 0);
    }
  }
}
