import { deleteBookFromSnapshot, deletePersonFromSnapshot, type DeletionResult } from './library';
import { ensureMemoryMoments } from './mutations';
import { normalizeSnapshotValue } from './repository';
import { seedSnapshot } from './seed';
import type { AppSnapshot } from './types';

/*
 * The demo family and its book: a sample to look around the app. It is off by
 * default; the settings add it or take it away without touching the family's
 * own books and people.
 */

export const DEMO_BOOK_ID = 'book_family_demo';

const COLLECTIONS = ['people', 'questions', 'memories', 'drafts', 'books', 'chapters', 'moments', 'perspectives', 'reflections', 'mediaAssets'] as const;
type Collection = typeof COLLECTIONS[number];
type DemoIds = Record<Collection, Set<string>>;

let cached: { snapshot: AppSnapshot; ids: DemoIds } | undefined;

function demo() {
  if (!cached) {
    const snapshot = normalizeSnapshotValue(ensureMemoryMoments(structuredClone(seedSnapshot)));
    const ids = Object.fromEntries(COLLECTIONS.map((name) => [name, new Set(snapshot[name].map((item) => item.id))])) as DemoIds;
    cached = { snapshot, ids };
  }
  return cached;
}

export function hasDemo(snapshot: AppSnapshot): boolean {
  const { ids } = demo();
  return snapshot.books.some((book) => ids.books.has(book.id)) || snapshot.people.some((person) => ids.people.has(person.id));
}

/** The family's own records that sit inside the demo book or belong to the demo people. */
export function demoDependents(snapshot: AppSnapshot): number {
  const { ids } = demo();
  const own = <T extends { id: string }>(name: Collection, items: T[]) => items.filter((item) => !ids[name].has(item.id));
  const demoPerson = (id: string | undefined) => Boolean(id && ids.people.has(id));
  const demoMedia = (id: string | undefined) => Boolean(id && ids.mediaAssets.has(id));
  return [
    ...own('questions', snapshot.questions).filter((item) => demoPerson(item.personId)),
    ...own('memories', snapshot.memories).filter((item) => demoPerson(item.personId)),
    ...own('drafts', snapshot.drafts).filter((item) => demoPerson(item.personId)),
    ...own('books', snapshot.books).filter((item) => demoMedia(item.coverMediaAssetId)),
    ...own('chapters', snapshot.chapters).filter((item) => ids.books.has(item.bookId)),
    ...own('moments', snapshot.moments).filter((item) => ids.books.has(item.bookId) || ids.chapters.has(item.chapterId)
      || Boolean(item.sourceMemoryId && ids.memories.has(item.sourceMemoryId)) || demoMedia(item.narrationMediaAssetId)),
    ...own('perspectives', snapshot.perspectives).filter((item) => ids.moments.has(item.momentId) || demoPerson(item.authorId) || demoMedia(item.mediaAssetId)),
    ...own('reflections', snapshot.reflections).filter((item) => ids.moments.has(item.momentId) || demoPerson(item.authorId))
  ].length;
}

/** Put the demo family and its book next to the family's own and open it. */
export function addDemo(snapshot: AppSnapshot): AppSnapshot {
  const base = demo().snapshot;
  const projectId = snapshot.project.id;
  const merged = Object.fromEntries(COLLECTIONS.map((name) => {
    const present = new Set(snapshot[name].map((item) => item.id));
    const added = base[name].filter((item) => !present.has(item.id))
      .map((item) => (name === 'people' || name === 'books' ? { ...structuredClone(item), projectId } : structuredClone(item)));
    return [name, [...snapshot[name], ...added]];
  })) as Pick<AppSnapshot, Collection>;
  return normalizeSnapshotValue({ ...snapshot, ...merged, settings: { ...snapshot.settings, demoBook: true, activeBookId: DEMO_BOOK_ID } });
}

/** Take the demo away, with whatever was added inside the demo book or for the demo people. */
export function removeDemo(snapshot: AppSnapshot): DeletionResult {
  const { ids } = demo();
  let result = deleteBookFromSnapshot(snapshot, DEMO_BOOK_ID);
  const removedMediaIds = [...result.removedMediaIds];
  ids.people.forEach((personId) => {
    result = deletePersonFromSnapshot(result.snapshot, personId);
    removedMediaIds.push(...result.removedMediaIds);
  });
  const rest = Object.fromEntries(COLLECTIONS.filter((name) => name !== 'mediaAssets')
    .map((name) => [name, (result.snapshot[name] as { id: string }[]).filter((item) => !ids[name].has(item.id))]));
  const settings = { ...result.snapshot.settings };
  delete settings.demoBook;
  const next = normalizeSnapshotValue({ ...result.snapshot, ...rest, settings } as AppSnapshot);
  // Demo pictures nothing uses any more go too; the family's own files stay.
  const used = new Set([
    ...next.perspectives.map((item) => item.mediaAssetId),
    ...next.moments.map((item) => item.narrationMediaAssetId),
    ...next.books.map((item) => item.coverMediaAssetId),
    ...next.drafts.map((item) => item.audioMediaAssetId)
  ]);
  const gone = next.mediaAssets.filter((asset) => ids.mediaAssets.has(asset.id) && !used.has(asset.id)).map((asset) => asset.id);
  return {
    snapshot: gone.length ? { ...next, mediaAssets: next.mediaAssets.filter((asset) => !gone.includes(asset.id)) } : next,
    removedMediaIds: [...new Set([...removedMediaIds, ...gone])]
  };
}

/**
 * The demo is shown only when someone turned it on. An archive opened from an
 * earlier version loses it on start — unless the family added something of
 * their own inside it or the demo book is shared, then the settings switch
 * takes it away.
 */
export function dropUnusedDemo(snapshot: AppSnapshot, sharedBookIds: ReadonlySet<string>): AppSnapshot {
  if (snapshot.settings.demoBook || !hasDemo(snapshot) || sharedBookIds.has(DEMO_BOOK_ID) || demoDependents(snapshot) > 0) return snapshot;
  return removeDemo(snapshot).snapshot;
}
