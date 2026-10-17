/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { addDemo, dropUnusedDemo, removeDemo } from '../data/demoBook';
import { loadSnapshotResult, persistSnapshot } from '../data/repository';
import { CLOUD_STATE_KEY, parseCloudState } from '../sync/cloudState';
import { createId } from '../lib/id';
import type { MediaUploadWithBlob } from '../lib/mediaFiles';
import {
  applyMediaMigration,
  inlineStoredMedia,
  mediaStore,
  mediaStoreErrorMessage,
  migrateSnapshotMedia,
  moveInlineMediaToStore,
  pruneMediaStore,
  requestPersistentStorage,
  storedMediaUrl
} from '../lib/mediaStore';
import type { StorageError, StorageWriteResult } from '../lib/storage';
import { bookPackageFileName, bookPackageToHtml, buildBookPackage, mergeBookPackage, parseBookPackage, type MergeSummary } from '../data/bookPackage';
import {
  activeBookOf,
  createBookInSnapshot,
  createChapterInSnapshot,
  createPersonInSnapshot,
  deleteBookFromSnapshot,
  deleteChapterFromSnapshot,
  deleteMomentsFromSnapshot,
  deletePersonFromSnapshot,
  deletePerspectiveFromSnapshot,
  deleteReflectionFromSnapshot,
  emptySnapshot,
  moveChapterInSnapshot,
  setActiveBookInSnapshot,
  setBookCoverInSnapshot,
  updateBookInSnapshot,
  updateChapterInSnapshot,
  updatePersonInSnapshot,
  type BookInput,
  type ChapterInput,
  type DeletionResult,
  type PersonInput
} from '../data/library';
import {
  addMediaAssetToSnapshot,
  addMemoryToSnapshot,
  addMomentToSnapshot,
  addPerspectiveToSnapshot,
  addReflectionToSnapshot,
  attachMemoryAudio,
  createMediaAsset,
  createMemoryDraft,
  createMoment,
  createPerspective,
  createReflection,
  publishMemoryToSnapshot,
  removeUnusedMediaAsset,
  saveDraftToSnapshot,
  setMomentNarrationInSnapshot,
  toggleMomentFavorite,
  toggleMemoryFavorite,
  updateMomentInSnapshot
} from '../data/mutations';
import type {
  AppSettings,
  AppSnapshot,
  Book,
  Chapter,
  MediaAsset,
  Memory,
  MemoryDraft,
  Moment,
  NewMemoryInput,
  Person,
  Question,
  Reflection,
  Perspective
} from '../data/types';

