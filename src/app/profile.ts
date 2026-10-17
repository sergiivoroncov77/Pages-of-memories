import { useSyncExternalStore } from 'react';
import { avatarColorFor, initialsOf } from '../data/library';

/*
 * Who uses this phone: the name a person calls themselves, asked once on the
 * first start. It stays with the phone — a fresh start of the archive or a
 * backup from someone else does not change who you are. In every book the
 * person signs as a narrator of their own, whose name can differ from this one.
 */

export interface Profile {
  name: string;
  createdAt: string;
  /** Who this person is in each book on the phone (book id → person id). */
  books: Record<string, string>;
}

export const PROFILE_KEY = 'family-stories:profile:v1';
export const MAX_NAME_LENGTH = 80;

export function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseProfile(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.name !== 'string' || !cleanName(value.name)) return null;
    const books = isRecord(value.books) ? Object.fromEntries(Object.entries(value.books)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {};
    return { name: cleanName(value.name), createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(), books };
  } catch {
    return null;
  }
}

export interface ProfileStore {
  get(): Profile | null;
  /** Sign in on this phone, or change the name. */
  setName(name: string): Profile;
  /** Remember who this person is in a book. */
  setBookPerson(bookId: string, personId: string): void;
  subscribe(listener: () => void): () => void;
}

export function createProfileStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): ProfileStore {
  let profile: Profile | null = null;
  try { profile = parseProfile(storage?.getItem(PROFILE_KEY) ?? null); } catch { /* storage blocked: memory only */ }
  const listeners = new Set<() => void>();
  const save = (next: Profile) => {
    profile = next;
    try { storage?.setItem(PROFILE_KEY, JSON.stringify(next)); } catch { /* keep in memory */ }
    listeners.forEach((listener) => listener());
    return next;
  };
  return {
    get: () => profile,
    setName(name) {
      const clean = cleanName(name);
      if (!clean) throw new Error('Напишите, как вас зовут.');
      return save(profile ? { ...profile, name: clean } : { name: clean, createdAt: new Date().toISOString(), books: {} });
    },
    setBookPerson(bookId, personId) {
      if (!profile || profile.books[bookId] === personId) return;
      save({ ...profile, books: { ...profile.books, [bookId]: personId } });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}

export const profileStore = createProfileStore();

export function useProfile(): Profile | null {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get, profileStore.get);
}

/** How the profile looks where there is no narrator record: the header, the profile page. */
export function profileAvatar(name: string) {
  return { name, initials: initialsOf(name), avatarColor: avatarColorFor(name), status: 'active' as const };
}
