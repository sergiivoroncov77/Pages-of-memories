import { createId } from '../lib/id';
import type { AppSettings, AppSnapshot, Book, Chapter, Person, Question } from './types';

/*
 * Library editing: books, chapters and the people a family shares the book
 * with. Every function is pure — it returns a new snapshot — and deletions also
 * return the media ids whose files the caller should remove from the device.
 */

export interface BookInput {
  title: string;
  subtitle?: string;
  description?: string;
}

export interface ChapterInput {
  title: string;
  description?: string;
}

export interface PersonInput {
  name: string;
  relation: string;
  birthYear?: number;
  bio?: string;
}

export interface DeletionResult {
  snapshot: AppSnapshot;
  /** Media assets that nothing references any more; their device files can go. */
  removedMediaIds: string[];
}

const AVATAR_COLORS = ['#b45f45', '#3f7180', '#6b7f4d', '#8b6f45', '#7a5a8c', '#a0524f', '#4f6f5c', '#5b6a8f'];

/** A gentle first conversation for anyone added to the family. */
export const STARTER_QUESTIONS: readonly Omit<Question, 'id' | 'personId' | 'status' | 'order'>[] = [
  { text: 'Какой день из вашего детства запомнился больше всего?', hint: 'Начните с места, времени года или запаха, который помните.', prompts: ['Где это было?', 'Кто был рядом?', 'Что случилось в тот день?'], category: 'Детство' },
  { text: 'Расскажите о доме, в котором вы выросли.', hint: 'Опишите комнаты, двор, звуки и людей, которые там бывали.', prompts: ['Как выглядел ваш двор?', 'Где было ваше любимое место?', 'Кто приходил в гости?'], category: 'Дом' },
  { text: 'Как познакомились ваши родители?', hint: 'Можно пересказать семейную легенду так, как её рассказывали вам.', prompts: ['Где они встретились?', 'Кто рассказал вам эту историю?'], category: 'Семья' },
  { text: 'Кем вы мечтали стать и кем стали?', hint: 'Вспомните человека или событие, после которого выбор стал понятен.', prompts: ['Кто повлиял на решение?', 'Были ли сомнения?'], category: 'Работа' },
  { text: 'Какая поездка запомнилась вам на всю жизнь?', hint: 'Не только место, но и люди, разговоры и неожиданные события.', prompts: ['Почему вы туда поехали?', 'Что вы привезли с собой?'], category: 'Путешествия' },
  { text: 'Какие праздники и традиции были в вашей семье?', hint: 'Блюда, песни, подарки, кто за что отвечал.', prompts: ['Что готовили?', 'Что из этого вы сохранили?'], category: 'Семейные традиции' },
  { text: 'Что важное вам передали старшие?', hint: 'Привычка, правило, умение или часто повторяемые слова.', prompts: ['Когда вы это вспоминаете?', 'Как вы передали это дальше?'], category: 'Семейные традиции' },
  { text: 'Что бы вы хотели, чтобы о вас помнили внуки?', hint: 'Можно ответить одной историей.', prompts: ['Какой совет вы бы дали?', 'Чем вы гордитесь?'], category: 'Наследие' }
];

function now() {
  return new Date().toISOString();
}

function requireTitle(value: string, message: string): string {
  const title = value.trim();
  if (!title) throw new Error(message);
  return title;
}

export function initialsOf(name: string): string {
  const letters = name.trim().split(/[\s-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]);
  return (letters.join('') || '?').toLocaleUpperCase('ru');
}

function avatarColorFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function validBirthYear(year: number | undefined): number | undefined {
  if (year === undefined || Number.isNaN(year)) return undefined;
  const current = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1850 || year > current) throw new Error(`Год рождения — число от 1850 до ${current}.`);
  return year;
}

/** The book the home, book, reader and export screens show. */
export function activeBookOf(snapshot: AppSnapshot): Book | undefined {
  return snapshot.books.find((book) => book.id === snapshot.settings.activeBookId) ?? snapshot.books[0];
}

export function setActiveBookInSnapshot(snapshot: AppSnapshot, bookId: string): AppSnapshot {
  if (!snapshot.books.some((book) => book.id === bookId)) return snapshot;
  return { ...snapshot, settings: { ...snapshot.settings, activeBookId: bookId } };
}

