import { createIndexedDbMediaStore, createMemoryMediaStore, type MediaBlobStore } from '../mediaStore';

/**
 * A family's own background music for a chapter film, kept on this device in
 * a database of its own: the book's media cleanup never touches it, and it is
 * not sent to relatives or to the cloud.
 */
let store: MediaBlobStore | undefined;
export function filmMusicStore(): MediaBlobStore {
  store ??= typeof indexedDB === 'undefined' ? createMemoryMediaStore() : createIndexedDbMediaStore(indexedDB, 'family-stories-film-music');
  return store;
}

/** The chapter's own music, as the file that was chosen (its name is kept). */
export async function loadChapterMusic(chapterId: string): Promise<File | null> {
  const blob = await filmMusicStore().get(chapterId).catch(() => undefined);
  if (!blob) return null;
  return blob instanceof File ? blob : new File([blob], 'Своя музыка', { type: blob.type });
}

export const saveChapterMusic = (chapterId: string, file: File) => filmMusicStore().put(chapterId, file);
export const removeChapterMusic = (chapterId: string) => filmMusicStore().delete(chapterId);
