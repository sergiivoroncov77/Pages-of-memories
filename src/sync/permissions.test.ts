import { describe, expect, it } from 'vitest';
import { freshBookState } from './cloudState';
import { canEdit, renameBlocker } from './permissions';

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

describe('changing the words of a shared book', () => {
  const book = freshBookState({ title: 'Книга бабушки', creatorId: 'member_owner', creatorName: 'Сергей', canManage: true, personId: 'person_owner',
    fingerprints: { 'perspective:story_mama': 'x', 'perspective:story_old': 'y', 'reflection:note_mama': 'z' },
    owners: { 'perspective:story_mama': 'member_mama', 'reflection:note_mama': 'member_mama' } });

  it('lets only whoever added a story or a reflection change it, even with the creator watching', () => {
    expect(canEdit(book, 'member_mama', { type: 'perspective', id: 'story_mama' })).toBe(true);
    expect(canEdit(book, 'member_mama', { type: 'reflection', id: 'note_mama' })).toBe(true);
    // The creator manages the book, but someone else's words stay theirs.
    expect(canEdit(book, 'member_owner', { type: 'perspective', id: 'story_mama' })).toBe(false);
    // Written before authors were kept: the creator's. Not sent yet: this device's own.
    expect(canEdit(book, 'member_owner', { type: 'perspective', id: 'story_old' })).toBe(true);
    expect(canEdit(book, 'member_mama', { type: 'perspective', id: 'story_old' })).toBe(false);
    expect(canEdit(book, 'member_mama', { type: 'perspective', id: 'story_new' })).toBe(true);
    // A book of this device alone: everything is its own.
    expect(canEdit(undefined, 'member_mama', { type: 'perspective', id: 'story_mama' })).toBe(true);
  });
});