export function createBookInSnapshot(snapshot: AppSnapshot, input: BookInput, firstChapterTitle = ''): { snapshot: AppSnapshot; book: Book } {
  const createdAt = now();
  const book: Book = {
    id: createId('book'),
    projectId: snapshot.project.id,
    title: requireTitle(input.title, 'Добавьте название книги.'),
    subtitle: input.subtitle?.trim() ?? '',
    description: input.description?.trim() ?? '',
    createdAt,
    updatedAt: createdAt
  };
  const chapters: Chapter[] = firstChapterTitle.trim()
    ? [{ id: createId('chapter'), bookId: book.id, title: firstChapterTitle.trim(), description: '', order: 1, createdAt, updatedAt: createdAt }]
    : [];
  return {
    book,
    snapshot: {
      ...snapshot,
      books: [...snapshot.books, book],
      chapters: [...snapshot.chapters, ...chapters],
      settings: { ...snapshot.settings, activeBookId: book.id }
    }
  };
}

export function updateBookInSnapshot(snapshot: AppSnapshot, bookId: string, patch: Partial<BookInput>): AppSnapshot {
  if (!snapshot.books.some((book) => book.id === bookId)) return snapshot;
  const title = patch.title === undefined ? undefined : requireTitle(patch.title, 'Добавьте название книги.');
  return {
    ...snapshot,
    books: snapshot.books.map((book) => book.id === bookId ? {
      ...book,
      title: title ?? book.title,
      subtitle: patch.subtitle?.trim() ?? book.subtitle,
      description: patch.description?.trim() ?? book.description,
      updatedAt: now()
    } : book)
  };
}

/** Use one of the book's photos as its cover; `undefined` returns to the plain cloth cover. */
export function setBookCoverInSnapshot(snapshot: AppSnapshot, bookId: string, assetId: string | undefined): AppSnapshot {
  if (assetId !== undefined && snapshot.mediaAssets.find((asset) => asset.id === assetId)?.type !== 'photo') {
    throw new Error('Обложкой может быть только фотография.');
  }
  return {
    ...snapshot,
    books: snapshot.books.map((book) => book.id === bookId ? { ...book, coverMediaAssetId: assetId, updatedAt: now() } : book)
  };
}

function renumber(chapters: Chapter[], bookId: string): Chapter[] {
  const ordered = chapters.filter((chapter) => chapter.bookId === bookId).sort((a, b) => a.order - b.order);
  const orders = new Map(ordered.map((chapter, index) => [chapter.id, index + 1]));
  return chapters.map((chapter) => {
    const order = orders.get(chapter.id);
    return order === undefined || order === chapter.order ? chapter : { ...chapter, order };
  });
}

export function createChapterInSnapshot(snapshot: AppSnapshot, bookId: string, input: ChapterInput): { snapshot: AppSnapshot; chapter: Chapter } {
  if (!snapshot.books.some((book) => book.id === bookId)) throw new Error('Книга не найдена.');
  const createdAt = now();
  const siblings = snapshot.chapters.filter((chapter) => chapter.bookId === bookId);
  const chapter: Chapter = {
    id: createId('chapter'),
    bookId,
    title: requireTitle(input.title, 'Добавьте название главы.'),
    description: input.description?.trim() ?? '',
    order: Math.max(0, ...siblings.map((item) => item.order)) + 1,
    createdAt,
    updatedAt: createdAt
  };
  return { chapter, snapshot: { ...snapshot, chapters: [...snapshot.chapters, chapter] } };
}

export function updateChapterInSnapshot(snapshot: AppSnapshot, chapterId: string, patch: Partial<ChapterInput>): AppSnapshot {
  const title = patch.title === undefined ? undefined : requireTitle(patch.title, 'Добавьте название главы.');
  return {
    ...snapshot,
    chapters: snapshot.chapters.map((chapter) => chapter.id === chapterId ? {
      ...chapter,
      title: title ?? chapter.title,
      description: patch.description?.trim() ?? chapter.description,
      updatedAt: now()
    } : chapter)
  };
}

/** Swap a chapter with its neighbour; `-1` moves it closer to the start of the book. */
export function moveChapterInSnapshot(snapshot: AppSnapshot, chapterId: string, direction: -1 | 1): AppSnapshot {
  const chapter = snapshot.chapters.find((item) => item.id === chapterId);
  if (!chapter) return snapshot;
  const ordered = renumber(snapshot.chapters, chapter.bookId)
    .filter((item) => item.bookId === chapter.bookId)
    .sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((item) => item.id === chapterId);
  const neighbour = ordered[index + direction];
  if (!neighbour) return snapshot;
  const updatedAt = now();
  const swapped = new Map([[chapterId, neighbour.order], [neighbour.id, ordered[index].order]]);
  return {
    ...snapshot,
    chapters: renumber(snapshot.chapters, chapter.bookId).map((item) => swapped.has(item.id)
      ? { ...item, order: swapped.get(item.id)!, updatedAt } : item)
  };
}

