// 對話資料的選擇邏輯（純函式）。
export type Line = [speaker: string, text: string];

export interface DialogueVariant {
  /** 這些旗標全部成立才使用 */
  if?: string[];
  /** 這些旗標全部不成立才使用 */
  ifNot?: string[];
  /** 對話結束後設定的旗標 */
  set?: string[];
  lines: Line[];
}

/** 依目前旗標挑出第一個符合條件的對話；都不符合時回傳 undefined。 */
export function pickVariant(variants: DialogueVariant[] | undefined, flags: ReadonlySet<string>): DialogueVariant | undefined {
  return variants?.find((v) => (v.if ?? []).every((f) => flags.has(f)) && (v.ifNot ?? []).every((f) => !flags.has(f)));
}
