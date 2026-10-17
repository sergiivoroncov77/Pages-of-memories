/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAppState } from '../app/AppState';
import type { Person } from '../data/types';
import { mediaStore, notifyMediaStored } from '../lib/mediaStore';
import { CloudError, cloudErrorMessage, createDriveTransfer, inviteLink } from './cloudApi';
import { createCloudStateStore, type CloudBookState, type CloudConnection, type CloudState } from './cloudState';
import { createSyncEngine, type CloudMember, type InvitePreview, type RemoteBook } from './syncEngine';

/*
 * The family storage for the whole app: it syncs shared books when the app
 * opens, every couple of minutes while it is on screen, a few seconds after a
 * local edit, when the network comes back — and when someone presses the button.
 */

export type CloudStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface CloudSyncValue {
  connection?: CloudConnection;
  books: Record<string, CloudBookState>;
  status: CloudStatus;
  error: string | null;
  lastSyncAt?: string;
  /** Messages about books that left the storage. */
  notices: string[];
  dismissNotices: () => void;
  /** Books in the storage this device is not a member of (visible to its owner). */
  otherBooks: RemoteBook[];
  isShared: (bookId: string) => boolean;
  myPersonId: (bookId: string | undefined) => string | undefined;
  syncNow: () => Promise<void>;
  connectOwner: (url: string, name: string) => Promise<void>;
  disconnect: () => void;
  publishBook: (bookId: string) => Promise<void>;
  createInviteLink: (bookId: string, person?: Pick<Person, 'id' | 'name'>) => Promise<{ link: string; expiresAt: string }>;
  previewInvite: (url: string, code: string) => Promise<InvitePreview>;
  acceptInvite: (url: string, code: string, name: string) => Promise<{ bookId: string; pending: number }>;
  members: (bookId: string) => Promise<{ members: CloudMember[]; canManage: boolean }>;
  removeMember: (bookId: string, memberId: string) => Promise<void>;
  /** Creator: delete for everyone. Member: leave. The local copy is removed by the caller. */
  removeBook: (bookId: string, mode: 'delete' | 'leave') => Promise<void>;
  joinBook: (bookId: string) => Promise<void>;
}

const CloudSyncContext = createContext<CloudSyncValue | null>(null);

const cloudStore = createCloudStateStore();
const PERIODIC_MS = 2 * 60 * 1000;
const AFTER_EDIT_MS = 4000;

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { getSnapshot, applyCloudUpdate, snapshot } = useAppState();
  const state = useSyncExternalStore(cloudStore.subscribe, cloudStore.get, cloudStore.get) as CloudState;
  const [status, setStatus] = useState<CloudStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [otherBooks, setOtherBooks] = useState<RemoteBook[]>([]);
  const lastAttempt = useRef(0);
  const running = useRef(0);

  const engine = useMemo(() => createSyncEngine({
    store: cloudStore,
    media: createDriveTransfer(),
    blobs: mediaStore(),
    getSnapshot,
    commit: applyCloudUpdate,
    onMediaStored: notifyMediaStored
  }), [getSnapshot, applyCloudUpdate]);

  const titleOf = useCallback((bookId: string) => getSnapshot().books.find((book) => book.id === bookId)?.title ?? 'без названия', [getSnapshot]);

  /** Run a cloud task with the status line kept up to date. */
  const track = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    running.current += 1;
    setStatus('syncing');
    lastAttempt.current = Date.now();
    try {
      const result = await task();
      setError(null);
      setStatus('idle');
      return result;
    } catch (failure) {
      const offline = failure instanceof CloudError && failure.code === 'offline';
      setStatus(offline ? 'offline' : 'error');
      setError(failure instanceof CloudError && failure.code === 'unauthorized'
        ? 'Это устройство отключено от семейного хранилища. Книги остались на телефоне; чтобы снова получать изменения, откройте приглашение ещё раз.'
        : cloudErrorMessage(failure));
      throw failure;
    } finally {
      running.current -= 1;
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!cloudStore.get().connection) return;
    const result = await track(() => engine.syncAll());
    if (result.unlinked.length) {
      setNotices((current) => [...current, ...result.unlinked.map((bookId) =>
        `Книга «${titleOf(bookId)}» больше не в семейном хранилище: её удалили или вас исключили. Копия осталась на этом телефоне.`)]);
    }
    if (result.failed.length) {
      setStatus('error');
      setError(result.failed.map((item) => `«${titleOf(item.bookId)}»: ${item.error}`).join(' '));
    }
    if (cloudStore.get().connection?.admin) {
      engine.refreshBooks().then(({ books }) => setOtherBooks(books.filter((book) => !book.member)), () => undefined);
    }
  }, [engine, track, titleOf]);

  const quietSync = useCallback(() => {
    if (!cloudStore.get().connection || running.current > 0) return;
    void syncNow().catch(() => undefined);
  }, [syncNow]);

  // On start, every couple of minutes while visible, on return to the app and when back online.
  const connected = Boolean(state.connection);
  useEffect(() => {
    if (!connected) return;
    quietSync();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') quietSync();
    }, PERIODIC_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAttempt.current > 30_000) quietSync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', quietSync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', quietSync);
    };
  }, [connected, quietSync]);

  // A few seconds after a local edit to a shared book, send it.
  useEffect(() => {
    if (!connected) return;
    const timer = window.setTimeout(() => {
      const pending = Object.keys(cloudStore.get().books).some((bookId) => engine.hasLocalChanges(bookId));
      if (pending) quietSync();
    }, AFTER_EDIT_MS);
    return () => window.clearTimeout(timer);
  }, [snapshot, connected, engine, quietSync]);

  const value: CloudSyncValue = {
    connection: state.connection,
    books: state.books,
    status,
    error,
    lastSyncAt: Object.values(state.books).map((book) => book.lastSyncAt).filter(Boolean).sort().at(-1),
    notices,
    dismissNotices: () => setNotices([]),
    otherBooks,
    isShared: (bookId) => Boolean(state.connection && state.books[bookId]),
    myPersonId: (bookId) => (bookId ? state.books[bookId]?.personId : undefined),
    syncNow,
    connectOwner: async (url, name) => {
      await track(() => engine.connectOwner(url, name));
      await syncNow().catch(() => undefined);
    },
    disconnect: () => {
      engine.disconnect();
      setStatus('idle');
      setError(null);
      setOtherBooks([]);
    },
    publishBook: async (bookId) => { await track(() => engine.publishBook(bookId)); },
    createInviteLink: async (bookId, person) => {
      const { code, expiresAt } = await track(() => engine.createInvite(bookId, person));
      const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      return { link: inviteLink(appUrl, cloudStore.get().connection!.url, code), expiresAt };
    },
    previewInvite: (url, code) => engine.previewInvite(url, code),
    acceptInvite: async (url, code, name) => {
      const { book, outcome } = await track(() => engine.acceptInvite(url, code, name));
      return { bookId: book.id, pending: outcome.mediaPending };
    },
    members: (bookId) => engine.members(bookId),
    removeMember: async (bookId, memberId) => { await track(() => engine.removeMember(bookId, memberId)); },
    removeBook: async (bookId, mode) => { await track(() => engine.removeBook(bookId, mode)); },
    joinBook: async (bookId) => {
      await track(() => engine.joinBook(bookId));
      setOtherBooks((current) => current.filter((book) => book.id !== bookId));
    }
  };

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}

export function useCloudSync(): CloudSyncValue {
  const context = useContext(CloudSyncContext);
  if (!context) throw new Error('useCloudSync должен использоваться внутри CloudSyncProvider');
  return context;
}
