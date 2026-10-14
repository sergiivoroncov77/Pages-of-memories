/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { loadSnapshotResult, persistSnapshot, resetSnapshot } from '../data/repository';
import type { StorageError, StorageWriteResult } from '../lib/storage';
import {
  addMediaAssetToSnapshot,
  addMemoryToSnapshot,
  addMomentToSnapshot,
  addPerspectiveToSnapshot,
  addReflectionToSnapshot,
  createMediaAsset,
  createMemoryDraft,
  createMoment,
  createPerspective,
  createReflection,
  publishMemoryToSnapshot,
  saveDraftToSnapshot,
  toggleMomentFavorite,
  toggleMemoryFavorite,
  updateMomentInSnapshot
} from '../data/mutations';
import type {
  AppSettings,
  AppSnapshot,
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
  exportBackup: () => void;
  registerDraftFlush: (flush: () => void) => () => void;
  importSnapshot: (snapshot: AppSnapshot) => StorageWriteResult;
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
    media?: Parameters<typeof createMediaAsset>[0]
  ) => StorageWriteResult;
  addReflection: (input: Parameters<typeof createReflection>[0]) => Reflection;
  addMediaAsset: (input: Parameters<typeof createMediaAsset>[0]) => MediaAsset;
  toggleFavorite: (memoryId: string) => void;
  toggleMomentFavorite: (momentId: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetDemo: () => StorageWriteResult;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => loadSnapshotResult());
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

  const exportBackup = useCallback(() => {
    pendingDraftFlushes.current.forEach((flush) => flush());
    const blob = new Blob([JSON.stringify(snapshotRef.current, null, 2)], { type: 'application/json;charset=utf-8' });
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
    commitSnapshot((current) => addMemoryToSnapshot(current, result.memory));

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

  const addPerspectiveWithMedia = (
    input: Parameters<typeof createPerspective>[0],
    media?: Parameters<typeof createMediaAsset>[0]
  ): StorageWriteResult => {
    const asset = media ? createMediaAsset(media) : undefined;
    const perspective = createPerspective({ ...input, mediaAssetId: asset?.id ?? input.mediaAssetId });
    const next = addPerspectiveToSnapshot(
      asset ? addMediaAssetToSnapshot(snapshotRef.current, asset) : snapshotRef.current,
      perspective
    );
    // Large media is only kept when it was actually written. Unlike an import,
    // this must not discard original data that is still waiting for recovery.
    if (originalDataRef.current !== undefined) {
      return { ok: false, error: { kind: 'unavailable', message: 'Сначала восстановите сохранённую книгу в настройках, затем добавьте материал.' } };
    }
    const result = persistSnapshot(next);
    if (!result.ok) return result;
    snapshotRef.current = next;
    persistenceErrorRef.current = null;
    setPersistenceError(null);
    setSnapshot(next);
    return result;
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

  const resetDemo = () => importSnapshot(resetSnapshot());

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
        addReflection,
        addMediaAsset,
        toggleFavorite,
        toggleMomentFavorite: toggleMomentFavoriteState,
        updateSettings,
        resetDemo
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


