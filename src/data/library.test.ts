import { describe, expect, it } from 'vitest';
import {
  activeBookOf,
  chronologicalMoments,
  createBookInSnapshot,
  createChapterInSnapshot,
  createPersonInSnapshot,
  deleteBookFromSnapshot,
  deleteChapterFromSnapshot,
  deleteMomentsFromSnapshot,
  deletePerspectiveFromSnapshot,
  deletePersonFromSnapshot,
  emptySnapshot,
  initialsOf,
  moveChapterInSnapshot,
  resignInBook,
  STARTER_QUESTIONS,
  updateBookInSnapshot,
  updateChapterInSnapshot,
  updatePersonInSnapshot
} from './library';
import { addMomentToSnapshot, addPerspectiveToSnapshot, createMoment, createPerspective, ensureMemoryMoments, publishMemoryToSnapshot } from './mutations';
import { coverColorOf } from './coverColors';
import { normalizeSnapshotValue } from './repository';
import { seedSnapshot } from './seed';

const demo = () => ensureMemoryMoments(structuredClone(seedSnapshot));

describe('books', () => {
  it('keeps the cover colour chosen for a book; without one the shelf place gives it', () => {
    const start = emptySnapshot(seedSnapshot.settings);
    const first = createBookInSnapshot(start, { title: 'Первая' });
    const second = createBookInSnapshot(first.snapshot, { title: 'Вторая', coverColor: 'red' });
    expect(second.book.coverColor).toBe('red');
    expect(coverColorOf(first.book, second.snapshot.books).id).toBe('green');
    expect(coverColorOf(second.book, second.snapshot.books)).toMatchObject({ id: 'red', name: 'Красная' });
    const recoloured = updateBookInSnapshot(second.snapshot, first.book.id, { coverColor: 'ochre' });
    expect(recoloured.books.find((book) => book.id === first.book.id)?.coverColor).toBe('ochre');
    // Not a colour of the palette: the book keeps its own.
    expect(updateBookInSnapshot(recoloured, first.book.id, { coverColor: 'pink' }).books.find((book) => book.id === first.book.id)?.coverColor).toBe('ochre');
    expect(normalizeSnapshotValue(recoloured).books.find((book) => book.id === first.book.id)?.coverColor).toBe('ochre');
    // An unknown colour from a newer app falls back to the shelf's.
    expect(coverColorOf({ id: first.book.id, coverColor: 'silver' }, second.snapshot.books).id).toBe('green');
  });

  it('creates a book with a first chapter and makes it the active one', () => {
    const { snapshot, book } = createBookInSnapshot(demo(), { title: '  Книга бабушки ', subtitle: 'Лето в деревне' }, 'Детство');
    expect(book).toMatchObject({ title: 'Книга бабушки', subtitle: 'Лето в деревне', projectId: seedSnapshot.project.id });
    expect(activeBookOf(snapshot)?.id).toBe(book.id);
    expect(snapshot.chapters.filter((chapter) => chapter.bookId === book.id)).toMatchObject([{ title: 'Детство', order: 1 }]);
    // The active book survives the normalisation that runs on every load.
    expect(normalizeSnapshotValue(snapshot).settings.activeBookId).toBe(book.id);
  });

  it('rejects an empty title and falls back to the first book for an unknown active id', () => {
    expect(() => createBookInSnapshot(demo(), { title: '   ' })).toThrow('название книги');
    const snapshot = { ...demo(), settings: { ...demo().settings, activeBookId: 'book_missing' } };
    expect(activeBookOf(snapshot)?.id).toBe('book_family_demo');
    expect(normalizeSnapshotValue(snapshot).settings.activeBookId).toBeUndefined();
  });

  it('renames a book', () => {
    const snapshot = updateBookInSnapshot(demo(), 'book_family_demo', { title: 'Новая книга', description: 'Описание' });
    expect(snapshot.books[0]).toMatchObject({ title: 'Новая книга', description: 'Описание' });
    expect(() => updateBookInSnapshot(demo(), 'book_family_demo', { title: '' })).toThrow();
  });

  it('deletes a book with its chapters, moments, stories, comments, interview answers and unused media', () => {
    const { snapshot: withSecond, book } = createBookInSnapshot(demo(), { title: 'Вторая' }, 'Начало');
    const { snapshot, removedMediaIds } = deleteBookFromSnapshot(withSecond, 'book_family_demo');
    expect(snapshot.books.map((item) => item.id)).toEqual([book.id]);
    expect(snapshot.settings.activeBookId).toBe(book.id);
    expect(snapshot.chapters.every((chapter) => chapter.bookId === book.id)).toBe(true);
    expect(snapshot.moments).toHaveLength(0);
    expect(snapshot.perspectives).toHaveLength(0);
    expect(snapshot.reflections).toHaveLength(0);
    expect(snapshot.memories).toHaveLength(0);
    expect(snapshot.questions.filter((question) => question.status === 'answered')).toHaveLength(0);
    expect(snapshot.people.every((person) => person.answeredCount === 0)).toBe(true);
    expect(removedMediaIds.length).toBeGreaterThan(0);
    expect(snapshot.mediaAssets.some((asset) => removedMediaIds.includes(asset.id))).toBe(false);
    // Nothing comes back on the next start.
    const reloaded = normalizeSnapshotValue(snapshot);
    expect(reloaded.moments).toHaveLength(0);
    expect(reloaded.books).toHaveLength(1);
  });

  it('can delete the last book', () => {
    const { snapshot } = deleteBookFromSnapshot(demo(), 'book_family_demo');
    expect(snapshot.books).toHaveLength(0);
    expect(snapshot.settings.activeBookId).toBeUndefined();
    expect(activeBookOf(snapshot)).toBeUndefined();
  });
});

