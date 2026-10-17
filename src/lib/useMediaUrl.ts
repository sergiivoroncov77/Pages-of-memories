import { useEffect, useState } from 'react';
import type { MediaAsset } from '../data/types';
import { isStoredMedia, mediaStore, onMediaStored } from './mediaStore';
import { publicUrl } from './publicUrl';

export type MediaUrlState =
  | { status: 'ready'; url: string }
  | { status: 'loading'; url?: undefined }
  | { status: 'missing'; url?: undefined };

/** Resolve an asset to something `src` accepts; device blobs become object URLs revoked on unmount. */
export function useMediaUrl(asset: Pick<MediaAsset, 'id' | 'url'> | undefined): MediaUrlState {
  const stored = asset ? isStoredMedia(asset) : false;
  const [resolved, setResolved] = useState<{ key: string; state: MediaUrlState } | null>(null);
  // Bumped when the file arrives later, for example from the family storage.
  const [arrivals, setArrivals] = useState(0);
  const key = asset ? `${asset.id}|${asset.url}|${arrivals}` : '';
  const assetId = asset?.id;

  useEffect(() => {
    if (!assetId || !stored) return;
    return onMediaStored((id) => { if (id === assetId) setArrivals((count) => count + 1); });
  }, [assetId, stored]);

  useEffect(() => {
    if (!asset || !stored) return;
    let active = true;
    let objectUrl: string | undefined;
    mediaStore().get(asset.id).then((blob) => {
      if (!active) return;
      if (!blob) { setResolved({ key, state: { status: 'missing' } }); return; }
      objectUrl = URL.createObjectURL(blob);
      setResolved({ key, state: { status: 'ready', url: objectUrl } });
    }, () => {
      if (active) setResolved({ key, state: { status: 'missing' } });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // The key captures every asset field this effect reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stored]);

  if (!asset) return { status: 'missing' };
  if (!stored) return { status: 'ready', url: publicUrl(asset.url) };
  return resolved?.key === key ? resolved.state : { status: 'loading' };
}
