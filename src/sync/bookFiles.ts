import type { AppSnapshot } from '../data/types';
import { isStoredMedia } from '../lib/mediaStore';
import { mediaIdsOfBook } from './bookEntities';
import type { CloudBookState } from './cloudState';

/** Photos, voices and videos of a book: where they are and how much they take. */
export interface BookFileStats {
  count: number;
  bytes: number;
  /** On this device. */
  local: number;
  localBytes: number;
  /** Only in the storage: they open from the cloud. */
  cloudOnly: number;
  cloudOnlyBytes: number;
  /** Here and in the storage: they can go from this device. */
  freeable: number;
  freeableBytes: number;
  /** Here and not uploaded yet: they stay. */
  notUploaded: number;
}

/** `stored`: ids of the files whose bytes are on this device. Demo pictures and links are not files. */
export function bookFileStats(snapshot: AppSnapshot, bookId: string, cloudBook: CloudBookState | undefined, stored: ReadonlySet<string>): BookFileStats {
  const ids = mediaIdsOfBook(snapshot, bookId);
  const stats: BookFileStats = { count: 0, bytes: 0, local: 0, localBytes: 0, cloudOnly: 0, cloudOnlyBytes: 0, freeable: 0, freeableBytes: 0, notUploaded: 0 };
  snapshot.mediaAssets.forEach((asset) => {
    if (!ids.has(asset.id) || !isStoredMedia(asset)) return;
    const file = cloudBook?.files[asset.id];
    const size = file?.size ?? asset.sizeBytes ?? 0;
    const here = stored.has(asset.id);
    if (!here && !file) return;
    stats.count += 1;
    stats.bytes += size;
    if (here) {
      stats.local += 1;
      stats.localBytes += size;
      if (file) { stats.freeable += 1; stats.freeableBytes += size; } else if (cloudBook) stats.notUploaded += 1;
    } else {
      stats.cloudOnly += 1;
      stats.cloudOnlyBytes += size;
    }
  });
  return stats;
}