describe('chapters', () => {
  it('adds chapters at the end and edits them', () => {
    const { snapshot, chapter } = createChapterInSnapshot(demo(), 'book_family_demo', { title: 'Война и мир', description: 'Годы испытаний' });
    const orders = snapshot.chapters.filter((item) => item.bookId === 'book_family_demo').map((item) => item.order);
    expect(chapter.order).toBe(Math.max(...orders));
    const renamed = updateChapterInSnapshot(snapshot, chapter.id, { title: 'Годы войны' });
    expect(renamed.chapters.find((item) => item.id === chapter.id)).toMatchObject({ title: 'Годы войны', description: 'Годы испытаний' });
    expect(() => createChapterInSnapshot(demo(), 'book_family_demo', { title: ' ' })).toThrow('название главы');
    expect(() => createChapterInSnapshot(demo(), 'book_missing', { title: 'Глава' })).toThrow('Книга не найдена');
  });

  it('moves a chapter up and down without gaps in numbering', () => {
    const titles = (snapshot: ReturnType<typeof demo>) => snapshot.chapters.filter((item) => item.bookId === 'book_family_demo')
      .sort((a, b) => a.order - b.order).map((item) => item.id);
    const before = titles(demo());
    const moved = moveChapterInSnapshot(demo(), before[1], -1);
    expect(titles(moved)).toEqual([before[1], before[0], ...before.slice(2)]);
    expect(moved.chapters.filter((item) => item.bookId === 'book_family_demo').map((item) => item.order).sort()).toEqual(before.map((_, index) => index + 1));
    expect(moveChapterInSnapshot(demo(), before[0], -1)).toEqual(demo());
  });

  it('deletes a chapter with its moments and renumbers the rest', () => {
    const snapshot = demo();
    const first = snapshot.chapters.find((item) => item.order === 1 && item.bookId === 'book_family_demo')!;
    const momentIds = snapshot.moments.filter((moment) => moment.chapterId === first.id).map((moment) => moment.id);
    const { snapshot: next } = deleteChapterFromSnapshot(snapshot, first.id);
    expect(next.chapters.some((item) => item.id === first.id)).toBe(false);
    expect(next.moments.some((moment) => momentIds.includes(moment.id))).toBe(false);
    expect(next.perspectives.some((item) => momentIds.includes(item.momentId))).toBe(false);
    expect(next.chapters.filter((item) => item.bookId === 'book_family_demo').map((item) => item.order).sort()).toEqual([1, 2]);
  });
});

