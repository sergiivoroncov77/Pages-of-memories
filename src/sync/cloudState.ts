import type { CloudFile } from './bookEntities';

/*
 * What this device knows about the family storage: its connection key and,
 * per shared book, how far it has synced. Kept apart from the book snapshot so
 * a backup or a fresh start never carries the device key along.
 */

export interface CloudConnection {
  /** The Apps Script web-app address (…/exec). */
  url: string;
  memberId: string;
  token: string;
  name: string;
  /** The Google account owner who installed the script. */
  admin: boolean;
  connectedAt: string;
  /** This device among the person's devices, as the storage names it. */
  deviceId?: string;
  /** The storage script's release, once the storage told it; 0 for a script older than releases. */
  scriptRelease?: number;
  /** The script's Apps Script project, told to the storage owner only: the app updates it there. */
  scriptId?: string;
}

export interface CloudBookState {
  rev: number;
  /** Fingerprint of every record as last exchanged with the storage. */
  fingerprints: Record<string, string>;
  files: Record<string, CloudFile>;
  people: string[];
  /** Who added each record (member id), as the storage reports it. */
  owners: Record<string, string>;
  /** Removed from this phone only: the membership stays, and the book can be brought back. */
  detached?: boolean;
  /**
   * Photos, voice and video of the book are kept on this device (downloaded
   * by the person, or recorded here). Otherwise they open from the cloud.
   */
  keepFiles: boolean;
  /** Left on this phone while offline: the storage hears about it on the next sync. */
  leaving?: boolean;
  /** Who this device is in the book, from the invitation. */
  personId?: string;
  creatorId?: string;
  creatorName?: string;
  canManage?: boolean;
  title?: string;
  lastSyncAt?: string;
}

export interface CloudState {
  version: 1;
  connection?: CloudConnection;
  books: Record<string, CloudBookState>;
}

export const CLOUD_STATE_KEY = 'family-stories:cloud:v1';

export const emptyCloudState = (): CloudState => ({ version: 1, books: {} });

/** A book that comes to this device from the storage: its files open from the cloud until downloaded. */
export function freshBookState(extra: Partial<CloudBookState> = {}): CloudBookState {
  return { rev: 0, fingerprints: {}, files: {}, people: [], owners: {}, keepFiles: false, ...extra };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function parseBook(value: unknown): CloudBookState | null {
  if (!isRecord(value) || typeof value.rev !== 'number' || !isRecord(value.fingerprints) || !isRecord(value.files)) return null;
  const files: Record<string, CloudFile> = {};
  Object.entries(value.files).forEach(([id, file]) => {
    if (!isRecord(file) || typeof file.fileId !== 'string') return;
    files[id] = { fileId: file.fileId, size: typeof file.size === 'number' ? file.size : undefined };
    if (typeof file.previewId === 'string') {
      files[id].previewId = file.previewId;
      if (typeof file.previewSize === 'number') files[id].previewSize = file.previewSize;
    }
  });
  const strings = (record: unknown) => Object.fromEntries(Object.entries(isRecord(record) ? record : {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const text = (field: unknown) => (typeof field === 'string' ? field : undefined);
  return {
    rev: Math.max(0, Math.floor(value.rev)),
    fingerprints: strings(value.fingerprints),
    files,
    people: Array.isArray(value.people) ? value.people.filter((id): id is string => typeof id === 'string') : [],
    owners: strings(value.owners),
    detached: value.detached === true ? true : undefined,
    // Books from before cloud viewing downloaded everything: they go on doing so.
    keepFiles: value.keepFiles !== false,
    leaving: value.leaving === true ? true : undefined,
    personId: text(value.personId),
    creatorId: text(value.creatorId),
    creatorName: text(value.creatorName),
    canManage: typeof value.canManage === 'boolean' ? value.canManage : undefined,
    title: text(value.title),
    lastSyncAt: text(value.lastSyncAt)
  };
}

export function parseCloudState(raw: string | null): CloudState {
  if (!raw) return emptyCloudState();
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1) return emptyCloudState();
    const state = emptyCloudState();
    const connection = value.connection;
    if (isRecord(connection) && ['url', 'memberId', 'token', 'name', 'connectedAt'].every((field) => typeof connection[field] === 'string')) {
      state.connection = { url: connection.url as string, memberId: connection.memberId as string, token: connection.token as string,
        name: connection.name as string, admin: connection.admin === true, connectedAt: connection.connectedAt as string,
        deviceId: typeof connection.deviceId === 'string' ? connection.deviceId : undefined,
        scriptRelease: typeof connection.scriptRelease === 'number' ? connection.scriptRelease : undefined,
        scriptId: typeof connection.scriptId === 'string' ? connection.scriptId : undefined };
    }
    if (isRecord(value.books)) {
      Object.entries(value.books).forEach(([id, book]) => {
        const parsed = parseBook(book);
        if (parsed) state.books[id] = parsed;
      });
    }
    return state;
  } catch {
    return emptyCloudState();
  }
}

export interface CloudStateStore {
  get(): CloudState;
  update(change: (current: CloudState) => CloudState): CloudState;
  subscribe(listener: () => void): () => void;
}

export function createCloudStateStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): CloudStateStore {
  let state = emptyCloudState();
  try { state = parseCloudState(storage?.getItem(CLOUD_STATE_KEY) ?? null); } catch { /* storage blocked: memory only */ }
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    update(change) {
      state = change(state);
      try { storage?.setItem(CLOUD_STATE_KEY, JSON.stringify(state)); } catch { /* keep in memory; next write retries */ }
      listeners.forEach((listener) => listener());
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}
