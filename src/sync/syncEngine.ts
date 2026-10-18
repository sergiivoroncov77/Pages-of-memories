import type { AppSnapshot, MediaAsset, Person } from '../data/types';
import { dataUrlToBlob, isStoredMedia, type MediaBlobStore } from '../lib/mediaStore';
import {
  applyRemoteEntities,
  collectBookEntities,
  diffEntities,
  entityHash,
  entityKey,
  hasLocalBytes,
  mediaIdsOfBook,
  type CloudChange,
  type CloudFile,
  type EntityMap,
  type RemoteEntity
} from './bookEntities';
import {
  callFamilyServer,
  CloudError,
  driveApiBase,
  isExpiredAccess,
  type FetchLike,
  type MediaAccess,
  type MediaTransfer
} from './cloudApi';
import { freshBookState, type CloudBookState, type CloudConnection, type CloudStateStore } from './cloudState';

export interface SyncEnvironment {
  store: CloudStateStore;
  media: MediaTransfer;
  blobs: MediaBlobStore;
  getSnapshot(): AppSnapshot;
  /** Apply a change to the book on this device; false when it could not be saved. */
  commit(update: (current: AppSnapshot) => AppSnapshot): boolean;
  /** A blob arrived for a media asset (so open screens can show it). */
  onMediaStored?(assetId: string): void;
  /** A smaller copy of a photo for viewing from the cloud; null when there is nothing to gain. */
  makePreview?(photo: Blob): Promise<Blob | null>;
  /** The original of a file already fetched for viewing, so a download does not fetch it again. */
  cachedFile?(assetId: string): Promise<Blob | undefined>;
  fetch?: FetchLike;
  now?(): Date;
}

export interface RemoteBook {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  member: boolean;
  personId: string | null;
  canManage: boolean;
  memberCount: number;
}

export interface CloudMember {
  id: string;
  name: string;
  personId: string | null;
  joinedAt: string;
  isCreator: boolean;
  isYou: boolean;
}

/** One of the person's devices; all of them are equal. */
export interface CloudDevice {
  id: string;
  name: string;
  createdAt: string | null;
  lastSeenAt: string | null;
  current: boolean;
}

export interface DeviceLinkPreview {
  memberId: string;
  /** The profile name: who signs in with the link. */
  name: string;
  expiresAt: string;
}

export interface InvitePreview {
  bookId: string;
  bookTitle: string;
  inviterName: string;
  personName: string;
  personId: string | null;
}

export interface DownloadProgress {
  done: number;
  total: number;
  failed: number;
}

/** What the service worker needs to stream a voice or a video from the storage. */
export interface StreamAccess {
  url: string;
  accessToken: string;
  expiresAt: number;
  size: number | null;
  mimeType: string;
}

export interface BookSyncOutcome {
  bookId: string;
  status: 'synced' | 'unlinked';
  pushed: number;
  pulled: number;
  uploaded: number;
  downloaded: number;
  /** Files that could not be uploaded or downloaded this time. */
  mediaPending: number;
  /** Deletions the storage refused (someone else's records); they came back. */
  denied: number;
  reason?: string;
}

interface SyncReply {
  rev: number;
  entities: RemoteEntity[];
  title?: string;
  denied?: string[];
}

const UNLINK_CODES = new Set(['not_member', 'book_not_found']);

const extensionFor = (mimeType: string) => {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  const known: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
    'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/ogg': 'ogv' };
  return known[type] ?? 'bin';
};

/**
 * The sync engine. Every operation runs one after another, so a periodic sync
 * never races a button press.
 */