describe('moments', () => {
  it('reads a chapter from the earliest date to the latest, undated moments after them in the order added', () => {
    const moment = (id: string, occurredAt: string | undefined, createdAt: string) => ({ id, occurredAt, createdAt });
    const ordered = chronologicalMoments([
      moment('undated-late', undefined, '2026-03-02T10:00:00Z'),
      moment('wedding', '1996-01-20', '2026-03-01T10:00:00Z'),
      moment('undated-early', undefined, '2026-01-05T10:00:00Z'),
      moment('summer', '1950-07-15', '2026-03-03T10:00:00Z'),
      moment('same-day-second', '1996-01-20', '2026-03-04T10:00:00Z')
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['summer', 'wedding', 'same-day-second', 'undated-early', 'undated-late']);
  });

  it('reopens the interview question of a deleted interview moment', () => {
    const snapshot = demo();
    const moment = snapshot.moments.find((item) => item.sourceMemoryId === 'memory_summer')!;
    const { snapshot: next } = deleteMomentsFromSnapshot(snapshot, [moment.id]);
    expect(next.memories.some((memory) => memory.id === 'memory_summer')).toBe(false);
    expect(next.questions.find((question) => question.id === 'question_childhood')?.status).toBe('planned');
    expect(next.people.find((person) => person.id === 'person_anna')?.answeredCount)
      .toBe(snapshot.people.find((person) => person.id === 'person_anna')!.answeredCount - 1);
    expect(normalizeSnapshotValue(next).moments.some((item) => item.id === moment.id)).toBe(false);
  });

  it('deletes the main story without putting another in its place', () => {
    // Not an interview moment: there the main story is the answer itself and is changed in the interview.
    const start = demo();
    const chapter = start.chapters[0];
    const moment = createMoment({ bookId: chapter.bookId, chapterId: chapter.id, title: 'Дача' });
    let snapshot = addMomentToSnapshot(start, moment);
    snapshot = addPerspectiveToSnapshot(snapshot, createPerspective({ momentId: moment.id, type: 'text', content: 'Основной', isPrimary: true }, 'perspective_main'));
    snapshot = addPerspectiveToSnapshot(snapshot, createPerspective({ momentId: moment.id, type: 'text', content: 'Дополнение' }, 'perspective_addition'));
    const main = 'perspective_main';
    expect(snapshot.moments.find((item) => item.id === moment.id)?.primaryPerspectiveId).toBe(main);
    const { snapshot: next } = deletePerspectiveFromSnapshot(snapshot, main);
    expect(next.perspectives.some((item) => item.id === main)).toBe(false);
    expect(next.moments.find((item) => item.id === moment.id)?.primaryPerspectiveId).toBeUndefined();
    expect(next.perspectives.filter((item) => item.momentId === moment.id).length).toBeGreaterThan(0);
    expect(next.perspectives.filter((item) => item.momentId === moment.id).every((item) => !item.isPrimary)).toBe(true);
    // And it stays that way after a reload.
    expect(normalizeSnapshotValue(next).moments.find((item) => item.id === moment.id)?.primaryPerspectiveId).toBeUndefined();
  });

  it('keeps media still used elsewhere', () => {
    const snapshot = demo();
    const used = snapshot.perspectives.find((item) => item.mediaAssetId)!;
    const twin = { ...snapshot.perspectives.find((item) => item.momentId !== used.momentId)!, id: 'perspective_twin', mediaAssetId: used.mediaAssetId, type: used.type };
    const { removedMediaIds, snapshot: next } = deleteMomentsFromSnapshot({ ...snapshot, perspectives: [...snapshot.perspectives, twin] }, [used.momentId]);
    expect(removedMediaIds).not.toContain(used.mediaAssetId);
    expect(next.mediaAssets.some((asset) => asset.id === used.mediaAssetId)).toBe(true);
  });
});

describe('a name of its own in one book', () => {
  it('moves only the person\'s own words in that book to the new narrator', () => {
    const snapshot = demo();
    const book = snapshot.books[0];
    const other = createBookInSnapshot(snapshot, { title: 'Вторая книга' }, 'Глава').snapshot;
    const otherBook = other.books.at(-1)!;
    const momentHere = other.moments.find((moment) => moment.bookId === book.id)!;
    const chapterThere = other.chapters.find((chapter) => chapter.bookId === otherBook.id)!;
    const momentThere = { ...momentHere, id: 'moment_there', bookId: otherBook.id, chapterId: chapterThere.id };
    const story = (id: string, momentId: string) => ({ id, momentId, authorId: 'person_anna', type: 'text' as const, content: id, createdAt: '2026-01-01T00:00:00.000Z', isPrimary: false });
    const base = { ...other, moments: [...other.moments, momentThere],
      perspectives: [story('mine_here', momentHere.id), story('theirs_here', momentHere.id), story('mine_there', momentThere.id)],
      reflections: [{ id: 'note_here', momentId: momentHere.id, authorId: 'person_anna', text: 'Отклик', createdAt: '2026-01-01T00:00:00.000Z' }] };
    const next = resignInBook(base, book.id, 'person_anna', 'person_anna_2', (_type, id) => id !== 'theirs_here');
    const author = (id: string) => [...next.perspectives, ...next.reflections].find((item) => item.id === id)?.authorId;
    expect([author('mine_here'), author('note_here'), author('theirs_here'), author('mine_there')])
      .toEqual(['person_anna_2', 'person_anna_2', 'person_anna', 'person_anna']);
  });
});

describe('people', () => {
  it('adds a person with a starter interview', () => {
    const { snapshot, person } = createPersonInSnapshot(demo(), { name: 'Вера Николаевна', relation: 'Прабабушка', birthYear: 1931 });
    expect(person).toMatchObject({ initials: 'ВН', status: 'invited', answeredCount: 0, totalQuestions: STARTER_QUESTIONS.length });
    const questions = snapshot.questions.filter((question) => question.personId === person.id);
    expect(questions).toHaveLength(STARTER_QUESTIONS.length);
    expect(questions[0].status).toBe('next');
    // An interview with the new person can be published right away.
    const published = publishMemoryToSnapshot(snapshot, { personId: person.id, questionId: questions[0].id, transcript: 'Мы жили у реки.', durationSeconds: 30, tags: [] });
    expect(published.snapshot.moments.some((moment) => moment.sourceMemoryId === published.memory.id)).toBe(true);
    expect(normalizeSnapshotValue(snapshot).people.some((item) => item.id === person.id)).toBe(true);
  });

  it('validates names and birth years', () => {
    expect(() => createPersonInSnapshot(demo(), { name: '', relation: 'Мама' })).toThrow('Как зовут');
    expect(() => createPersonInSnapshot(demo(), { name: 'Оля', relation: ' ' })).toThrow('приходится');
    expect(() => createPersonInSnapshot(demo(), { name: 'Оля', relation: 'Мама', birthYear: 1700 })).toThrow('Год рождения');
    expect(initialsOf('анна-мария петрова')).toBe('АМ');
    expect(initialsOf('Дима')).toBe('Д');
  });

  it('edits a person', () => {
    const snapshot = updatePersonInSnapshot(demo(), 'person_anna', { name: 'Анна Ивановна', birthYear: undefined });
    expect(snapshot.people.find((person) => person.id === 'person_anna')).toMatchObject({ name: 'Анна Ивановна', initials: 'АИ', birthYear: undefined });
  });

  it('removes a person but keeps their stories in the book without a signature', () => {
    const snapshot = demo();
    const stories = snapshot.perspectives.filter((item) => item.authorId === 'person_anna');
    const { snapshot: next } = deletePersonFromSnapshot(snapshot, 'person_anna');
    expect(next.people.some((person) => person.id === 'person_anna')).toBe(false);
    expect(next.questions.some((question) => question.personId === 'person_anna')).toBe(false);
    expect(next.memories.some((memory) => memory.personId === 'person_anna')).toBe(false);
    const kept = next.perspectives.filter((item) => stories.some((story) => story.id === item.id));
    expect(kept).toHaveLength(stories.length);
    expect(kept.every((item) => item.authorId === undefined && item.sourceMemoryId === undefined)).toBe(true);
    const reloaded = normalizeSnapshotValue(next);
    expect(reloaded.perspectives.filter((item) => stories.some((story) => story.id === item.id))).toHaveLength(stories.length);
  });
});

describe('a fresh start', () => {
  it('has no demo content but keeps display settings and works with the rest of the app', () => {
    const fresh = emptySnapshot({ ...seedSnapshot.settings, theme: 'dark', activeBookId: 'book_family_demo' }, 'Семья Ивановых');
    expect(fresh.project.title).toBe('Семья Ивановых');
    expect(fresh.settings).toMatchObject({ theme: 'dark' });
    expect(fresh.settings.activeBookId).toBeUndefined();
    const reloaded = normalizeSnapshotValue(fresh);
    expect(reloaded.books).toEqual([]);
    expect(reloaded.people).toEqual([]);
    const { snapshot, book } = createBookInSnapshot(reloaded, { title: 'Наша книга' }, 'Глава первая');
    const chapter = snapshot.chapters[0];
    const withMoment = addMomentToSnapshot(snapshot, createMoment({ bookId: book.id, chapterId: chapter.id, title: 'Первый снег' }));
    expect(normalizeSnapshotValue(withMoment).moments).toHaveLength(1);
  });
});