function referencedMedia(snapshot: AppSnapshot): Set<string> {
  return new Set([
    ...snapshot.perspectives.map((item) => item.mediaAssetId),
    ...snapshot.moments.map((item) => item.narrationMediaAssetId),
    ...snapshot.books.map((item) => item.coverMediaAssetId),
    ...snapshot.drafts.map((item) => item.audioMediaAssetId)
  ].filter((id): id is string => Boolean(id)));
}

/** Remove media that the removed entities used and nothing else still needs. */
function dropOrphanedMedia(snapshot: AppSnapshot, candidates: Iterable<string | undefined>): DeletionResult {
  const stillUsed = referencedMedia(snapshot);
  const removed = new Set([...candidates].filter((id): id is string => Boolean(id) && !stillUsed.has(id!)));
  return {
    snapshot: removed.size ? { ...snapshot, mediaAssets: snapshot.mediaAssets.filter((asset) => !removed.has(asset.id)) } : snapshot,
    removedMediaIds: [...removed]
  };
}

/**
 * Delete moments with their stories, comments and media. An interview answer
 * that became a moment goes too — otherwise it would be rebuilt on the next
 * start — and its question can be asked again.
 */
export function deleteMomentsFromSnapshot(snapshot: AppSnapshot, momentIds: Iterable<string>): DeletionResult {
  const ids = new Set(momentIds);
  const moments = snapshot.moments.filter((moment) => ids.has(moment.id));
  if (!moments.length) return { snapshot, removedMediaIds: [] };
  const memoryIds = new Set(moments.map((moment) => moment.sourceMemoryId).filter((id): id is string => Boolean(id)));
  const removedMemories = snapshot.memories.filter((memory) => memoryIds.has(memory.id));
  const reopenedQuestions = new Set(removedMemories.map((memory) => memory.questionId));
  const answersLost = new Map<string, number>();
  removedMemories.forEach((memory) => answersLost.set(memory.personId, (answersLost.get(memory.personId) ?? 0) + 1));
  const candidates = [
    ...snapshot.perspectives.filter((item) => ids.has(item.momentId)).map((item) => item.mediaAssetId),
    ...moments.map((moment) => moment.narrationMediaAssetId)
  ];
  const next: AppSnapshot = {
    ...snapshot,
    moments: snapshot.moments.filter((moment) => !ids.has(moment.id)),
    perspectives: snapshot.perspectives.filter((item) => !ids.has(item.momentId)),
    reflections: snapshot.reflections.filter((item) => !ids.has(item.momentId)),
    memories: snapshot.memories.filter((memory) => !memoryIds.has(memory.id)),
    questions: snapshot.questions.map((question) => reopenedQuestions.has(question.id) && question.status === 'answered'
      ? { ...question, status: 'planned' } : question),
    people: snapshot.people.map((person) => answersLost.has(person.id)
      ? { ...person, answeredCount: Math.max(0, person.answeredCount - answersLost.get(person.id)!) } : person)
  };
  return dropOrphanedMedia(next, candidates);
}

export function deleteChapterFromSnapshot(snapshot: AppSnapshot, chapterId: string): DeletionResult {
  const chapter = snapshot.chapters.find((item) => item.id === chapterId);
  if (!chapter) return { snapshot, removedMediaIds: [] };
  const result = deleteMomentsFromSnapshot(snapshot, snapshot.moments.filter((moment) => moment.chapterId === chapterId).map((moment) => moment.id));
  return {
    ...result,
    snapshot: { ...result.snapshot, chapters: renumber(result.snapshot.chapters.filter((item) => item.id !== chapterId), chapter.bookId) }
  };
}

export function deleteBookFromSnapshot(snapshot: AppSnapshot, bookId: string): DeletionResult {
  const book = snapshot.books.find((item) => item.id === bookId);
  if (!book) return { snapshot, removedMediaIds: [] };
  const result = deleteMomentsFromSnapshot(snapshot, snapshot.moments.filter((moment) => moment.bookId === bookId).map((moment) => moment.id));
  const books = result.snapshot.books.filter((item) => item.id !== bookId);
  const settings: AppSettings = { ...result.snapshot.settings };
  if (settings.activeBookId === bookId || !books.some((item) => item.id === settings.activeBookId)) {
    if (books[0]) settings.activeBookId = books[0].id;
    else delete settings.activeBookId;
  }
  const withoutBook: AppSnapshot = {
    ...result.snapshot,
    books,
    chapters: result.snapshot.chapters.filter((chapter) => chapter.bookId !== bookId),
    settings
  };
  const cover = dropOrphanedMedia(withoutBook, [book.coverMediaAssetId]);
  return { snapshot: cover.snapshot, removedMediaIds: [...result.removedMediaIds, ...cover.removedMediaIds] };
}

