import type { AppSnapshot, MediaAsset } from '../data/types';

/**
 * Media bytes live in IndexedDB keyed by MediaAsset.id. The snapshot in
 * localStorage only keeps metadata and an `idb:<id>` reference as its url.
 */
export const STORED_MEDIA_PREFIX = 'idb:';
const DB_NAME = 'family-stories-media';
const STORE_NAME = 'blobs';

export interface MediaBlobStore {
  put(id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | undefined>;
  delete(id: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function storedMediaUrl(id: string): string {
  return STORED_MEDIA_PREFIX + id;
}

export function isStoredMedia(asset: Pick<MediaAsset, 'url'>): boolean {
  return asset.url.startsWith(STORED_MEDIA_PREFIX);
}

/** Codec parameters (`audio/webm;codecs=opus`) are dropped; allowlists compare the base type. */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

const DATA_URL = /^data:([^;,]+)((?:;[^;,]+)*);base64,([a-z\d+/]*={0,2})$/i;

export function dataUrlToBlob(url: string): Blob | null {
  const match = DATA_URL.exec(url);
  if (!match) return null;
  try {
    const binary = atob(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: baseMimeType(match[1]) });
  } catch {
    return null;
  }
}

export async function blobToDataUrl(blob: Blob, mimeType = blob.type): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunk to stay below argument-count limits of String.fromCharCode.
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${baseMimeType(mimeType) || 'application/octet-stream'};base64,${btoa(binary)}`;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('IndexedDB request failed')));
  });
}

export function createIndexedDbMediaStore(factory: IDBFactory = indexedDB): MediaBlobStore {
  let opening: Promise<IDBDatabase> | undefined;
  const open = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const openRequest = factory.open(DB_NAME, 1);
      openRequest.addEventListener('upgradeneeded', () => {
        if (!openRequest.result.objectStoreNames.contains(STORE_NAME)) openRequest.result.createObjectStore(STORE_NAME);
      });
      openRequest.addEventListener('success', () => resolve(openRequest.result));
      openRequest.addEventListener('error', () => {
        opening = undefined;
        reject(openRequest.error ?? new Error('IndexedDB is unavailable'));
      });
    });
    return opening;
  };
  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    const transaction = db.transaction(STORE_NAME, mode);
    const result = request(action(transaction.objectStore(STORE_NAME)));
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed')));
      transaction.addEventListener('abort', () => reject(transaction.error ?? new DOMException('Aborted', 'AbortError')));
    });
    return result;
  };
  return {
    put: async (id, blob) => { await run('readwrite', (store) => store.put(blob, id)); },
    get: async (id) => {
      const value = await run('readonly', (store) => store.get(id));
      return value instanceof Blob ? value : undefined;
    },
    delete: async (id) => { await run('readwrite', (store) => store.delete(id)); },
    keys: async () => (await run('readonly', (store) => store.getAllKeys())).map(String)
  };
}

export function createMemoryMediaStore(initial: Record<string, Blob> = {}): MediaBlobStore & { blobs: Map<string, Blob> } {
  const blobs = new Map(Object.entries(initial));
  return {
    blobs,
    put: async (id, blob) => { blobs.set(id, blob); },
    get: async (id) => blobs.get(id),
    delete: async (id) => { blobs.delete(id); },
    keys: async () => [...blobs.keys()]
  };
}

const storedListeners = new Set<(id: string) => void>();

/** Tell open screens that bytes for an asset are now on the device (for example, downloaded from the family storage). */
export function notifyMediaStored(id: string): void {
  storedListeners.forEach((listener) => listener(id));
}

export function onMediaStored(listener: (id: string) => void): () => void {
  storedListeners.add(listener);
  return () => { storedListeners.delete(listener); };
}

let defaultStore: MediaBlobStore | undefined;
export function mediaStore(): MediaBlobStore {
  defaultStore ??= typeof indexedDB === 'undefined' ? createMemoryMediaStore() : createIndexedDbMediaStore();
  return defaultStore;
}

let persistRequested = false;
/** Ask once for persistent storage so the browser does not evict recordings under pressure. */
export function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // Unsupported browsers keep best-effort storage.
  }
}

export function mediaStoreErrorMessage(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  return name === 'QuotaExceededError'
    ? 'На устройстве недостаточно места для этого материала. Освободите место или выберите файл поменьше.'
    : 'Браузер не разрешил сохранить материал на устройстве. Проверьте доступ к хранилищу и попробуйте ещё раз.';
}

export interface MediaMigrationResult {
  /** Asset id → new url for every inline asset that is now in the blob store. */
  migrated: Map<string, string>;
  failed: string[];
}

/** Move inline data: URLs into the blob store. The snapshot itself is not touched. */
export async function moveInlineMediaToStore(assets: readonly MediaAsset[], store: MediaBlobStore): Promise<MediaMigrationResult> {
  const migrated = new Map<string, string>();
  const failed: string[] = [];
  for (const asset of assets) {
    if (!asset.url.startsWith('data:')) continue;
    const blob = dataUrlToBlob(asset.url);
    if (!blob) { failed.push(asset.id); continue; }
    try {
      await store.put(asset.id, blob);
      migrated.set(asset.id, storedMediaUrl(asset.id));
    } catch {
      failed.push(asset.id);
    }
  }
  return { migrated, failed };
}

/** Apply a migration only to assets whose url is unchanged since the migration read them. */
export function applyMediaMigration(snapshot: AppSnapshot, original: readonly MediaAsset[], migrated: Map<string, string>): AppSnapshot {
  if (migrated.size === 0) return snapshot;
  const originalUrls = new Map(original.map((asset) => [asset.id, asset.url]));
  let changed = false;
  const mediaAssets = snapshot.mediaAssets.map((asset) => {
    const url = migrated.get(asset.id);
    if (!url || originalUrls.get(asset.id) !== asset.url) return asset;
    changed = true;
    const base64 = asset.url.slice(asset.url.indexOf(',') + 1);
    const blobBytes = Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    return { ...asset, url, mimeType: baseMimeType(asset.mimeType), sizeBytes: asset.sizeBytes ?? blobBytes };
  });
  return changed ? { ...snapshot, mediaAssets } : snapshot;
}

export async function migrateSnapshotMedia(snapshot: AppSnapshot, store: MediaBlobStore): Promise<{ snapshot: AppSnapshot; failed: string[] }> {
  const { migrated, failed } = await moveInlineMediaToStore(snapshot.mediaAssets, store);
  return { snapshot: applyMediaMigration(snapshot, snapshot.mediaAssets, migrated), failed };
}

/**
 * Replace `idb:` references with base64 data URLs for portable exports.
 * Missing blobs keep their reference so the importer or book can report them.
 */
export async function inlineStoredMedia<T extends MediaAsset>(assets: readonly T[], store: MediaBlobStore): Promise<{ assets: T[]; missing: string[] }> {
  const missing: string[] = [];
  const result = await Promise.all(assets.map(async (asset) => {
    if (!isStoredMedia(asset)) return asset;
    const blob = await store.get(asset.id).catch(() => undefined);
    if (!blob) { missing.push(asset.id); return asset; }
    return { ...asset, url: await blobToDataUrl(blob, asset.mimeType) };
  }));
  return { assets: result, missing };
}

/** Delete blobs that no snapshot asset references any more. */
export async function pruneMediaStore(snapshot: AppSnapshot, store: MediaBlobStore): Promise<void> {
  const referenced = new Set(snapshot.mediaAssets.filter(isStoredMedia).map((asset) => asset.id));
  const keys = await store.keys();
  await Promise.all(keys.filter((key) => !referenced.has(key)).map((key) => store.delete(key)));
}
