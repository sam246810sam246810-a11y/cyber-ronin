// 遊戲進度（金錢、道具、旗標、已開寶箱）。M6 會把它存進 localStorage。
export interface Reward { money?: number; item?: string; count?: number }

export interface GameState {
  money: number;
  items: Record<string, number>;
  flags: Set<string>;
  openedChests: Set<string>;
}

export function newGameState(): GameState {
  return { money: 0, items: {}, flags: new Set(), openedChests: new Set() };
}

/** 開寶箱：回傳獲得內容的描述；已開過則回傳 null 且不重複給獎勵。 */
export function openChest(state: GameState, chestId: string, reward: Reward): string | null {
  if (state.openedChests.has(chestId)) return null;
  state.openedChests.add(chestId);
  const parts: string[] = [];
  if (reward.item) {
    const n = reward.count ?? 1;
    state.items[reward.item] = (state.items[reward.item] ?? 0) + n;
    parts.push(`${reward.item} ×${n}`);
  }
  if (reward.money) {
    state.money += reward.money;
    parts.push(`${reward.money} 文`);
  }
  return parts.length ? `獲得 ${parts.join('、')}` : '寶箱是空的';
}

/** 目前的主線目標（顯示在畫面上方）。 */
export function currentObjective(flags: ReadonlySet<string>): string {
  if (!flags.has('talked_priest')) return '到北邊的神社找宮司爺爺';
  if (!flags.has('found_well')) return '調查東邊竹林深處的古井';
  if (!flags.has('prologue_done')) return '回神社向宮司爺爺報告';
  return '序章完成！古井地城將在下一版開放';
}

/** 全域唯一的進度（重新開始遊戲時呼叫 resetGameState）。 */
export let gameState = newGameState();
export function resetGameState(): void { gameState = newGameState(); }