export function createSyncEngine(env: SyncEnvironment) {
  const accessCache = new Map<string, MediaAccess>();
  let queue: Promise<unknown> = Promise.resolve();
  // Bumped when a book's sync position is reset; a reply that was already on its way is then dropped.
  let generation = 0;
  const now = () => (env.now ? env.now() : new Date());

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  function connection(): CloudConnection {
    const current = env.store.get().connection;
    if (!current) throw new CloudError('unauthorized', 'Семейное хранилище не подключено. Подключите его в настройках.');
    return current;
  }

  async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const current = connection();
    try {
      return await callFamilyServer<T>(current.url, { action, token: current.token, ...payload }, env.fetch);
    } catch (error) {
      // The storage no longer knows this device: keep the books, drop the key.
      if (error instanceof CloudError && error.code === 'unauthorized') {
        env.store.update((state) => (state.connection?.token === current.token ? { ...state, connection: undefined } : state));
      }
      throw error;
    }
  }

  function bookState(bookId: string): CloudBookState | undefined {
    return env.store.get().books[bookId];
  }

  function updateBook(bookId: string, change: (book: CloudBookState) => CloudBookState) {
    env.store.update((state) => {
      const book = state.books[bookId];
      return book ? { ...state, books: { ...state.books, [bookId]: change(book) } } : state;
    });
  }

  /** The person this phone signs as in the book; they travel with it even before their first story. */
  const withPerson = (book: CloudBookState, personId: string): CloudBookState =>
    ({ ...book, personId, people: book.people.includes(personId) ? book.people : [...book.people, personId] });

  /** A narrator of this phone's own, once the storage took it: it goes into the archive before the first sync. */
  function addSelf(self: Person) {
    const saved = env.commit((snapshot) => (snapshot.people.some((person) => person.id === self.id) ? snapshot
      : { ...snapshot, people: [...snapshot.people, { ...self, projectId: snapshot.project.id }] }));
    if (!saved) throw new CloudError('local_write', 'Не удалось сохранить книгу на этом устройстве: не хватает места.');
  }

  /** Start the book over from the storage: take everything, send nothing that looks like a deletion. */
  const restart = (book: CloudBookState): CloudBookState => ({ ...book, rev: 0, fingerprints: {}, owners: {} });

  function unlink(bookId: string) {
    accessCache.delete(bookId);
    env.store.update((state) => {
      const books = { ...state.books };
      delete books[bookId];
      return { ...state, books };
    });
  }

  /** The book's state when it comes back to this phone (an invitation, the owner joining). */
  function returning(book: CloudBookState | undefined): CloudBookState {
    if (!book) return freshBookState();
    if (!book.detached) return book;
    generation += 1;
    return { ...restart(book), detached: undefined, leaving: undefined };
  }

  /** Leave a book; without a network the book is gone from this phone at once and the storage hears later. */
  async function leave(bookId: string): Promise<{ pending: boolean }> {
    try {
      await call('leaveBook', { bookId });
    } catch (error) {
      if (!(error instanceof CloudError)) throw error;
      if (error.code === 'offline') {
        generation += 1;
        accessCache.delete(bookId);
        updateBook(bookId, (book) => ({ ...restart(book), detached: true, leaving: true }));
        return { pending: true };
      }
      // Already out of the book, or the storage no longer knows this phone.
      if (!UNLINK_CODES.has(error.code) && error.code !== 'unauthorized') throw error;
    }
    unlink(bookId);
    return { pending: false };
  }

  function detach(bookId: string) {
    generation += 1;
    accessCache.delete(bookId);
    updateBook(bookId, (book) => ({ ...restart(book), detached: true }));
  }

  async function mediaAccess(bookId: string, refresh = false): Promise<MediaAccess> {
    const cached = accessCache.get(bookId);
    if (!refresh && cached && cached.expiresAt > now().getTime() + 30_000) return cached;
    const reply = await call<{ accessToken: string; folderId: string; expiresInSeconds?: number }>('mediaAccess', { bookId });
    const access: MediaAccess = {
      accessToken: reply.accessToken,
      folderId: reply.folderId,
      api: driveApiBase(connection().url),
      expiresAt: now().getTime() + Math.max(60, Number(reply.expiresInSeconds) || 600) * 1000
    };
    accessCache.set(bookId, access);
    return access;
  }

  async function withAccess<T>(bookId: string, action: (access: MediaAccess) => Promise<T>): Promise<T> {
    try {
      return await action(await mediaAccess(bookId));
    } catch (error) {
      if (!isExpiredAccess(error)) throw error;
      return action(await mediaAccess(bookId, true));
    }
  }

  const scopeOf = (book: CloudBookState) => ({ files: book.files, people: book.people });

  /** Send local changes, take everyone else's, and remember what was exchanged. */
  async function exchange(bookId: string, changes: CloudChange[], local: EntityMap): Promise<{ pulled: number; denied: number }> {
    const before = bookState(bookId);
    if (!before) return { pulled: 0, denied: 0 };
    const sent = generation;
    const reply = await call<SyncReply>('sync', { bookId, sinceRev: before.rev, changes });
    const afterReply = bookState(bookId);
    if (!afterReply || sent !== generation || afterReply.detached) return { pulled: 0, denied: 0 };
    // Records edited on this phone while the request was out win over what came back.
    const current = collectBookEntities(env.getSnapshot(), bookId, scopeOf(afterReply));
    const hashOf = (map: EntityMap, key: string) => (map.has(key) ? entityHash(map.get(key)!) : null);
    const changedMeanwhile = (key: string) => hashOf(local, key) !== hashOf(current, key);
    const incoming = reply.entities.filter((entity) => !changedMeanwhile(entity.key));
    let applied: ReturnType<typeof applyRemoteEntities> | undefined;
    const saved = incoming.length === 0 || env.commit((snapshot) => {
      applied = applyRemoteEntities(snapshot, bookId, incoming, now().toISOString());
      return applied.snapshot;
    });
    if (!saved) throw new CloudError('local_write', 'Не удалось сохранить книгу на этом устройстве: не хватает места.');

    const files: Record<string, CloudFile> = { ...afterReply.files };
    Object.entries(applied?.files ?? {}).forEach(([id, file]) => {
      if (file) files[id] = file;
      else delete files[id];
    });
    const people = [...new Set([...afterReply.people, ...(applied?.people ?? [])])];
    const owners = { ...afterReply.owners };
    reply.entities.forEach((entity) => {
      if (entity.deleted) delete owners[entity.key];
      else if (entity.owner) owners[entity.key] = entity.owner;
    });
    const after = collectBookEntities(env.getSnapshot(), bookId, { files, people });
    const fingerprints = { ...afterReply.fingerprints };
    const touched = new Set([...changes.map((change) => change.key), ...incoming.map((entity) => entity.key)]);
    touched.forEach((key) => {
      if (changedMeanwhile(key)) return;
      // The fingerprint follows this device's own form of the record, so
      // small local adjustments never echo back as edits.
      if (after.has(key)) fingerprints[key] = entityHash(after.get(key)!);
      else delete fingerprints[key];
    });
    updateBook(bookId, (book) => ({ ...book, rev: reply.rev, fingerprints, files, people, owners, title: reply.title ?? book.title, lastSyncAt: now().toISOString() }));
    applied?.removedMediaIds.forEach((assetId) => { void env.blobs.delete(assetId).catch(() => undefined); });
    return { pulled: incoming.length, denied: reply.denied?.length ?? 0 };
  }

  // Photos for which no smaller copy came out (already small, or a format the browser cannot draw).
  const noPreview = new Set<string>();

  /** A photo's smaller copy for viewing from the cloud, uploaded next to the original. */
  async function uploadPreview(bookId: string, asset: MediaAsset, blob: Blob): Promise<{ previewId: string; previewSize: number } | null> {
    if (asset.type !== 'photo' || !env.makePreview || noPreview.has(asset.id)) return null;
    const preview = await env.makePreview(blob).catch(() => null);
    if (!preview) { noPreview.add(asset.id); return null; }
    const previewId = await withAccess(bookId, (access) => env.media.upload(access, preview, {
      name: `preview-${asset.id}.jpg`, mimeType: preview.type || 'image/jpeg', assetId: asset.id, bookId
    }));
    return { previewId, previewSize: preview.size };
  }

  async function uploadMissing(bookId: string): Promise<{ uploaded: number; pending: number }> {
    const snapshot = env.getSnapshot();
    const ids = mediaIdsOfBook(snapshot, bookId);
    const me = env.store.get().connection?.memberId;
    let uploaded = 0;
    let pending = 0;
    for (const asset of snapshot.mediaAssets) {
      const book = bookState(bookId);
      if (!book || !ids.has(asset.id) || !hasLocalBytes(asset)) continue;
      const known = book.files[asset.id];
      // A photo without a preview (uploaded before previews, or the app closed in between)
      // gets one from the device of whoever added it.
      const owner = book.owners[entityKey('file', asset.id)];
      const backfill = Boolean(known && !known.previewId && asset.type === 'photo' && env.makePreview
        && !noPreview.has(asset.id) && (owner === undefined || owner === me));
      if (known && !backfill) continue;
      const blob = isStoredMedia(asset) ? await env.blobs.get(asset.id).catch(() => undefined) : dataUrlToBlob(asset.url) ?? undefined;
      if (!blob) continue;
      try {
        if (known) {
          const preview = await uploadPreview(bookId, asset, blob);
          if (preview) updateBook(bookId, (current) => ({ ...current, files: { ...current.files, [asset.id]: { ...known, ...preview } } }));
          continue;
        }
        const mimeType = asset.mimeType.split(';')[0] || blob.type;
        const fileId = await withAccess(bookId, (access) => env.media.upload(access, blob, {
          name: `${asset.type}-${asset.id}.${extensionFor(mimeType)}`, mimeType, assetId: asset.id, bookId
        }));
        // Remembered at once: an app closed before the preview never uploads the original twice.
        updateBook(bookId, (current) => ({ ...current, files: { ...current.files, [asset.id]: { fileId, size: blob.size } } }));
        uploaded += 1;
        // Without a preview the original is shown: a failed preview never holds the file back.
        const preview = await uploadPreview(bookId, asset, blob).catch(() => null);
        if (preview) updateBook(bookId, (current) => ({ ...current, files: { ...current.files, [asset.id]: { fileId, size: blob.size, ...preview } } }));
      } catch (error) {
        if (error instanceof CloudError && (UNLINK_CODES.has(error.code) || error.code === 'unauthorized')) throw error;
        pending += 1;
      }
    }
    return { uploaded, pending };
  }

  /** Where a file of a shared book lives in the storage. */
  function locate(assetId: string): { bookId: string; file: CloudFile } | undefined {
    for (const [bookId, book] of Object.entries(env.store.get().books)) {
      const file = book.detached ? undefined : book.files[assetId];
      if (file) return { bookId, file };
    }
    return undefined;
  }

  const inflight = new Map<string, Promise<Blob>>();

  /** A file's bytes from the storage, not kept: the photo's preview to look at, or the original. */
  function fetchFile(assetId: string, variant: 'view' | 'full'): Promise<Blob> {
    const found = locate(assetId);
    if (!found) return Promise.reject(new CloudError('media_failed', 'Этого файла нет в семейном хранилище.'));
    const previewId = variant === 'view' ? found.file.previewId : undefined;
    const key = `${assetId}|${previewId ? 'view' : 'full'}`;
    const running = inflight.get(key);
    if (running) return running;
    const asset = env.getSnapshot().mediaAssets.find((item) => item.id === assetId);
    const mimeType = previewId ? 'image/jpeg' : asset?.mimeType.split(';')[0] || 'application/octet-stream';
    const task = withAccess(found.bookId, (access) => env.media.download(access, previewId ?? found.file.fileId, mimeType))
      .finally(() => inflight.delete(key));
    inflight.set(key, task);
    return task;
  }

  /** Keep a file's original on this device. */
  async function storeFile(assetId: string) {
    const blob = (await env.cachedFile?.(assetId).catch(() => undefined)) ?? await fetchFile(assetId, 'full');
    await env.blobs.put(assetId, blob);
    env.onMediaStored?.(assetId);
  }

  /** Files of the book that are in the storage but not on this device. */
  async function missingFiles(bookId: string): Promise<string[]> {
    const snapshot = env.getSnapshot();
    const ids = mediaIdsOfBook(snapshot, bookId);
    const stored = new Set(await env.blobs.keys().catch(() => [] as string[]));
    const book = bookState(bookId);
    return snapshot.mediaAssets.filter((asset) => ids.has(asset.id) && isStoredMedia(asset) && !stored.has(asset.id) && book?.files[asset.id])
      .map((asset) => asset.id);
  }

  // Books being downloaded by the person right now: the sync leaves their files to that download.
  const downloading = new Map<string, AbortController>();

  async function downloadMissing(bookId: string): Promise<{ downloaded: number; pending: number }> {
    // Not kept here: files open from the cloud when someone looks at them.
    if (!bookState(bookId)?.keepFiles || downloading.has(bookId)) return { downloaded: 0, pending: 0 };
    let downloaded = 0;
    let pending = 0;
    for (const assetId of await missingFiles(bookId)) {
      try {
        await storeFile(assetId);
        downloaded += 1;
      } catch (error) {
        if (error instanceof CloudError && (UNLINK_CODES.has(error.code) || error.code === 'unauthorized')) throw error;
        pending += 1;
      }
    }
    return { downloaded, pending };
  }

  async function syncBookNow(bookId: string): Promise<BookSyncOutcome> {
    const outcome: BookSyncOutcome = { bookId, status: 'synced', pushed: 0, pulled: 0, uploaded: 0, downloaded: 0, mediaPending: 0, denied: 0 };
    try {
      let book = bookState(bookId);
      if (!book) throw new CloudError('not_member', 'Эта книга не в семейном хранилище.');
      if (book.detached) return outcome;
      if (!env.getSnapshot().books.some((item) => item.id === bookId) && book.rev > 0) {
        // The local copy vanished some other way: take the book again rather than lose it.
        generation += 1;
        updateBook(bookId, restart);
        book = bookState(bookId)!;
      }
      if (book.rev === 0) {
        // Joining: take what is already there before sending anything, so
        // files that are already on Drive are not uploaded twice.
        const local = collectBookEntities(env.getSnapshot(), bookId, scopeOf(book));
        outcome.pulled += (await exchange(bookId, [], local)).pulled;
      }
      const upload = await uploadMissing(bookId);
      outcome.uploaded = upload.uploaded;
      book = bookState(bookId);
      if (book) {
        const snapshot = env.getSnapshot();
        const local = collectBookEntities(snapshot, bookId, scopeOf(book));
        // Without the book on this phone, nothing is sent: an empty archive must never erase the shared one.
        const changes = snapshot.books.some((item) => item.id === bookId) ? diffEntities(local, book.fingerprints) : [];
        outcome.pushed = changes.length;
        const result = await exchange(bookId, changes, local);
        outcome.pulled += result.pulled;
        outcome.denied = result.denied;
      }
      const download = await downloadMissing(bookId);
      outcome.downloaded = download.downloaded;
      outcome.mediaPending = upload.pending + download.pending;
      return outcome;
    } catch (error) {
      if (error instanceof CloudError && UNLINK_CODES.has(error.code)) {
        unlink(bookId);
        return { ...outcome, status: 'unlinked', reason: error.message };
      }
      throw error;
    }
  }

  /** Whether a linked book has edits on this phone that the storage has not seen. */
  function hasLocalChanges(bookId: string): boolean {
    const book = bookState(bookId);
    const snapshot = env.getSnapshot();
    if (!book || book.detached || !snapshot.books.some((item) => item.id === bookId)) return false;
    if (mediaIdsOfBook(snapshot, bookId).size && snapshot.mediaAssets.some((asset) =>
      hasLocalBytes(asset) && !book.files[asset.id] && mediaIdsOfBook(snapshot, bookId).has(asset.id))) return true;
    return diffEntities(collectBookEntities(snapshot, bookId, scopeOf(book)), book.fingerprints).length > 0;
  }

  async function refreshBooks(): Promise<{ books: RemoteBook[]; unlinked: string[] }> {
    const reply = await call<{ member: { id: string; name: string; admin: boolean }; deviceId?: string; books: RemoteBook[] }>('me');
    env.store.update((state) => (state.connection
      ? { ...state, connection: { ...state.connection, name: reply.member.name, admin: reply.member.admin, deviceId: reply.deviceId ?? state.connection.deviceId } } : state));
    const available = new Map(reply.books.filter((book) => book.member).map((book) => [book.id, book]));
    const unlinked: string[] = [];
    Object.entries(env.store.get().books).forEach(([bookId, book]) => {
      if (available.has(bookId)) return;
      unlink(bookId);
      // A book already removed from this phone leaves quietly.
      if (!book.detached) unlinked.push(bookId);
    });
    env.store.update((state) => {
      const books = { ...state.books };
      available.forEach((remote) => {
        const current = books[remote.id] ?? freshBookState();
        books[remote.id] = { ...current, title: remote.title, creatorId: remote.creatorId, creatorName: remote.creatorName,
          canManage: remote.canManage, personId: current.personId ?? remote.personId ?? undefined };
      });
      return { ...state, books };
    });
    return { books: reply.books, unlinked };
  }

  return {
    hasLocalChanges,

    /** Make this device the first one of the owner of a freshly installed script. */
    connectOwner: (url: string, name: string, deviceName?: string) => serial(async () => {
      const info = await callFamilyServer<{ app?: string; claimed?: boolean }>(url, { action: 'info' }, env.fetch);
      if (info.app !== 'family-stories') throw new CloudError('not_script', 'По этому адресу работает другой скрипт.');
      const reply = await callFamilyServer<{ member: { id: string; name: string; admin: boolean }; token: string }>(url, { action: 'claim', name, deviceName }, env.fetch);
      env.store.update(() => ({ version: 1, books: {},
        connection: { url, memberId: reply.member.id, token: reply.token, name: reply.member.name, admin: reply.member.admin, connectedAt: now().toISOString() } }));
      return reply.member;
    }),

    /** Forget the storage on this phone. The books stay as local copies. */
    disconnect() {
      accessCache.clear();
      env.store.update(() => ({ version: 1, books: {} }));
    },

    syncBook: (bookId: string) => serial(() => syncBookNow(bookId)),

    /** New shared books appear, removed ones become local copies, everything else syncs. */
    syncAll: () => serial(async () => {
      if (!env.store.get().connection) return { outcomes: [] as BookSyncOutcome[], unlinked: [] as string[], failed: [] as { bookId: string; error: string }[] };
      // Books left while offline go first, so the storage stops counting this phone in.
      for (const [bookId, book] of Object.entries(env.store.get().books)) {
        if (book.leaving && (await leave(bookId)).pending) throw new CloudError('offline', 'Нет связи с семейным хранилищем.');
      }
      const { unlinked } = await refreshBooks();
      const outcomes: BookSyncOutcome[] = [];
      const failed: { bookId: string; error: string }[] = [];
      for (const [bookId, book] of Object.entries(env.store.get().books)) {
        if (book.detached) continue;
        try {
          outcomes.push(await syncBookNow(bookId));
        } catch (error) {
          if (error instanceof CloudError && (error.code === 'unauthorized' || error.code === 'offline')) throw error;
          failed.push({ bookId, error: error instanceof Error ? error.message : String(error) });
        }
      }
      return { outcomes, unlinked: [...unlinked, ...outcomes.filter((item) => item.status === 'unlinked').map((item) => item.bookId)], failed };
    }),

    /** Put a book from this phone into the family storage; `me` is who its creator signs as in it. */
    publishBook: (bookId: string, me?: { personId: string; name: string }) => serial(async () => {
      const book = env.getSnapshot().books.find((item) => item.id === bookId);
      if (!book) throw new CloudError('bad_request', 'Книга не найдена.');
      const reply = await call<{ book: RemoteBook }>('createBook', { bookId, title: book.title, personId: me?.personId, name: me?.name });
      const existing = env.store.get().books[bookId];
      // A copy of a book that was removed from this phone starts over from the storage.
      // Its files were made here, so they stay here.
      const state = existing ? { ...returning(existing), keepFiles: true }
        : freshBookState({ title: reply.book.title, creatorId: reply.book.creatorId, creatorName: reply.book.creatorName, canManage: reply.book.canManage, keepFiles: true });
      const personId = reply.book.personId ?? state.personId;
      env.store.update((current) => ({ ...current, books: { ...current.books, [bookId]: personId ? withPerson(state, personId) : state } }));
      return syncBookNow(bookId);
    }),

    previewInvite: (url: string, code: string) => callFamilyServer<InvitePreview>(url, { action: 'previewInvite', code }, env.fetch),

    /**
     * Accept an invitation; switching to another storage keeps old shared books
     * as local copies. `name` is how the person signs in this book; `self` is a
     * new narrator of their own when the invitation names nobody.
     */
    acceptInvite: (url: string, code: string, who: { name: string; profileName?: string; self?: Person; deviceName?: string }) => serial(async () => {
      const existing = env.store.get().connection;
      const sameStorage = existing?.url === url;
      const reply = await callFamilyServer<{ member: { id: string; name: string; admin: boolean }; token?: string; book: RemoteBook }>(url,
        { action: 'acceptInvite', code, name: who.name, profileName: who.profileName, personId: who.self?.id, deviceName: who.deviceName,
          token: sameStorage ? existing?.token : undefined }, env.fetch);
      if (who.self && reply.book.personId === who.self.id) addSelf(who.self);
      env.store.update((state) => {
        const base = sameStorage ? state : { version: 1 as const, books: {} };
        const connectionState: CloudConnection = reply.token
          ? { url, memberId: reply.member.id, token: reply.token, name: reply.member.name, admin: reply.member.admin, connectedAt: now().toISOString() }
          : state.connection!;
        const current = returning(base.books[reply.book.id]);
        const joined: CloudBookState = { ...current, title: reply.book.title,
          creatorId: reply.book.creatorId, creatorName: reply.book.creatorName, canManage: reply.book.canManage };
        const personId = reply.book.personId ?? current.personId;
        return { ...base, connection: connectionState, books: { ...base.books, [reply.book.id]: personId ? withPerson(joined, personId) : joined } };
      });
      const outcome = await syncBookNow(reply.book.id);
      return { book: reply.book, outcome };
    }),

    /** Invitation code for a book; the invited person travels with the book. */
    createInvite: (bookId: string, person?: Pick<Person, 'id' | 'name'>) => serial(async () => {
      if (person) {
        updateBook(bookId, (book) => ({ ...book, people: book.people.includes(person.id) ? book.people : [...book.people, person.id] }));
        await syncBookNow(bookId);
      }
      return call<{ code: string; expiresAt: string }>('createInvite', { bookId, personId: person?.id, personName: person?.name ?? '' });
    }),

    members: (bookId: string) => call<{ members: CloudMember[]; canManage: boolean }>('members', { bookId }),

    removeMember: (bookId: string, memberId: string) => serial(() => call('removeMember', { bookId, memberId })),

    /**
     * A member's name in the book (the creator names anyone, a member only
     * themselves), or the person this phone signs as when it has none yet.
     */
    updateMember: (bookId: string, patch: { memberId?: string; name?: string; personId?: string }) => serial(async () => {
      const reply = await call<{ book: RemoteBook }>('updateMember', { bookId, ...patch });
      updateBook(bookId, (book) => {
        const named = { ...book, creatorName: reply.book.creatorName };
        return patch.personId && !patch.memberId ? withPerson(named, patch.personId) : named;
      });
    }),

    /**
     * Delete for everyone (creator), leave (member: coming back takes a new
     * invitation), or keep the creator's book off this phone only ('local':
     * it can be brought back). The local copy itself is the caller's business.
     * `pending` means the phone was offline and the storage hears of leaving later.
     */
    removeBook: (bookId: string, mode: 'delete' | 'leave' | 'local'): Promise<{ pending: boolean }> => {
      if (mode === 'local') {
        detach(bookId);
        return Promise.resolve({ pending: false });
      }
      if (mode === 'leave') return serial(() => leave(bookId));
      return serial(async () => {
        await call('deleteBook', { bookId });
        unlink(bookId);
        return { pending: false };
      });
    },

    /** Bring a book removed from this phone back from the storage. */
    attachBook: (bookId: string) => serial(async () => {
      generation += 1;
      updateBook(bookId, (book) => ({ ...restart(book), detached: undefined }));
      return syncBookNow(bookId);
    }),

    /**
     * The whole archive on this phone was replaced (a fresh start, the demo,
     * a backup). Books still here are taken again from the storage, so an old
     * or empty copy never sends deletions; the rest are removed from this
     * phone only ('detach') or downloaded again ('pull').
     */
    snapshotReplaced(missing: 'detach' | 'pull') {
      generation += 1;
      accessCache.clear();
      const present = new Set(env.getSnapshot().books.map((book) => book.id));
      env.store.update((state) => ({
        ...state,
        books: Object.fromEntries(Object.entries(state.books).map(([bookId, book]) => {
          if (present.has(bookId)) return [bookId, { ...restart(book), detached: undefined }];
          return [bookId, missing === 'detach' || book.detached ? { ...restart(book), detached: true } : restart(book)];
        }))
      }));
    },

    /** Owner of the storage steps into a book whose creator lost their phone, signing as `who`. */
    joinBook: (bookId: string, who?: { name: string; self?: Person }) => serial(async () => {
      const reply = await call<{ book: RemoteBook }>('joinBook', { bookId, name: who?.name, personId: who?.self?.id });
      if (who?.self && reply.book.personId === who.self.id) addSelf(who.self);
      env.store.update((state) => {
        const book = returning(state.books[bookId]);
        return { ...state, books: { ...state.books, [bookId]: reply.book.personId ? withPerson(book, reply.book.personId) : book } };
      });
      return syncBookNow(bookId);
    }),

    refreshBooks: () => serial(refreshBooks),

    /** Whether a file is in the family storage (and so can be opened from the cloud). */
    hasFile: (assetId: string) => Boolean(locate(assetId)),

    hasPreview: (assetId: string) => Boolean(locate(assetId)?.file.previewId),

    fetchFile,

    streamAccess: async (assetId: string, refresh = false): Promise<StreamAccess> => {
      const found = locate(assetId);
      if (!found) throw new CloudError('media_failed', 'Этого файла нет в семейном хранилище.');
      const access = await mediaAccess(found.bookId, refresh);
      const asset = env.getSnapshot().mediaAssets.find((item) => item.id === assetId);
      return { url: `${access.api}/drive/v3/files/${encodeURIComponent(found.file.fileId)}?alt=media`, accessToken: access.accessToken,
        expiresAt: access.expiresAt, size: found.file.size ?? null, mimeType: asset?.mimeType.split(';')[0] || 'application/octet-stream' };
    },

    /**
     * Keep the book's files on this device: what is not here yet comes now,
     * new files come with every sync. Stopping leaves what already came.
     */
    downloadFiles: async (bookId: string, onProgress?: (progress: DownloadProgress) => void): Promise<DownloadProgress & { stopped: boolean }> => {
      if (!bookState(bookId)) throw new CloudError('not_member', 'Эта книга не в семейном хранилище.');
      downloading.get(bookId)?.abort();
      const control = new AbortController();
      downloading.set(bookId, control);
      updateBook(bookId, (book) => ({ ...book, keepFiles: true }));
      const progress: DownloadProgress = { done: 0, total: 0, failed: 0 };
      try {
        const todo = await missingFiles(bookId);
        progress.total = todo.length;
        onProgress?.({ ...progress });
        for (const assetId of todo) {
          if (control.signal.aborted) break;
          try {
            await storeFile(assetId);
            progress.done += 1;
          } catch (error) {
            if (error instanceof CloudError && (UNLINK_CODES.has(error.code) || error.code === 'unauthorized' || error.code === 'offline')) throw error;
            progress.failed += 1;
          }
          onProgress?.({ ...progress });
        }
        return { ...progress, stopped: control.signal.aborted };
      } finally {
        if (downloading.get(bookId) === control) downloading.delete(bookId);
      }
    },

    /** Stop downloading: the book goes back to opening its files from the cloud. */
    stopDownload: (bookId: string) => {
      downloading.get(bookId)?.abort();
      updateBook(bookId, (book) => ({ ...book, keepFiles: false }));
    },

    /**
     * Take the book's files off this device to free space; they open from the
     * cloud again. Files not uploaded yet, or kept by another book here, stay.
     */
    freeFiles: async (bookId: string): Promise<{ removed: number; bytes: number; kept: number }> => {
      downloading.get(bookId)?.abort();
      updateBook(bookId, (book) => ({ ...book, keepFiles: false }));
      const snapshot = env.getSnapshot();
      const ids = mediaIdsOfBook(snapshot, bookId);
      const keptElsewhere = new Set<string>();
      snapshot.books.forEach((other) => {
        const state = bookState(other.id);
        if (other.id !== bookId && (!state || state.keepFiles)) mediaIdsOfBook(snapshot, other.id).forEach((id) => keptElsewhere.add(id));
      });
      const files = bookState(bookId)?.files ?? {};
      const stored = new Set(await env.blobs.keys().catch(() => [] as string[]));
      const result = { removed: 0, bytes: 0, kept: 0 };
      for (const asset of snapshot.mediaAssets) {
        if (!ids.has(asset.id) || !stored.has(asset.id)) continue;
        if (!files[asset.id] || keptElsewhere.has(asset.id)) { result.kept += 1; continue; }
        await env.blobs.delete(asset.id);
        result.removed += 1;
        result.bytes += files[asset.id].size ?? asset.sizeBytes ?? 0;
      }
      return result;
    },

    /** The profile name, the same on every device of the person. */
    updateProfile: (name: string) => serial(async () => {
      const reply = await call<{ member: { id: string; name: string; admin: boolean } }>('updateProfile', { name });
      env.store.update((state) => (state.connection ? { ...state, connection: { ...state.connection, name: reply.member.name } } : state));
      return reply.member;
    }),

    devices: () => call<{ devices: CloudDevice[] }>('devices').then((reply) => reply.devices),

    renameDevice: (deviceId: string, name: string) => serial(() => call('renameDevice', { deviceId, name })),

    /** Disconnect one of the person's devices; this one, too: then its books stay here as local copies. */
    removeDevice: (deviceId?: string) => serial(async () => {
      const current = connection();
      const self = !deviceId || deviceId === current.deviceId;
      try {
        await call('removeDevice', { deviceId: deviceId ?? current.deviceId });
      } catch (error) {
        if (!(error instanceof CloudError) || (error.code !== 'device_not_found' && !(self && error.code === 'unauthorized'))) throw error;
      }
      if (self) {
        accessCache.clear();
        env.store.update(() => ({ version: 1, books: {} }));
      }
    }),

    createDeviceLink: () => call<{ code: string; expiresAt: string }>('createDeviceLink'),

    previewDeviceLink: (url: string, code: string) => callFamilyServer<DeviceLinkPreview>(url, { action: 'previewDeviceLink', code }, env.fetch),

    /**
     * Sign this device in to a person's profile. Books shared with them come
     * with the next sync; shared books of a previous connection stay here as
     * local copies.
     */
    acceptDeviceLink: (url: string, code: string, deviceName: string) => serial(async () => {
      const existing = env.store.get().connection;
      const reply = await callFamilyServer<{ member: { id: string; name: string; admin: boolean }; token: string }>(url,
        { action: 'acceptDeviceLink', code, deviceName }, env.fetch);
      accessCache.clear();
      generation += 1;
      env.store.update((state) => {
        const same = existing?.url === url && existing.memberId === reply.member.id;
        return { version: 1, books: same ? state.books : {},
          connection: { url, memberId: reply.member.id, token: reply.token, name: reply.member.name, admin: reply.member.admin, connectedAt: now().toISOString() } };
      });
      return reply.member;
    })
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
