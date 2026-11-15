// 雲端存檔：在 Claude 裡開啟時，把存檔同步到玩家自己的私人資料（只有本人讀得到）。
// 瀏覽器的本機存檔可能被清掉，所以啟動時以「比較新的那份」為準。
interface DocSnap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<DocSnap>;
  set(d: Record<string, unknown>): Promise<void>;
}
interface CloudSave {
  json: string;
  savedAt: number;
}

let ref: DocRef | null = null;
let pending: CloudSave | null = null;
let writing = false;
let timer: ReturnType<typeof setTimeout> | null = null;
export type CloudState = 'off' | 'syncing' | 'ok' | 'error';
let state: CloudState = 'off';
export const cloudState = () => state;

/** 啟動時呼叫：取得雲端存檔，比本機新就覆蓋本機；回傳要使用的存檔字串（沒有就 null） */
export async function initCloud(local: CloudSave | null, timeoutMs = 8000): Promise<CloudSave | null> {
  const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  if (!c?.use) return null;
  state = 'syncing';
  const work = (async (): Promise<CloudSave | null> => {
    const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [
      { collection(p: string): { doc(id: string): DocRef } } | null,
      { id(): Promise<string | null> } | null,
    ];
    if (!db || !user) return null;
    const id = await user.id();
    if (!id) return null;
    const r = db.collection(`data/users/${id}`).doc('save');
    const snap = await r.get();
    ref = r;
    state = 'ok';
    const d = snap.exists ? (snap.data() as Partial<CloudSave> | undefined) : undefined;
    const cloud = d && typeof d.json === 'string' ? { json: d.json, savedAt: Number(d.savedAt) || 0 } : null;
    if (cloud && (!local || cloud.savedAt > local.savedAt)) return cloud;
    if (local && (!cloud || local.savedAt > cloud.savedAt)) pushCloud(local, 0);
    return null;
  })().catch(() => {
    state = 'error';
    return null;
  });
  const timeout = new Promise<null>((res) => setTimeout(() => res(null), timeoutMs));
  const out = await Promise.race([work, timeout]);
  if (!ref && state === 'syncing') state = 'off';
  return out;
}

/** 存檔時呼叫：合併短時間內的多次存檔，一次只寫一筆 */
export function pushCloud(save: CloudSave, delay = 1500) {
  pending = save;
  if (!ref) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, delay);
}

async function flush() {
  timer = null;
  if (!ref || writing || !pending) return;
  const s = pending;
  pending = null;
  writing = true;
  try {
    await ref.set({ json: s.json, savedAt: s.savedAt });
    state = 'ok';
  } catch {
    state = 'error';
    if (!pending) pending = s;
  } finally {
    writing = false;
  }
  if (pending) timer = setTimeout(flush, 3000);
}

// 切到背景或關閉時立刻寫入
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pending) flush();
  });
