import { useEffect, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { onFilesChanged } from '../../lib/cloudMedia';
import { mediaStore } from '../../lib/mediaStore';
import { bookFileStats, type BookFileStats } from '../../sync/bookFiles';
import { useCloudSync } from '../../sync/CloudSync';

/** Ids of the files on this device, read again whenever files come or go. */
export function useStoredMediaIds(): Set<string> | null {
  const { snapshot } = useAppState();
  const [stored, setStored] = useState<Set<string> | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => onFilesChanged(() => setVersion((count) => count + 1)), []);
  useEffect(() => {
    let active = true;
    mediaStore().keys().then((keys) => { if (active) setStored(new Set(keys)); }, () => { if (active) setStored(new Set()); });
    return () => { active = false; };
  }, [version, snapshot.mediaAssets]);
  return stored;
}

export function useBookFiles(bookId: string): BookFileStats | null {
  const { snapshot } = useAppState();
  const cloud = useCloudSync();
  const stored = useStoredMediaIds();
  return stored ? bookFileStats(snapshot, bookId, cloud.books[bookId], stored) : null;
}
