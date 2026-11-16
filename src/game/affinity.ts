// 角色好感度：用角色出擊累積，升級解鎖小額加成、角色台詞與頭像框。
import type { CharId } from '../config/balance';
import type { StatKey } from '../config/meta';
import type { SaveData } from './storage';

/** 到達每一級需要的累積好感（Lv1 = 0） */
export const AFF_LEVELS = [0, 40, 120, 250, 450];
export const AFF_MAX = AFF_LEVELS.length;

export const AFF_PERKS = ['初次見面', '攻擊 +3%', '最大生命 +10', '大招能量 +10%', '攻擊 +3%、解鎖「羈絆框」'];

export function affinityPoints(s: SaveData, c: CharId): number {
  return s.affinity?.[c] ?? 0;
}

export function affinityLevel(s: SaveData, c: CharId): number {
  const p = affinityPoints(s, c);
  let lv = 1;
  for (let i = 1; i < AFF_LEVELS.length; i++) if (p >= AFF_LEVELS[i]) lv = i + 1;
  return lv;
}

/** 目前等級的進度（0～1）與到下一級還差多少 */
export function affinityProgress(s: SaveData, c: CharId): { ratio: number; need: number } {
  const lv = affinityLevel(s, c);
  if (lv >= AFF_MAX) return { ratio: 1, need: 0 };
  const p = affinityPoints(s, c);
  const a = AFF_LEVELS[lv - 1];
  const b = AFF_LEVELS[lv];
  return { ratio: (p - a) / (b - a), need: b - p };
}

export function affinityStats(s: SaveData, c: CharId): Partial<Record<StatKey, number>> {
  const lv = affinityLevel(s, c);
  const st: Partial<Record<StatKey, number>> = {};
  if (lv >= 2) st.might = 0.03;
  if (lv >= 3) st.maxHp = 10;
  if (lv >= 4) st.intent = 0.1;
  if (lv >= 5) st.might = 0.06;
  return st;
}

/** 一場戰鬥結束後獲得的好感：每存活 1 分鐘 +3，勝利 +15，出擊本身 +2 */
export function gainAffinity(s: SaveData, c: CharId, seconds: number, won: boolean): { gain: number; levelUp: number | null } {
  const before = affinityLevel(s, c);
  const gain = 2 + Math.floor(seconds / 60) * 3 + (won ? 15 : 0);
  s.affinity = s.affinity ?? {};
  s.affinity[c] = affinityPoints(s, c) + gain;
  const after = affinityLevel(s, c);
  return { gain, levelUp: after > before ? after : null };
}

/** 任一角色好感滿級：解鎖羈絆框 */
export function anyMaxAffinity(s: SaveData): boolean {
  return Object.values(s.affinity ?? {}).some((p) => (p ?? 0) >= AFF_LEVELS[AFF_MAX - 1]);
}

/** 每一級解鎖的台詞 */
export const AFF_LINES: Record<CharId, string[]> = {
  jin: [
    '我只是個拿刀的浪人。跟著我，別期待太多。',
    '這把高周波刀是師父留下的。他說刀不會說謊。',
    '新東京的霓虹很亮，但照不到下層區的人。我想讓那裡也亮一點。',
    '……謝了。有你在背後，我出刀比較穩。',
    '如果哪天我倒下了，替我把這把刀交給下一個想守護別人的人。',
  ],
  zero: [
    '系統連線完成。你就是新來的指揮官？',
    '我駭進過三家財團的主機。最難的是第四家——它沒有網路。',
    '別看我話少，我在看你的戰鬥紀錄。不錯。',
    '要是有人想駭你的義體，我會先讓他的腦袋當機。',
    '我把你的資料從所有財團的資料庫刪掉了。這是禮物。',
  ],
  tetsu: [
    '站在我後面。這身裝甲擋得住子彈。',
    '我以前是企業的保全。後來發現我在保護錯的人。',
    '電磁結界開最大的時候，我能聽見城市在震動。',
    '你受傷的時候，我會比你先衝出去。這是約定。',
    '我的裝甲上刻了一個名字。現在，再多刻一個你的。',
  ],
  oboro: [
    '……你看得見我？那你比大部分人厲害。',
    '分身不會累，但我會。偶爾讓我在你旁邊坐一下。',
    '影忍一族只剩我了。所以我不會再讓重要的人消失。',
    '我第一次想讓別人看見我的臉。……還沒準備好，再等等。',
    '月亮很好看。和你一起看，更好看。',
  ],
  hayabusa: [
    '風速三，距離一千二。你不用擔心，我不會失手。',
    '狙擊手最重要的不是眼睛，是耐心。',
    '我在對面大樓的時候，一直在看你的背影。很可靠。',
    '鎖定的不只是目標，還有我想守住的東西。',
    '這一槍，為你開。從今以後都是。',
  ],
  koma: [
    '我是狛！這傢伙叫阿吽，別看牠是機械，鼻子比誰都靈！',
    '阿吽是我在廢料場撿到的。修了三年，才第一次對我搖尾巴。',
    '牠剛剛偷偷舔了你的手。這代表牠認同你了喔！',
    '有一天我要讓整個新東京的流浪機犬都有家。你會幫我吧？',
    '阿吽說，你是我們的家人。……我也是這麼想的啦。',
  ],
  kagura: [
    '式神們說你身上有很乾淨的氣。請多指教。',
    '狐面是祖母留下的。戴著它，我就不會迷路。',
    '百鬼其實都很溫柔，只是太久沒有人跟它們說話了。',
    '我替你畫了一張護身符。……不准笑，我第一次畫給別人。',
    '神樂舞是獻給神明的。今天這支舞，是獻給你的。',
  ],
  misora: [
    '大家好～我是美空！今天也要為你應援喔！',
    '其實上台前我都超緊張的，只要看到你在台下就好了。',
    '這首新歌的副歌，是想著你寫的。要保密喔！',
    '就算整個城市都不聽歌了，我也會為你一個人唱。',
    '謝謝你一直當我的頭號粉絲。下一場演唱會，你坐第一排！',
  ],
};