export function createPersonInSnapshot(snapshot: AppSnapshot, input: PersonInput): { snapshot: AppSnapshot; person: Person } {
  const name = requireTitle(input.name, 'Как зовут близкого человека?');
  const relation = requireTitle(input.relation, 'Кем этот человек вам приходится? Например: бабушка, дядя, сестра.');
  const createdAt = now();
  const id = createId('person');
  const questions: Question[] = STARTER_QUESTIONS.map((question, index) => ({
    ...question,
    prompts: [...question.prompts],
    id: createId('question'),
    personId: id,
    status: index === 0 ? 'next' : 'planned',
    order: index + 1
  }));
  const person: Person = {
    id,
    projectId: snapshot.project.id,
    name,
    relation,
    birthYear: validBirthYear(input.birthYear),
    initials: initialsOf(name),
    avatarColor: avatarColorFor(id),
    bio: input.bio?.trim() ?? '',
    answeredCount: 0,
    totalQuestions: questions.length,
    lastActiveAt: createdAt,
    status: 'invited'
  };
  return { person, snapshot: { ...snapshot, people: [...snapshot.people, person], questions: [...snapshot.questions, ...questions] } };
}

export function updatePersonInSnapshot(snapshot: AppSnapshot, personId: string, patch: Partial<PersonInput>): AppSnapshot {
  const name = patch.name === undefined ? undefined : requireTitle(patch.name, 'Как зовут близкого человека?');
  const relation = patch.relation === undefined ? undefined : requireTitle(patch.relation, 'Кем этот человек вам приходится?');
  const birthYear = 'birthYear' in patch ? validBirthYear(patch.birthYear) : undefined;
  return {
    ...snapshot,
    people: snapshot.people.map((person) => person.id === personId ? {
      ...person,
      name: name ?? person.name,
      initials: name ? initialsOf(name) : person.initials,
      relation: relation ?? person.relation,
      birthYear: 'birthYear' in patch ? birthYear : person.birthYear,
      bio: patch.bio?.trim() ?? person.bio
    } : person)
  };
}

/**
 * Remove a person with their questions, drafts and interview answers. Stories
 * they already told stay in the book, just without a signature.
 */
export function deletePersonFromSnapshot(snapshot: AppSnapshot, personId: string): DeletionResult {
  if (!snapshot.people.some((person) => person.id === personId)) return { snapshot, removedMediaIds: [] };
  const memoryIds = new Set(snapshot.memories.filter((memory) => memory.personId === personId).map((memory) => memory.id));
  const drafts = snapshot.drafts.filter((draft) => draft.personId === personId);
  const next: AppSnapshot = {
    ...snapshot,
    people: snapshot.people.filter((person) => person.id !== personId),
    questions: snapshot.questions.filter((question) => question.personId !== personId),
    memories: snapshot.memories.filter((memory) => !memoryIds.has(memory.id)),
    drafts: snapshot.drafts.filter((draft) => draft.personId !== personId),
    moments: snapshot.moments.map((moment) => moment.sourceMemoryId && memoryIds.has(moment.sourceMemoryId)
      ? { ...moment, sourceMemoryId: undefined } : moment),
    perspectives: snapshot.perspectives.map((item) => item.authorId === personId || (item.sourceMemoryId && memoryIds.has(item.sourceMemoryId))
      ? { ...item, authorId: item.authorId === personId ? undefined : item.authorId, sourceMemoryId: item.sourceMemoryId && memoryIds.has(item.sourceMemoryId) ? undefined : item.sourceMemoryId }
      : item),
    reflections: snapshot.reflections.map((item) => item.authorId === personId ? { ...item, authorId: undefined } : item)
  };
  return dropOrphanedMedia(next, drafts.map((draft) => draft.audioMediaAssetId));
}

/** A clean family archive for real use: no demo people, books or answers. Display settings stay. */
export function emptySnapshot(settings: AppSettings, title = 'Наша семья'): AppSnapshot {
  const display: AppSettings = { ...settings };
  delete display.activeBookId;
  return {
    version: 1,
    project: {
      id: createId('project'),
      title: title.trim() || 'Наша семья',
      subtitle: '',
      createdAt: now(),
      inviteCode: createId('invite').slice(-8).toUpperCase()
    },
    people: [],
    questions: [],
    memories: [],
    drafts: [],
    books: [],
    chapters: [],
    moments: [],
    perspectives: [],
    reflections: [],
    mediaAssets: [],
    settings: display
  };
}
