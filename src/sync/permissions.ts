import type { AppSnapshot } from '../data/types';
import { entityKey, type EntityType } from './bookEntities';
import type { CloudBookState } from './cloudState';

export interface DeletionTarget {
  type: 'chapter' | 'moment' | 'perspective' | 'reflection' | 'media';
  id: string;
}

/** Who added a record of a shared book, as far as this device knows. */
function ownerOf(book: CloudBookState, memberId: string, type: EntityType, id: string): string {
  const key = entityKey(type, id);
  // A record this phone never exchanged is its own; an exchanged one without a known author is the creator's.
  return book.owners[key] ?? (key in book.fingerprints ? book.creatorId : memberId);
}

/**
 * Whether this device may change a story or a reflection. In a shared book only
 * whoever added it changes the words; on a book of this device alone, anything.
 */
export function canEdit(book: CloudBookState | undefined, memberId: string | undefined, target: { type: 'perspective' | 'reflection'; id: string }): boolean {
  if (!book || book.detached || !memberId) return true;
  return ownerOf(book, memberId, target.type, target.id) === memberId;
}

/**
 * Why this phone may not delete a record of a shared book, or null when it may.
 * It mirrors the storage: a member deletes only what they added, and a moment
 * or a chapter only when nothing someone else added is inside; the book's
 * creator (and the storage owner) delete anything.
 */
export function deletionBlocker(snapshot: AppSnapshot, book: CloudBookState | undefined, memberId: string | undefined, target: DeletionTarget): string | null {
  if (!book || book.detached || !memberId || book.canManage) return null;
  const who = `только создатель книги${book.creatorName ? ` — ${book.creatorName}` : ''}`;
  const mine = (type: EntityType, id: string) => ownerOf(book, memberId, type, id) === memberId;
  const othersInside = (momentId: string) =>
    snapshot.perspectives.some((item) => item.momentId === momentId && !mine('perspective', item.id))
    || snapshot.reflections.some((item) => item.momentId === momentId && !mine('reflection', item.id));

  if (target.type === 'chapter') {
    if (!mine('chapter', target.id)) return `Эту главу добавили не вы. Удалить её может ${who}.`;
    const moments = snapshot.moments.filter((moment) => moment.chapterId === target.id);
    return moments.some((moment) => !mine('moment', moment.id) || othersInside(moment.id))
      ? `В главе есть то, что добавили другие участники. Удалить её целиком может ${who}.` : null;
  }
  if (target.type === 'moment') {
    if (!mine('moment', target.id)) return `Этот момент добавили не вы. Удалить его может ${who}.`;
    return othersInside(target.id)
      ? `В моменте есть рассказы или отклики других участников. Удалить его целиком может ${who}; свои рассказы можно удалить по отдельности.` : null;
  }
  return mine(target.type, target.id) ? null : `Это добавили не вы. Удалить может ${who}.`;
}

/** Titles of shared books that show this person: deleting them here would unsign their stories for everyone. */
export function sharedBooksWithPerson(snapshot: AppSnapshot, books: Record<string, CloudBookState>, personId: string): string[] {
  return snapshot.books.filter((book) => {
    const shared = books[book.id];
    if (!shared || shared.detached) return false;
    if (shared.people.includes(personId)) return true;
    const moments = new Set(snapshot.moments.filter((moment) => moment.bookId === book.id).map((moment) => moment.id));
    return [...snapshot.perspectives, ...snapshot.reflections].some((item) => moments.has(item.momentId) && item.authorId === personId);
  }).map((book) => book.title);
}

/**
 * Why this phone may not rename a person of a shared book, or null. Like the
 * storage: a member renames only themselves and people they added; the
 * creator renames anyone.
 */
export function renameBlocker(books: Record<string, CloudBookState>, memberId: string, personId: string): string | null {
  const key = entityKey('person', personId);
  for (const book of Object.values(books)) {
    if (book.detached || book.canManage || book.personId === personId) continue;
    const exchanged = key in book.fingerprints;
    if (!exchanged && !book.people.includes(personId)) continue;
    const owner = book.owners[key] ?? (exchanged ? book.creatorId : memberId);
    if (owner !== memberId) {
      return `Этот человек есть в общей книге «${book.title ?? 'без названия'}». Его имя может изменить он сам или создатель книги${book.creatorName ? ` — ${book.creatorName}` : ''}.`;
    }
  }
  return null;
}
