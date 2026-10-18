import type { MediaAsset } from '../data/types';
import { mediaStore, type MediaBlobStore } from './mediaStore';

/*
 * Files of shared books that are not kept on this device open from the cloud.
 * Photos come whole — their light preview when there is one — and stay in a
 * small cache for a while, so looking again costs no traffic. Voices and
 * videos stream piece by piece through the service worker and start at once.
 */

export interface CloudMediaSource {
  /** Whether the file is in the family storage. */
  has(assetId: string): boolean;
  /** `original` tells whether the bytes are the original (not a photo preview). */
  fetch(assetId: string, variant: 'view' | 'full'): Promise<{ blob: Blob; original: boolean }>;
}

let source: CloudMediaSource | null = null;
const changeListeners = new Set<() => void>();
const filesListeners = new Set<() => void>();

export function setCloudMediaSource(next: CloudMediaSource | null): void {
  source = next;
  notifyCloudMedia();
}

/** The storage or its file list changed: screens that found nothing may look again. */
export function notifyCloudMedia(): void {
  changeListeners.forEach((listener) => listener());
}

export function onCloudMediaChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}

/** Files of a book arrived on or left this device (downloads, freeing space). */
export function notifyFilesChanged(): void {
  filesListeners.forEach((listener) => listener());
}

export function onFilesChanged(listener: () => void): () => void {
  filesListeners.add(listener);
  return () => { filesListeners.delete(listener); };
}

export const inCloud = (assetId: string): boolean => Boolean(source?.has(assetId));

const CACHE_NAME = 'family-stories-media-v1';
const INDEX_KEY = 'family-stories:media-cache:v1';
export const CACHE_LIMIT_BYTES = 300 * 1024 * 1024;

interface CacheEntry {
  key: string;
  size: number;
  usedAt: number;
}

function readIndex(): CacheEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is CacheEntry =>
      typeof item?.key === 'string' && typeof item.size === 'number' && typeof item.usedAt === 'number') : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: CacheEntry[]): void {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(entries)); } catch { /* the cache still works, only its limit is approximate */ }
}

/** Only a key: nothing is ever fetched from this address. */
const cacheUrl = (key: string) => new URL(`${import.meta.env.BASE_URL}cloud-media-cache/${encodeURIComponent(key)}`, window.location.origin).href;

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function fromCache(key: string): Promise<Blob | undefined> {
  const cache = await openCache();
  const response = cache ? await cache.match(cacheUrl(key)).catch(() => undefined) : undefined;
  if (!response) return undefined;
  writeIndex(readIndex().map((entry) => (entry.key === key ? { ...entry, usedAt: Date.now() } : entry)));
  return response.blob();
}

async function toCache(key: string, blob: Blob): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  try {
    await cache.put(cacheUrl(key), new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } }));
    const entries = [...readIndex().filter((entry) => entry.key !== key), { key, size: blob.size, usedAt: Date.now() }]
      .sort((a, b) => a.usedAt - b.usedAt);
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    // The longest unseen go first, until the cache fits its limit.
    while (total > CACHE_LIMIT_BYTES && entries.length > 1) {
      const old = entries.shift()!;
      total -= old.size;
      await cache.delete(cacheUrl(old.key)).catch(() => false);
    }
    writeIndex(entries);
  } catch {
    // No room: the file is shown without being kept.
  }
}

async function dropFromCache(key: string): Promise<void> {
  const cache = await openCache();
  await cache?.delete(cacheUrl(key)).catch(() => false);
  writeIndex(readIndex().filter((entry) => entry.key !== key));
}

/** A photo, voice or video to look at, from the cache or the cloud; undefined when the storage has no such file. */
export async function viewBlob(assetId: string): Promise<Blob | undefined> {
  if (!source?.has(assetId)) return undefined;
  const cached = (await fromCache(`${assetId}|view`)) ?? (await fromCache(`${assetId}|full`));
  if (cached) return cached;
  const { blob, original } = await source.fetch(assetId, 'view');
  void toCache(`${assetId}|${original ? 'full' : 'view'}`, blob);
  return blob;
}

/** The original of a file for a film or an export: from this device, the cache or the cloud. */
export async function originalBlob(assetId: string): Promise<Blob | undefined> {
  const local = await mediaStore().get(assetId).catch(() => undefined);
  if (local) return local;
  if (!source?.has(assetId)) return undefined;
  const cached = await fromCache(`${assetId}|full`);
  if (cached) return cached;
  const { blob } = await source.fetch(assetId, 'full');
  void toCache(`${assetId}|full`, blob);
  return blob;
}

/** For a download to the device: an original that was already looked at moves out of the cache. */
export async function takeCachedOriginal(assetId: string): Promise<Blob | undefined> {
  const blob = await fromCache(`${assetId}|full`);
  if (blob) await dropFromCache(`${assetId}|full`);
  return blob;
}

/** A store that falls back to the cloud for originals that are not on this device. */
export function withCloudOriginals(store: MediaBlobStore): MediaBlobStore {
  return { ...store, get: async (id) => (await store.get(id).catch(() => undefined)) ?? originalBlob(id).catch(() => undefined) };
}

/** Another person signs in here, or the device leaves the storage: what they looked at goes. */
export async function clearCloudMediaCache(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME);
  } catch {
    // Nothing to clear.
  }
  writeIndex([]);
}

export function cachedBytes(): number {
  return readIndex().reduce((sum, entry) => sum + entry.size, 0);
}

// Files whose stream failed in this browser (an old Safari, say): they come whole instead.
const streamFailed = new Set<string>();

/** Voices and videos stream through the service worker when it runs this page; null otherwise. */
export function streamUrl(asset: Pick<MediaAsset, 'id' | 'type'>): string | null {
  if (asset.type !== 'audio' && asset.type !== 'video') return null;
  if (streamFailed.has(asset.id) || typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return null;
  if (!source?.has(asset.id)) return null;
  return `${import.meta.env.BASE_URL}cloud-media/${encodeURIComponent(asset.id)}`;
}

export function markStreamFailed(assetId: string): void {
  streamFailed.add(assetId);
}
