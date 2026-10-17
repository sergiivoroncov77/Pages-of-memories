import { describe, expect, it } from 'vitest';
import { freshBookState } from './cloudState';
import { renameBlocker } from './permissions';

describe('renaming people of a shared book', () => {
  const book = freshBookState({ title: 'Книга бабушки', creatorId: 'member_owner', creatorName: 'Сергей', canManage: false, personId: 'person_me',
    people: ['person_me', 'person_grandma', 'person_mine'],
    fingerprints: { 'person:person_grandma': 'x', 'person:person_mine': 'y' },
    owners: { 'person:person_mine': 'member_me' } });

  it('lets a member rename only themselves and people they added; the creator anyone', () => {
    expect(renameBlocker({ book_1: book }, 'member_me', 'person_me')).toBeNull();
    expect(renameBlocker({ book_1: book }, 'member_me', 'person_mine')).toBeNull();
    expect(renameBlocker({ book_1: book }, 'member_me', 'person_grandma')).toContain('создатель книги — Сергей');
    expect(renameBlocker({ book_1: { ...book, canManage: true } }, 'member_me', 'person_grandma')).toBeNull();
    // Off this phone, or not in any shared book: nothing to protect.
    expect(renameBlocker({ book_1: { ...book, detached: true } }, 'member_me', 'person_grandma')).toBeNull();
    expect(renameBlocker({ book_1: book }, 'member_me', 'person_local')).toBeNull();
  });
});
