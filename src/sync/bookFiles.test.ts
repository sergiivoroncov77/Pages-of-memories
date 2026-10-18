import { describe, expect, it } from 'vitest';
import { createBookInSnapshot, emptySnapshot } from '../data/library';
import { addMediaAssetToSnapshot, addMomentToSnapshot, addPerspectiveToSnapshot, createMediaAsset, createMoment, createPerspective } from '../data/mutations';
import { seedSnapshot } from '../data/seed';
import { storedMediaUrl } from '../lib/mediaStore';
import { bookFileStats } from './bookFiles';
import { freshBookState, parseCloudState } from './cloudState';

function bookWithFiles() {
  const created = createBookInSnapshot(emptySnapshot(seedSnapshot.settings), { title: 'Книга' }, 'Глава');
  let snapshot = created.snapshot;
  const moment = createMoment({ bookId: created.book.id, chapterId: snapshot.chapters[0].id, title: 'Момент' });
  snapshot = addMomentToSnapshot(snapshot, moment);
  ['photo_here', 'photo_cloud', 'voice_new'].forEach((id, index) => {
    snapshot = addMediaAssetToSnapshot(snapshot, createMediaAsset({ type: index === 2 ? 'audio' : 'photo', url: storedMediaUrl(id), mimeType: 'image/jpeg', sizeBytes: 10 }, id));
    snapshot = addPerspectiveToSnapshot(snapshot, createPerspective({ momentId: moment.id, type: index === 2 ? 'audio' : 'photo', content: '', mediaAssetId: id }));
  });
  return { snapshot, bookId: created.book.id };
}

describe('book files', () => {
  it('counts what is on the device, what opens from the cloud and what can be freed', () => {
    const { snapshot, bookId } = bookWithFiles();
    const cloudBook = freshBookState({ files: { photo_here: { fileId: 'f1', size: 1000 }, photo_cloud: { fileId: 'f2', size: 2000 } } });
    expect(bookFileStats(snapshot, bookId, cloudBook, new Set(['photo_here', 'voice_new']))).toEqual({
      count: 3, bytes: 3010, local: 2, localBytes: 1010, cloudOnly: 1, cloudOnlyBytes: 2000, freeable: 1, freeableBytes: 1000, notUploaded: 1
    });
    // A book of this device only: everything is here, nothing is in the cloud.
    expect(bookFileStats(snapshot, bookId, undefined, new Set(['photo_here', 'photo_cloud', 'voice_new']))).toMatchObject({ count: 3, local: 3, cloudOnly: 0, freeable: 0, notUploaded: 0 });
  });

  it('keeps downloading files of books that came before cloud viewing; new books open from the cloud', () => {
    expect(freshBookState().keepFiles).toBe(false);
    const older = parseCloudState(JSON.stringify({ version: 1, books: { b1: { rev: 3, fingerprints: {}, files: { a: { fileId: 'f', size: 1, previewId: 'p', previewSize: 0 } } } } }));
    expect(older.books.b1).toMatchObject({ keepFiles: true, files: { a: { fileId: 'f', size: 1, previewId: 'p', previewSize: 0 } } });
    expect(parseCloudState(JSON.stringify({ version: 1, books: { b1: { rev: 3, fingerprints: {}, files: {}, keepFiles: false } } })).books.b1.keepFiles).toBe(false);
  });
});
