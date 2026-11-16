// 關卡劇情：每關開頭與第一次通關時的對話，串起一條主線。
import type { StageId } from './stages';

export interface StoryLine {
  /** 說話的角色（用頭像），或 'sys' 代表旁白 */
  who: 'jin' | 'zero' | 'tetsu' | 'oboro' | 'hayabusa' | 'kagura' | 'misora' | 'koma' | 'sys';
  text: string;
}

export const STORY: Record<StageId, { intro: StoryLine[]; outro: StoryLine[] }> = {
  slums: {
    intro: [
      { who: 'sys', text: '新東京・下層區。霓虹照不到的巷弄裡，企業的維安部隊封鎖了整條街。' },
      { who: 'zero', text: '刃，前後的路都被無人機封死了。' },
      { who: 'jin', text: '那就從正面殺出去。' },
      { who: 'zero', text: '鬼面將軍在巷子盡頭等你……別死了，我還沒收到報酬。' },
    ],
    outro: [
      { who: 'zero', text: '鬼面將軍倒了！他身上的資料……指向企業總部的頂樓。' },
      { who: 'jin', text: '下一站，高塔。' },
    ],
  },
  tower: {
    intro: [
      { who: 'hayabusa', text: '我在對面大樓架好槍了。掩護交給我，你只管往前衝。' },
      { who: 'jin', text: '天狗執行官……就是幕後黑手？' },
      { who: 'hayabusa', text: '他只是棋子。真正的命令，來自更深的地方。' },
    ],
    outro: [
      { who: 'hayabusa', text: '天狗的硬碟裡有一組座標——一座被駭入的神社。' },
      { who: 'jin', text: '企業連神明都不放過嗎。' },
    ],
  },
  shrine: {
    intro: [
      { who: 'kagura', text: '這裡的神被程式汙染了……式神們都在哭。' },
      { who: 'jin', text: '那就把汙染斬斷。' },
      { who: 'kagura', text: '八岐大蛇守著最深處。我會用符咒幫你開路，跟緊我喔。' },
    ],
    outro: [
      { who: 'kagura', text: '大蛇的核心……連到地底下。那裡是資料的墳場。' },
      { who: 'jin', text: '越來越深了。' },
    ],
  },
  grave: {
    intro: [
      { who: 'oboro', text: '死去的資料在這裡化成幽靈。我在影子裡等你很久了。' },
      { who: 'jin', text: '你是誰？' },
      { who: 'oboro', text: '和你一樣，被企業抹去名字的人。今天，換我們抹掉他們。' },
    ],
    outro: [
      { who: 'oboro', text: '亡靈主機最後的訊號……來自天上。軌道兵器「天照」。' },
      { who: 'jin', text: '那就飛上去。' },
    ],
  },
  orbit: {
    intro: [
      { who: 'misora', text: '全頻道直播中！今晚的舞台在——宇宙！' },
      { who: 'jin', text: '……你怎麼也來了？' },
      { who: 'misora', text: '當然是來為大家應援的呀！唱到最後一首之前，誰都不准倒下喔！' },
      { who: 'tetsu', text: '別鬧了。天照的主炮正在充能，城市就在它的射程裡。' },
    ],
    outro: [
      { who: 'tetsu', text: '天照沉默了。看，城市的燈……又亮了。' },
      { who: 'misora', text: '今晚的演唱會，大成功！' },
      { who: 'jin', text: '這座城的黑夜還沒結束。但今晚——我們贏了。' },
    ],
  },
  abyss: {
    intro: [
      { who: 'sys', text: '天照墜落之後，所有殘留的訊號都指向同一個地方——海底。' },
      { who: 'koma', text: '阿吽一直對著海面低吼……下面有很大的東西。' },
      { who: 'zero', text: '深海都市的主機還在運作。有人在用它喚醒「利維坦」。' },
      { who: 'jin', text: '那就潛下去，把它斬斷。' },
    ],
    outro: [
      { who: 'koma', text: '利維坦不動了！阿吽，我們贏了！' },
      { who: 'kagura', text: '海裡的靈也安靜下來了……謝謝你們。' },
      { who: 'jin', text: '從天上到海底，這座城的每一個角落，我都會守住。' },
    ],
  },
};

export const SPEAKER_NAME: Record<StoryLine['who'], string> = {
  jin: '刃',
  zero: '零',
  tetsu: '鐵',
  oboro: '朧',
  hayabusa: '隼',
  koma: '狛',
  kagura: '神樂',
  misora: '美空',
  sys: '',
};
