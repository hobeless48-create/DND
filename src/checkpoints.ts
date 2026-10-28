import type { CampaignState } from './game/types';
export interface CheckpointHeader { id: string; campaignId: string; title: string; kind: string; createdAt: number; depth: number; themeId: string; }
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  return database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('waypoint-story-checkpoints', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('snapshots', { keyPath: 'id' });
      db.createObjectStore('headers', { keyPath: 'id' }).createIndex('campaignId', 'campaignId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error('Scene storage is unavailable in this browser.')); };
    request.onblocked = () => reject(new Error('Close other Waypoint tabs to update scene storage.'));
  });
}
export async function saveCheckpoint(state: CampaignState, title: string, kind = 'Player highlight', id: string = crypto.randomUUID()): Promise<CheckpointHeader> {
  // Clone before awaiting storage: subsequent turns cannot change this snapshot.
  const snapshot = structuredClone(state);
  const header: CheckpointHeader = { id, campaignId: state.campaignId, title: title.slice(0, 100), kind, createdAt: Date.now(), depth: state.scene.depth, themeId: state.themeId || 'fantasy' };
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['headers', 'snapshots'], 'readwrite'), headers = tx.objectStore('headers');
    let result = header;
    const existing = headers.get(id);
    existing.onsuccess = () => {
      if (existing.result) { result = existing.result; return; }
      headers.put(header); tx.objectStore('snapshots').put({ id, state: snapshot });
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(new Error('Scene could not be saved. Browser storage may be full.'));
  });
}
export async function listCheckpoints(campaignId?: string): Promise<CheckpointHeader[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const store = db.transaction('headers').objectStore('headers');
    const request = campaignId ? store.index('campaignId').getAll(campaignId) : store.getAll();
    request.onsuccess = () => resolve((request.result as CheckpointHeader[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(new Error('Saved scenes could not be read.'));
  });
}
export async function readCheckpoint(id: string): Promise<CampaignState> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('snapshots').objectStore('snapshots').get(id);
    request.onsuccess = () => request.result?.state ? resolve(request.result.state) : reject(new Error('That saved scene is unavailable.'));
    request.onerror = () => reject(new Error('Saved scene could not be read.'));
  });
}
