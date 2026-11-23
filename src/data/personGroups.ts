import type { AppSnapshot, Person } from './types';

/*
 * A relative who tells stories in several books has a record of their own in
 * each of them. On the people page they are one person: records with the same
 * name are taken together when they never meet in one book — two records that
 * do are two different people who share a name.
 */

export interface PersonGroup {
  /** The record the card and the page open: the one with the most stories. */
  person: Person;
  /** Every record of this person, the main one first. */
  members: Person[];
  ids: Set<string>;
  /** Books the person has stories in. */
  bookIds: Set<string>;
}

export const nameKey = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase().replace(/ё/g, 'е');

type Sources = Pick<AppSnapshot, 'moments' | 'perspectives'>;

/** The books each person has stories in. */
export function booksOfPeople({ moments, perspectives }: Sources): Map<string, Set<string>> {
  const bookOf = new Map(moments.map((moment) => [moment.id, moment.bookId]));
  const books = new Map<string, Set<string>>();
  for (const perspective of perspectives) {
    const bookId = bookOf.get(perspective.momentId);
    if (!perspective.authorId || !bookId) continue;
    const set = books.get(perspective.authorId) ?? new Set<string>();
    set.add(bookId);
    books.set(perspective.authorId, set);
  }
  return books;
}

export function groupPeople(people: Person[], sources: Sources): PersonGroup[] {
  const books = booksOfPeople(sources);
  const stories = new Map<string, number>();
  for (const perspective of sources.perspectives) {
    if (perspective.authorId) stories.set(perspective.authorId, (stories.get(perspective.authorId) ?? 0) + 1);
  }
  const groups: PersonGroup[] = [];
  const byName = new Map<string, PersonGroup[]>();
  for (const person of people) {
    const own = books.get(person.id) ?? new Set<string>();
    const key = nameKey(person.name);
    const candidates = key ? byName.get(key) ?? [] : [];
    const group = candidates.find((item) => ![...own].some((bookId) => item.bookIds.has(bookId)));
    if (group) {
      group.members.push(person);
      group.ids.add(person.id);
      own.forEach((bookId) => group.bookIds.add(bookId));
      continue;
    }
    const created: PersonGroup = { person, members: [person], ids: new Set([person.id]), bookIds: new Set(own) };
    groups.push(created);
    if (key) byName.set(key, [...candidates, created]);
  }
  for (const group of groups) {
    group.members.sort((a, b) => (stories.get(b.id) ?? 0) - (stories.get(a.id) ?? 0));
    group.person = group.members[0];
  }
  return groups;
}

/** The group a record belongs to, among the given people. */
export function groupOf(personId: string, people: Person[], sources: Sources): PersonGroup | undefined {
  return groupPeople(people, sources).find((group) => group.ids.has(personId));
}

