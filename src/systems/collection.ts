// 收集度（PRD 6.4）：每個區域的寶箱與隱藏地點。純函式。
interface TObj { name: string; type: string }
interface TMap { properties?: { name: string; value: unknown }[]; layers: { name: string; objects?: TObj[] }[] }

export interface AreaCollection { key: string; name: string; chests: [number, number]; secrets: [number, number] }

/** 隱藏地點的旗標名稱 */
export const secretFlag = (id: string) => `secret:${id}`;

export function areaCollectibles(map: object): { chests: string[]; secrets: string[] } {
  const m = map as TMap;
  const objs = m.layers.find((l) => l.name === 'objects')?.objects ?? [];
  return {
    chests: objs.filter((o) => o.type === 'chest').map((o) => o.name),
    secrets: objs.filter((o) => o.type === 'cracked' || o.type === 'secret').map((o) => o.name),
  };
}

export function collectionReport(maps: Record<string, object>, opened: ReadonlySet<string>, flags: ReadonlySet<string>) {
  const areas: AreaCollection[] = [];
  let got = 0, total = 0;
  for (const [key, map] of Object.entries(maps)) {
    const c = areaCollectibles(map);
    if (!c.chests.length && !c.secrets.length) continue;
    const ch = c.chests.filter((id) => opened.has(id)).length;
    const se = c.secrets.filter((id) => flags.has(secretFlag(id))).length;
    const name = String((map as TMap).properties?.find((p) => p.name === 'displayName')?.value ?? key);
    areas.push({ key, name, chests: [ch, c.chests.length], secrets: [se, c.secrets.length] });
    got += ch + se; total += c.chests.length + c.secrets.length;
  }
  return { areas, percent: total ? Math.floor((got / total) * 100) : 100 };
}
