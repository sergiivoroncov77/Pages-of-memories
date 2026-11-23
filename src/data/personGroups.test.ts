import { describe, expect, it } from 'vitest';
import type { Moment, Person, Perspective } from './types';
import { bookMembers, groupPeople } from './personGroups';

const person = (id: string, name: string, relation = 'Участник книги') => ({ id, name, relation } as Person);
const moment = (id: string, bookId: string) => ({ id, bookId } as Moment);
const story = (id: string, momentId: string, authorId: string) => ({ id, momentId, authorId } as Perspective);

describe('groupPeople', () => {
  const moments = [moment('m1', 'a'), moment('m2', 'b'), moment('m3', 'a')];

  it('takes one relative from several books as one person', () => {
    const people = [person('p1', 'Дима', 'Автор книги'), person('p2', 'дима '), person('p3', 'Оля', 'Мама')];
    const groups = groupPeople(people, { moments, perspectives: [story('s1', 'm1', 'p1'), story('s2', 'm2', 'p2'), story('s3', 'm2', 'p2')] });
    expect(groups.map((group) => group.members.map((item) => item.id))).toEqual([['p2', 'p1'], ['p3']]);
    expect(groups[0].person.id).toBe('p2');
    expect([...groups[0].bookIds].sort()).toEqual(['a', 'b']);
  });

  it('keeps apart two people of one name who tell stories in the same book', () => {
    const people = [person('p1', 'Лена'), person('p2', 'Лена')];
    const groups = groupPeople(people, { moments, perspectives: [story('s1', 'm1', 'p1'), story('s2', 'm3', 'p2')] });
    expect(groups).toHaveLength(2);
  });

  it('counts the books a person belongs to, not only the ones they wrote in', () => {
    const members = bookMembers({ b: { people: ['p1'] }, c: { people: [], personId: 'p2' } }, { a: 'p2' });
    const [group] = groupPeople([person('p1', 'Оля'), person('p2', 'Оля')], { moments, perspectives: [], members });
    expect([...group.bookIds].sort()).toEqual(['a', 'b', 'c']);
  });
});