interface AppStateValue {
  snapshot: AppSnapshot;
  project: AppSnapshot['project'];
  people: Person[];
  questions: Question[];
  memories: Memory[];
  drafts: MemoryDraft[];
  books: AppSnapshot['books'];
  chapters: AppSnapshot['chapters'];
  moments: Moment[];
  perspectives: Perspective[];
  reflections: Reflection[];
  mediaAssets: MediaAsset[];
  settings: AppSettings;
  persistenceError: StorageError | null;
  recoveryWarning: string | null;
  downloadOriginalData: (() => void) | null;
  retryPersistence: () => StorageWriteResult;
  exportBackup: () => Promise<void>;
  registerDraftFlush: (flush: () => void) => () => void;
  importSnapshot: (snapshot: AppSnapshot) => StorageWriteResult;
  /** The latest snapshot, also between renders (for background sync). */
  getSnapshot: () => AppSnapshot;
  /** Apply changes that came from the family storage; false if they could not be saved. */
  applyCloudUpdate: (update: (current: AppSnapshot) => AppSnapshot) => boolean;
  /** Moves embedded backup media into the device blob store before replacing the book. */
  restoreBackup: (snapshot: AppSnapshot) => Promise<StorageWriteResult>;
  getPerson: (id: string) => Person | undefined;
  getQuestion: (id: string) => Question | undefined;
  getMemory: (id: string) => Memory | undefined;
  getMoment: (id: string) => Moment | undefined;
  questionsForPerson: (personId: string) => Question[];
  memoriesForPerson: (personId: string) => Memory[];
  chaptersForBook: (bookId: string) => AppSnapshot['chapters'];
  momentsForChapter: (chapterId: string) => Moment[];
  perspectivesForMoment: (momentId: string) => Perspective[];
  reflectionsForMoment: (momentId: string) => Reflection[];
  mediaForPerspective: (perspectiveId: string) => MediaAsset | undefined;
  nextQuestion: (personId?: string) => Question | undefined;
  saveDraft: (input: Omit<MemoryDraft, 'id' | 'createdAt' | 'status'>) => MemoryDraft;
  addMemory: (input: NewMemoryInput) => Memory;
  addMoment: (input: Parameters<typeof createMoment>[0]) => Moment;
  updateMoment: (id: string, patch: Parameters<typeof updateMomentInSnapshot>[2]) => void;
  addPerspective: (input: Parameters<typeof createPerspective>[0]) => Perspective;
  addPerspectiveWithMedia: (
    input: Parameters<typeof createPerspective>[0],
    media?: MediaUploadWithBlob
  ) => Promise<StorageWriteResult>;
  storeMedia: (media: MediaUploadWithBlob) => Promise<{ ok: true; asset: MediaAsset } | { ok: false; error: StorageError }>;
  /** Replace a moment's film voice-over; `null` removes it. The previous recording is deleted from the device. */
  setMomentNarration: (momentId: string, media: MediaUploadWithBlob | null) => Promise<StorageWriteResult>;
  discardMedia: (assetId: string) => void;
  addReflection: (input: Parameters<typeof createReflection>[0]) => Reflection;
  addMediaAsset: (input: Parameters<typeof createMediaAsset>[0]) => MediaAsset;
  toggleFavorite: (memoryId: string) => void;
  toggleMomentFavorite: (momentId: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  /** Add the demo family and its book, or take them away with whatever was added inside. */
  setDemoBook: (on: boolean) => StorageWriteResult;
  /** The book the home, book, reader and export screens show. */
  activeBook: Book | undefined;
  setActiveBook: (bookId: string) => void;
  createBook: (input: BookInput, firstChapterTitle?: string) => Book;
  updateBook: (bookId: string, patch: Partial<BookInput>) => void;
  setBookCover: (bookId: string, assetId: string | undefined) => void;
  deleteBook: (bookId: string) => void;
  createChapter: (bookId: string, input: ChapterInput) => Chapter;
  updateChapter: (chapterId: string, patch: Partial<ChapterInput>) => void;
  moveChapter: (chapterId: string, direction: -1 | 1) => void;
  deleteChapter: (chapterId: string) => void;
  deleteMoment: (momentId: string) => void;
  deletePerspective: (perspectiveId: string) => void;
  deleteReflection: (reflectionId: string) => void;
  createPerson: (input: PersonInput) => Person;
  updatePerson: (personId: string, patch: Partial<PersonInput>) => void;
  deletePerson: (personId: string) => void;
  /** Replace everything with an empty archive for real use. Display settings stay. */
  startFresh: (title: string) => Promise<StorageWriteResult>;
  /** One book with its media as a file to send to relatives. */
  packBook: (bookId: string) => Promise<File>;
  /** Add or update a book from a file a relative sent. */
  importBookFile: (file: File) => Promise<{ ok: true; summary: MergeSummary } | { ok: false; error: string }>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

/** Books this phone shares through the family storage: a start never drops them as demo. */
function sharedBookIds(): Set<string> {
  try {
    return new Set(Object.keys(parseCloudState(window.localStorage.getItem(CLOUD_STATE_KEY)).books));
  } catch {
    return new Set();
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => {
    const loaded = loadSnapshotResult();
    return loaded.rawBackup === undefined ? { ...loaded, snapshot: dropUnusedDemo(loaded.snapshot, sharedBookIds()) } : loaded;
  });
  const [snapshot, setSnapshot] = useState<AppSnapshot>(initial.snapshot);
  const snapshotRef = useRef(snapshot);
  const [recoveryWarning, setRecoveryWarning] = useState<string | null>(initial.warning ?? null);
  const originalDataRef = useRef(initial.rawBackup);
  const [persistenceError, setPersistenceError] = useState<StorageError | null>(null);
  const persistenceErrorRef = useRef<StorageError | null>(null);
  const pendingDraftFlushes = useRef(new Set<() => void>());

  const registerDraftFlush = useCallback((flush: () => void) => {
    pendingDraftFlushes.current.add(flush);
    return () => { pendingDraftFlushes.current.delete(flush); };
  }, []);

  const persist = useCallback((next: AppSnapshot) => {
    const result: StorageWriteResult = originalDataRef.current !== undefined
      ? { ok: false, error: { kind: 'unavailable', message: 'Исходные данные требуют восстановления. Скачайте исходный файл, затем восстановите копию или сбросьте книгу в настройках.' } }
      : persistSnapshot(next);
    const error = result.ok ? null : result.error;
    persistenceErrorRef.current = error;
    setPersistenceError(error);
    if (result.ok) setRecoveryWarning(null);
    return result;
  }, []);

  // Write synchronously before navigation or closing the tab can interrupt a
  // React effect. Keep failed writes in memory so a full backup is still possible.
  const commitSnapshot = useCallback((update: (current: AppSnapshot) => AppSnapshot) => {
    const next = update(snapshotRef.current);
    snapshotRef.current = next;
    const result = persist(next);
    setSnapshot(next);
    return result;
  }, [persist]);

  const retryPersistence = useCallback(() => persist(snapshotRef.current), [persist]);

  const exportBackup = useCallback(async () => {
    pendingDraftFlushes.current.forEach((flush) => flush());
    // Device-local media is embedded so the backup restores on another device.
    const current = snapshotRef.current;
    const { assets } = await inlineStoredMedia(current.mediaAssets, mediaStore());
    const blob = new Blob([JSON.stringify({ ...current, mediaAssets: assets }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `family-stories-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const downloadOriginalData = useCallback(() => {
    if (originalDataRef.current === undefined) return;
    const url = URL.createObjectURL(new Blob([originalDataRef.current], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'family-stories-original-recovery.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const importSnapshot = useCallback((next: AppSnapshot): StorageWriteResult => {
    const result = persistSnapshot(next);
    if (!result.ok) return result;
    snapshotRef.current = next;
    originalDataRef.current = undefined;
    setRecoveryWarning(null);
    persistenceErrorRef.current = null;
    setPersistenceError(null);
    setSnapshot(next);
    return result;
  }, []);

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  const applyCloudUpdate = useCallback((update: (current: AppSnapshot) => AppSnapshot) => {
    // Original data waiting for recovery must not be overwritten by a sync.
    if (originalDataRef.current !== undefined) return false;
    const next = update(snapshotRef.current);
    if (next === snapshotRef.current) return true;
    const result = persistSnapshot(next);
    if (!result.ok) return false;
    snapshotRef.current = next;
    persistenceErrorRef.current = null;
    setPersistenceError(null);
    setSnapshot(next);
    return true;
  }, []);

  const restoreBackup = useCallback(async (next: AppSnapshot): Promise<StorageWriteResult> => {
    const store = mediaStore();
    const hadPendingRecovery = originalDataRef.current !== undefined;
    let migrated: AppSnapshot;
    try {
      migrated = (await migrateSnapshotMedia(next, store)).snapshot;
    } catch (error) {
      return { ok: false, error: { kind: 'unavailable', message: mediaStoreErrorMessage(error) } };
    }
    if (migrated.mediaAssets.some((asset) => asset.url.startsWith('data:'))) {
      return { ok: false, error: { kind: 'quota', message: mediaStoreErrorMessage(new DOMException('Full', 'QuotaExceededError')) } };
    }
    const result = importSnapshot(migrated);
    if (result.ok) requestPersistentStorage();
    // Unrecovered original data may still reference device media; keep it until then.
    if (result.ok && !hadPendingRecovery) void pruneMediaStore(migrated, store).catch(() => undefined);
    return result;
  }, [importSnapshot]);

  // Older snapshots kept uploads inline as data: URLs inside localStorage.
  useEffect(() => {
    if (originalDataRef.current !== undefined) return;
    const original = snapshotRef.current.mediaAssets;
    if (!original.some((asset) => asset.url.startsWith('data:'))) return;
    let active = true;
    void moveInlineMediaToStore(original, mediaStore()).then(({ migrated }) => {
      if (!active || migrated.size === 0 || originalDataRef.current !== undefined) return;
      commitSnapshot((current) => applyMediaMigration(current, original, migrated));
      requestPersistentStorage();
    });
    return () => { active = false; };
  }, [commitSnapshot]);

  useEffect(() => {
    const warnOnClose = (event: BeforeUnloadEvent) => {
      if (!persistenceErrorRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnOnClose);
    return () => window.removeEventListener('beforeunload', warnOnClose);
  }, []);

  const getPerson = (id: string) => snapshot.people.find((person) => person.id === id);
  const getQuestion = (id: string) => snapshot.questions.find((question) => question.id === id);
  const getMemory = (id: string) => snapshot.memories.find((memory) => memory.id === id);
  const getMoment = (id: string) => snapshot.moments.find((moment) => moment.id === id);
  const questionsForPerson = (personId: string) =>
    snapshot.questions.filter((question) => question.personId === personId).sort((a, b) => a.order - b.order);
  const memoriesForPerson = (personId: string) =>
    snapshot.memories
      .filter((memory) => memory.personId === personId)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  const chaptersForBook = (bookId: string) =>
    snapshot.chapters.filter((chapter) => chapter.bookId === bookId).sort((a, b) => a.order - b.order);
  const momentsForChapter = (chapterId: string) =>
    snapshot.moments
      .filter((moment) => moment.chapterId === chapterId)
      .sort((a, b) => new Date(b.occurredAt ?? b.createdAt).getTime() - new Date(a.occurredAt ?? a.createdAt).getTime());
  const perspectivesForMoment = (momentId: string) =>
    snapshot.perspectives
      .filter((perspective) => perspective.momentId === momentId)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const reflectionsForMoment = (momentId: string) =>
    snapshot.reflections
      .filter((reflection) => reflection.momentId === momentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const mediaForPerspective = (perspectiveId: string) => {
    const perspective = snapshot.perspectives.find((item) => item.id === perspectiveId);
    return perspective?.mediaAssetId
      ? snapshot.mediaAssets.find((asset) => asset.id === perspective.mediaAssetId)
      : undefined;
  };

  // Keep selectors stable enough for feature screens and make new additions
  // immediately visible after a local write.

  const nextQuestion = (personId?: string) => {
    const candidates = personId
      ? snapshot.questions.filter((question) => question.personId === personId)
      : snapshot.questions;

    return (
      candidates.find((question) => question.status === 'next') ??
      candidates.find((question) => question.status === 'planned')
    );
  };

  const saveDraft = useCallback((input: Omit<MemoryDraft, 'id' | 'createdAt' | 'status'>) => {
    const existing = snapshotRef.current.drafts.find(
      (draft) => draft.personId === input.personId && draft.questionId === input.questionId
    );
    const draft = createMemoryDraft(input, existing?.id, existing?.createdAt);
    commitSnapshot((current) => saveDraftToSnapshot(current, draft));

    return draft;
  }, [commitSnapshot]);

  const addMemory = (input: NewMemoryInput) => {
    const result = publishMemoryToSnapshot(snapshotRef.current, input);
    commitSnapshot((current) => {
      const published = addMemoryToSnapshot(current, result.memory);
      return input.audioMediaAssetId ? attachMemoryAudio(published, result.memory, input.audioMediaAssetId) : published;
    });

    return result.memory;
  };

  const addMoment = (input: Parameters<typeof createMoment>[0]) => {
    const moment = createMoment(input);
    commitSnapshot((current) => addMomentToSnapshot(current, moment));
    return moment;
  };

  const updateMoment = (id: string, patch: Parameters<typeof updateMomentInSnapshot>[2]) => {
    commitSnapshot((current) => updateMomentInSnapshot(current, id, patch));
  };

  const addPerspective = (input: Parameters<typeof createPerspective>[0]) => {
    const perspective = createPerspective(input);
    commitSnapshot((current) => addPerspectiveToSnapshot(current, perspective));
    return perspective;
  };

  const recoveryPendingError = (): StorageError => ({
    kind: 'unavailable',
    message: 'Сначала восстановите сохранённую книгу в настройках, затем добавьте материал.'
  });

  /** Write the bytes first; the snapshot only ever references media that exists on the device. */
  const putMediaBlob = async (media: MediaUploadWithBlob): Promise<{ ok: true; asset: MediaAsset } | { ok: false; error: StorageError }> => {
    const { blob, ...metadata } = media;
    const id = createId('media');
    try {
      await mediaStore().put(id, blob);
    } catch (error) {
      return { ok: false, error: { kind: 'quota', message: mediaStoreErrorMessage(error) } };
    }
    requestPersistentStorage();
    return { ok: true, asset: createMediaAsset({ ...metadata, url: storedMediaUrl(id), sizeBytes: blob.size }, id) };
  };

  const addPerspectiveWithMedia = async (
    input: Parameters<typeof createPerspective>[0],
    media?: MediaUploadWithBlob
  ): Promise<StorageWriteResult> => {
    // Unlike an import, this must not discard original data that is still waiting for recovery.
    if (originalDataRef.current !== undefined) return { ok: false, error: recoveryPendingError() };
    let asset: MediaAsset | undefined;
    if (media) {
      const stored = await putMediaBlob(media);
      if (!stored.ok) return stored;
      asset = stored.asset;
    }
    const perspective = createPerspective({ ...input, mediaAssetId: asset?.id ?? input.mediaAssetId });
    const next = addPerspectiveToSnapshot(
      asset ? addMediaAssetToSnapshot(snapshotRef.current, asset) : snapshotRef.current,
      perspective
    );
    const result: StorageWriteResult = originalDataRef.current !== undefined
      ? { ok: false, error: recoveryPendingError() }
      : persistSnapshot(next);
    if (!result.ok) {
      if (asset) void mediaStore().delete(asset.id).catch(() => undefined);
      return result;
    }
    snapshotRef.current = next;
    persistenceErrorRef.current = null;
    setPersistenceError(null);
    setSnapshot(next);
    return result;
  };

  const storeMedia = async (media: MediaUploadWithBlob): Promise<{ ok: true; asset: MediaAsset } | { ok: false; error: StorageError }> => {
    if (originalDataRef.current !== undefined) return { ok: false, error: recoveryPendingError() };
    const stored = await putMediaBlob(media);
    if (!stored.ok) return stored;
    commitSnapshot((current) => addMediaAssetToSnapshot(current, stored.asset));
    return stored;
  };

  const setMomentNarration = async (momentId: string, media: MediaUploadWithBlob | null): Promise<StorageWriteResult> => {
    if (originalDataRef.current !== undefined) return { ok: false, error: recoveryPendingError() };
    const previous = snapshotRef.current.moments.find((item) => item.id === momentId)?.narrationMediaAssetId;
    let asset: MediaAsset | undefined;
    if (media) {
      const stored = await putMediaBlob(media);
      if (!stored.ok) return stored;
      asset = stored.asset;
    }
    const withAsset = asset ? addMediaAssetToSnapshot(snapshotRef.current, asset) : snapshotRef.current;
    let next = setMomentNarrationInSnapshot(withAsset, momentId, asset?.id);
    if (previous) next = removeUnusedMediaAsset(next, previous);
    const result: StorageWriteResult = originalDataRef.current !== undefined ? { ok: false, error: recoveryPendingError() } : persistSnapshot(next);
    if (!result.ok) {
      if (asset) void mediaStore().delete(asset.id).catch(() => undefined);
      return result;
    }
    snapshotRef.current = next;
    persistenceErrorRef.current = null;
    setPersistenceError(null);
    setSnapshot(next);
    if (previous && !next.mediaAssets.some((item) => item.id === previous)) void mediaStore().delete(previous).catch(() => undefined);
    return result;
  };

  const discardMedia = (assetId: string) => {
    commitSnapshot((current) => removeUnusedMediaAsset(current, assetId));
    if (!snapshotRef.current.mediaAssets.some((asset) => asset.id === assetId)) {
      void mediaStore().delete(assetId).catch(() => undefined);
    }
  };

  const addReflection = (input: Parameters<typeof createReflection>[0]) => {
    const reflection = createReflection(input);
    commitSnapshot((current) => addReflectionToSnapshot(current, reflection));
    return reflection;
  };

  const addMediaAsset = (input: Parameters<typeof createMediaAsset>[0]) => {
    const asset = createMediaAsset(input);
    commitSnapshot((current) => addMediaAssetToSnapshot(current, asset));
    return asset;
  };

  const toggleFavorite = (memoryId: string) => {
    commitSnapshot((current) => toggleMemoryFavorite(current, memoryId));
  };

  const toggleMomentFavoriteState = (momentId: string) => {
    commitSnapshot((current) => toggleMomentFavorite(current, momentId));
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    commitSnapshot((current) => ({
      ...current,
      settings: { ...current.settings, ...patch }
    }));
  };

  const setDemoBook = (on: boolean): StorageWriteResult => {
    let removed: string[] = [];
    const result = commitSnapshot((current) => {
      if (on) return addDemo(current);
      const outcome = removeDemo(current);
      removed = outcome.removedMediaIds;
      return outcome.snapshot;
    });
    removed.forEach((id) => { void mediaStore().delete(id).catch(() => undefined); });
    return result;
  };

  /** Apply a deletion, then remove device files nothing references any more. */
  const commitDeletion = (remove: (current: AppSnapshot) => DeletionResult) => {
    let removed: string[] = [];
    commitSnapshot((current) => {
      const result = remove(current);
      removed = result.removedMediaIds;
      return result.snapshot;
    });
    removed.forEach((id) => { void mediaStore().delete(id).catch(() => undefined); });
  };

  const setActiveBook = (bookId: string) => {
    commitSnapshot((current) => setActiveBookInSnapshot(current, bookId));
  };

  const createBook = (input: BookInput, firstChapterTitle = '') => {
    let book: Book | undefined;
    commitSnapshot((current) => {
      const result = createBookInSnapshot(current, input, firstChapterTitle);
      book = result.book;
      return result.snapshot;
    });
    return book!;
  };

  const updateBook = (bookId: string, patch: Partial<BookInput>) => {
    commitSnapshot((current) => updateBookInSnapshot(current, bookId, patch));
  };

  const setBookCover = (bookId: string, assetId: string | undefined) => {
    commitSnapshot((current) => setBookCoverInSnapshot(current, bookId, assetId));
  };

  const deleteBook = (bookId: string) => commitDeletion((current) => deleteBookFromSnapshot(current, bookId));

  const createChapter = (bookId: string, input: ChapterInput) => {
    let chapter: Chapter | undefined;
    commitSnapshot((current) => {
      const result = createChapterInSnapshot(current, bookId, input);
      chapter = result.chapter;
      return result.snapshot;
    });
    return chapter!;
  };

  const updateChapter = (chapterId: string, patch: Partial<ChapterInput>) => {
    commitSnapshot((current) => updateChapterInSnapshot(current, chapterId, patch));
  };

  const moveChapter = (chapterId: string, direction: -1 | 1) => {
    commitSnapshot((current) => moveChapterInSnapshot(current, chapterId, direction));
  };

  const deleteChapter = (chapterId: string) => commitDeletion((current) => deleteChapterFromSnapshot(current, chapterId));

  const deleteMoment = (momentId: string) => commitDeletion((current) => deleteMomentsFromSnapshot(current, [momentId]));

  const deletePerspective = (perspectiveId: string) => commitDeletion((current) => deletePerspectiveFromSnapshot(current, perspectiveId));

  const deleteReflection = (reflectionId: string) => commitSnapshot((current) => deleteReflectionFromSnapshot(current, reflectionId));

  const createPerson = (input: PersonInput) => {
    let person: Person | undefined;
    commitSnapshot((current) => {
      const result = createPersonInSnapshot(current, input);
      person = result.person;
      return result.snapshot;
    });
    return person!;
  };

  const updatePerson = (personId: string, patch: Partial<PersonInput>) => {
    commitSnapshot((current) => updatePersonInSnapshot(current, personId, patch));
  };

  const deletePerson = (personId: string) => commitDeletion((current) => deletePersonFromSnapshot(current, personId));

  const startFresh = async (title: string): Promise<StorageWriteResult> => {
    const result = importSnapshot(emptySnapshot(snapshotRef.current.settings, title));
    if (result.ok) void pruneMediaStore(snapshotRef.current, mediaStore()).catch(() => undefined);
    return result;
  };

  const packBook = async (bookId: string): Promise<File> => {
    pendingDraftFlushes.current.forEach((flush) => flush());
    const pkg = buildBookPackage(snapshotRef.current, bookId);
    const { assets, missing } = await inlineStoredMedia(pkg.mediaAssets, mediaStore());
    // A file lost on this device cannot travel; send the rest without it.
    const lost = new Set(missing);
    const portable = {
      ...pkg,
      mediaAssets: assets.filter((asset) => !lost.has(asset.id)),
      perspectives: pkg.perspectives.map((item) => item.mediaAssetId && lost.has(item.mediaAssetId) ? { ...item, mediaAssetId: undefined } : item),
      moments: pkg.moments.map((moment) => moment.narrationMediaAssetId && lost.has(moment.narrationMediaAssetId) ? { ...moment, narrationMediaAssetId: undefined } : moment),
      book: pkg.book.coverMediaAssetId && lost.has(pkg.book.coverMediaAssetId) ? { ...pkg.book, coverMediaAssetId: undefined } : pkg.book
    };
    const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    return new File([bookPackageToHtml(portable, appUrl)], bookPackageFileName(pkg.book), { type: 'text/html' });
  };

  const importBookFile = async (file: File): Promise<{ ok: true; summary: MergeSummary } | { ok: false; error: string }> => {
    if (originalDataRef.current !== undefined) return { ok: false, error: recoveryPendingError().message };
    let pkg;
    try {
      pkg = parseBookPackage(await file.text());
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Не удалось прочитать файл книги.' };
    }
    const known = new Set(snapshotRef.current.mediaAssets.map((asset) => asset.id));
    const fresh = pkg.mediaAssets.filter((asset) => !known.has(asset.id));
    const { migrated, failed } = await moveInlineMediaToStore(fresh, mediaStore());
    if (failed.length) {
      migrated.forEach((_, id) => { void mediaStore().delete(id).catch(() => undefined); });
      return { ok: false, error: mediaStoreErrorMessage(new DOMException('Full', 'QuotaExceededError')) };
    }
    try {
      const { snapshot: merged, summary } = mergeBookPackage(snapshotRef.current, pkg, migrated);
      const result = persistSnapshot(merged);
      if (!result.ok) {
        migrated.forEach((_, id) => { void mediaStore().delete(id).catch(() => undefined); });
        return { ok: false, error: result.error.message };
      }
      snapshotRef.current = merged;
      persistenceErrorRef.current = null;
      setPersistenceError(null);
      setSnapshot(merged);
      requestPersistentStorage();
      return { ok: true, summary };
    } catch (error) {
      migrated.forEach((_, id) => { void mediaStore().delete(id).catch(() => undefined); });
      return { ok: false, error: error instanceof Error ? error.message : 'Не удалось добавить книгу.' };
    }
  };

  return (
    <AppStateContext.Provider
      value={{
        snapshot,
        project: snapshot.project,
        people: snapshot.people,
        questions: snapshot.questions,
        memories: snapshot.memories,
        drafts: snapshot.drafts,
        books: snapshot.books,
        chapters: snapshot.chapters,
        moments: snapshot.moments,
        perspectives: snapshot.perspectives,
        reflections: snapshot.reflections,
        mediaAssets: snapshot.mediaAssets,
        settings: snapshot.settings,
        persistenceError,
        recoveryWarning,
        downloadOriginalData: originalDataRef.current !== undefined ? downloadOriginalData : null,
        retryPersistence,
        exportBackup,
        registerDraftFlush,
        importSnapshot,
        getSnapshot,
        applyCloudUpdate,
        restoreBackup,
        getPerson,
        getQuestion,
        getMemory,
        getMoment,
        questionsForPerson,
        memoriesForPerson,
        chaptersForBook,
        momentsForChapter,
        perspectivesForMoment,
        reflectionsForMoment,
        mediaForPerspective,
        nextQuestion,
        saveDraft,
        addMemory,
        addMoment,
        updateMoment,
        addPerspective,
        addPerspectiveWithMedia,
        storeMedia,
        setMomentNarration,
        discardMedia,
        addReflection,
        addMediaAsset,
        toggleFavorite,
        toggleMomentFavorite: toggleMomentFavoriteState,
        updateSettings,
        setDemoBook,
        activeBook: activeBookOf(snapshot),
        setActiveBook,
        createBook,
        updateBook,
        setBookCover,
        deleteBook,
        createChapter,
        updateChapter,
        moveChapter,
        deleteChapter,
        deleteMoment,
        deletePerspective,
        deleteReflection,
        createPerson,
        updatePerson,
        deletePerson,
        startFresh,
        packBook,
        importBookFile
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState должен использоваться внутри AppStateProvider');
  }
  return context;
}


