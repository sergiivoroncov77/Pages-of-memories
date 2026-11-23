import { useAppState } from '../../app/AppState';
import { bookMembers } from '../../data/personGroups';
import { useCloudSync } from '../../sync/CloudSync';

/** What tells which books each person takes part in: their stories, the shared books, this phone's names. */
export function usePeopleSources() {
  const { books, moments, perspectives, reflections } = useAppState();
  const cloud = useCloudSync();
  const mine = Object.fromEntries(books.map((book) => [book.id, cloud.myPersonId?.(book.id)]));
  return { moments, perspectives, reflections, members: bookMembers(cloud.books ?? {}, mine) };
}
