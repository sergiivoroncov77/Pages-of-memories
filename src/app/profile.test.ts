import { describe, expect, it } from 'vitest';
import { createProfileStore, parseProfile, PROFILE_KEY } from './profile';

const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe('profile on this phone', () => {
  it('starts signed out, signs in with a cleaned name and remembers who the person is in each book', () => {
    const storage = memory();
    const store = createProfileStore(storage);
    expect(store.get()).toBeNull();
    expect(() => store.setName('   ')).toThrow('как вас зовут');
    store.setBookPerson('book_1', 'person_1');
    expect(store.get()).toBeNull();

    expect(store.setName('  Анна   Петровна ')).toMatchObject({ name: 'Анна Петровна', books: {} });
    store.setBookPerson('book_1', 'person_1');
    store.setName('Бабушка Аня');
    const reopened = createProfileStore(storage).get();
    expect(reopened).toMatchObject({ name: 'Бабушка Аня', books: { book_1: 'person_1' } });
  });

  it('ignores a damaged profile instead of failing', () => {
    expect(parseProfile('{not json')).toBeNull();
    expect(parseProfile(JSON.stringify({ name: '' }))).toBeNull();
    expect(parseProfile(JSON.stringify({ name: 'Оля', books: { a: 'p', b: 5 } }))).toMatchObject({ name: 'Оля', books: { a: 'p' } });
    const storage = memory();
    storage.setItem(PROFILE_KEY, '[]');
    expect(createProfileStore(storage).get()).toBeNull();
  });
});
