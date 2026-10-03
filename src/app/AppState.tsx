/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadSnapshot, persistSnapshot, resetSnapshot } from '../data/repository';
import type {
  AppSettings,
  AppSnapshot,
  Memory,
  MemoryDraft,
  NewMemoryInput,
  Person,
  Question
} from '../data/types';
import { createId } from '../lib/id';

interface AppStateValue {
  snapshot: AppSnapshot;
  project: AppSnapshot['project'];
  people: Person[];
  questions: Question[];
  memories: Memory[];
  drafts: MemoryDraft[];
  settings: AppSettings;
  getPerson: (id: string) => Person | undefined;
  getQuestion: (id: string) => Question | undefined;
  getMemory: (id: string) => Memory | undefined;
  questionsForPerson: (personId: string) => Question[];
  memoriesForPerson: (personId: string) => Memory[];
  nextQuestion: (personId?: string) => Question | undefined;
  saveDraft: (input: Omit<MemoryDraft, 'id' | 'createdAt' | 'status'>) => MemoryDraft;
  addMemory: (input: NewMemoryInput) => Memory;
  toggleFavorite: (memoryId: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetDemo: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(() => loadSnapshot());

  useEffect(() => {
    persistSnapshot(snapshot);
  }, [snapshot]);

  const getPerson = (id: string) => snapshot.people.find((person) => person.id === id);
  const getQuestion = (id: string) => snapshot.questions.find((question) => question.id === id);
  const getMemory = (id: string) => snapshot.memories.find((memory) => memory.id === id);
  const questionsForPerson = (personId: string) =>
    snapshot.questions.filter((question) => question.personId === personId).sort((a, b) => a.order - b.order);
  const memoriesForPerson = (personId: string) =>
    snapshot.memories
      .filter((memory) => memory.personId === personId)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  const nextQuestion = (personId?: string) => {
    const candidates = personId
      ? snapshot.questions.filter((question) => question.personId === personId)
      : snapshot.questions;

    return (
      candidates.find((question) => question.status === 'next') ??
      candidates.find((question) => question.status === 'planned')
    );
  };

  const saveDraft = (input: Omit<MemoryDraft, 'id' | 'createdAt' | 'status'>) => {
    const draft: MemoryDraft = {
      ...input,
      id: createId('draft'),
      createdAt: new Date().toISOString(),
      status: 'draft'
    };

    setSnapshot((current) => ({
      ...current,
      drafts: [
        ...current.drafts.filter(
          (item) => !(item.personId === draft.personId && item.questionId === draft.questionId)
        ),
        draft
      ],
      questions: current.questions.map((question) =>
        question.id === draft.questionId && question.status !== 'answered'
          ? { ...question, status: 'draft' }
          : question
      )
    }));

    return draft;
  };

  const addMemory = (input: NewMemoryInput) => {
    const person = getPerson(input.personId);
    const question = getQuestion(input.questionId);

    if (!person || !question) {
      throw new Error('Не найден рассказчик или вопрос');
    }

    const existing = snapshot.memories.find(
      (item) => item.personId === person.id && item.questionId === question.id
    );
    const photo = input.photoUrl
      ? { url: input.photoUrl, alt: input.photoAlt ?? 'Семейная фотография' }
      : { url: existing?.photoUrl ?? '', alt: existing?.photoAlt ?? '' };

    const memory: Memory = {
      id: existing?.id ?? createId('memory'),
      personId: person.id,
      questionId: question.id,
      title: existing?.title ?? `${person.name}: ${question.category.toLowerCase()}`,
      questionText: question.text,
      recordedAt: existing?.recordedAt ?? new Date().toISOString(),
      durationSeconds: input.durationSeconds,
      transcript: input.transcript,
      tags: input.tags,
      photoUrl: photo.url,
      photoAlt: photo.alt,
      source: existing?.source ?? 'app',
      favorite: existing?.favorite ?? false
    };

    setSnapshot((current) => ({
      ...current,
      memories: existing
        ? current.memories.map((item) => (item.id === memory.id ? memory : item))
        : [memory, ...current.memories],
      drafts: current.drafts.filter((draft) => draft.questionId !== question.id),
      questions: current.questions.map((item) =>
        item.id === question.id ? { ...item, status: 'answered' } : item
      ),
      people: current.people.map((item) =>
        item.id === person.id
          ? {
              ...item,
              answeredCount: existing ? item.answeredCount : item.answeredCount + 1,
              lastActiveAt: memory.recordedAt,
              status: 'active'
            }
          : item
      )
    }));

    return memory;
  };

  const toggleFavorite = (memoryId: string) => {
    setSnapshot((current) => ({
      ...current,
      memories: current.memories.map((memory) =>
        memory.id === memoryId ? { ...memory, favorite: !memory.favorite } : memory
      )
    }));
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSnapshot((current) => ({
      ...current,
      settings: { ...current.settings, ...patch }
    }));
  };

  const resetDemo = () => setSnapshot(resetSnapshot());

  return (
    <AppStateContext.Provider
      value={{
        snapshot,
        project: snapshot.project,
        people: snapshot.people,
        questions: snapshot.questions,
        memories: snapshot.memories,
        drafts: snapshot.drafts,
        settings: snapshot.settings,
        getPerson,
        getQuestion,
        getMemory,
        questionsForPerson,
        memoriesForPerson,
        nextQuestion,
        saveDraft,
        addMemory,
        toggleFavorite,
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


