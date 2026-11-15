import { it } from 'vitest';
import enemies from '../src/data/enemies.json';
import { addExp } from '../src/systems/progression';
import { computeStats } from '../src/systems/progression';
import { BASES, type BaseId } from '../src/systems/equipment';
import quests from '../src/data/quests.json';

type E = { name: string; hp: number; atk: number; def: number; exp: number; elite?: boolean };
const EN = enemies as unknown as Record<string, E>;
const dmg = (atk: number, mult: number, def: number) => Math.max(1, atk * mult - def * 0.5);

// 各章打完的經驗（地圖上的怪大約清 2 次、加上支線與討伐）
const CH: { name: string; mobs: [string, number][]; elites: string[]; boss: string; quests: string[]; tier: number; weapon: Record<string, BaseId> }[] = [
  { name: '第一章', mobs: [['kitsunebi', 10], ['karakasa', 6], ['nogitsune', 8], ['bonespider', 10]], elites: ['chochin'], boss: 'tsuchigumo', quests: ['taro_beetles', 'ume_charm', 'hunt_kitsunebi', 'oba_herb', 'tesshin_steel'], tier: 1, weapon: { swordsman: 'iron_sword', archer: 'half_bow', onmyoji: 'talisman_fan' } },
  { name: '第二章', mobs: [['kappa', 12], ['dorotabou', 9], ['aokitsunebi', 9]], elites: ['suiko'], boss: 'kappaking', quests: ['kawataro_dish', 'hunt_kappa', 'fisher_mud', 'taro_kite', 'collect_mud'], tier: 3, weapon: { swordsman: 'fox_sword', archer: 'moon_bow', onmyoji: 'fox_fan' } },
  { name: '第三章', mobs: [['karasu', 12], ['yamawaro', 9], ['kamaitachi', 12]], elites: ['oogarasu'], boss: 'daitengu', quests: ['santa_kaki', 'hunt_karasu', 'hermit_bells', 'collect_claw'], tier: 3, weapon: { swordsman: 'muramasa', archer: 'raijodo', onmyoji: 'tengu_fan' } },
  { name: '第四章', mobs: [['gaki', 12], ['aka_oni', 8], ['ao_oni', 8], ['onibi', 8]], elites: ['ibaraki', 'shuten'], boss: 'hyakki', quests: ['hunt_oni', 'collect_horn', 'onimother_gaki'], tier: 4, weapon: { swordsman: 'amenomurakumo', archer: 'raijin_bow', onmyoji: 'tengu_feather_fan' } },
];
const ARMOR: Record<number, BaseId[]> = { 1: ['hachigane', 'leather_do', 'iron_gloves', 'tabi', 'magatama'], 3: ['suiko_mask', 'kappa_shell', 'suijin_gloves', 'swift_zori', 'kappa_dish'], 4: ['tengu_mask', 'yamabushi_garb', 'crow_gloves', 'tengu_geta', 'yata_mirror'] };

// 數值平衡報告：npm run balance（平常的測試會跳過）
it.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BALANCE)('balance report', () => {
  let lv = 1, exp = 0;
  const Q = quests as unknown as Record<string, { reward: { exp?: number } }>;
  for (const ch of CH) {
    const gained = ch.mobs.reduce((s, [k, n]) => s + EN[k].exp * n, 0) + ch.elites.reduce((s, k) => s + EN[k].exp, 0) + ch.quests.reduce((s, q) => s + (Q[q]?.reward.exp ?? 0), 0);
    const atBoss = addExp(lv, exp, gained); lv = atBoss.level; exp = atBoss.exp;
    const lines: string[] = [`\n== ${ch.name}：打 Boss 時約 Lv.${lv}（本章經驗 ${gained}）`];
    for (const cls of ['swordsman', 'archer', 'onmyoji'] as const) {
      const gear = [ch.weapon[cls], ...ARMOR[ch.tier === 3 && ch.name === '第二章' ? 1 : ch.tier]].map((b) => BASES[b].stats);
      const st = computeStats(cls, lv, gear, lv >= 10 && ch.name !== '第一章' && ch.name !== '第二章');
      const row = [`  ${cls.padEnd(9)} HP${String(st.maxHp).padStart(4)} 攻${String(st.atk).padStart(3)} 防${String(st.def).padStart(3)} |`];
      for (const [k] of ch.mobs) { const e = EN[k]; row.push(`${e.name} ${Math.ceil(e.hp / dmg(st.atk, 1, e.def))}刀/${Math.ceil(st.maxHp / dmg(e.atk, 1, st.def))}下`); }
      for (const k of [...ch.elites, ch.boss]) { const e = EN[k]; row.push(`${e.name} ${Math.ceil(e.hp / dmg(st.atk, 1.1, e.def))}刀/${Math.ceil(st.maxHp / dmg(e.atk, 1.3, st.def))}下`); }
      lines.push(row.join(' '));
    }
    console.log(lines.join('\n'));
    const after = addExp(lv, exp, EN[ch.boss].exp); lv = after.level; exp = after.exp;
  }
});
