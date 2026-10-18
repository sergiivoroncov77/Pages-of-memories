import { useEffect, useRef, useState } from 'react';
import type { MediaAsset } from '../data/types';
import { inCloud, markStreamFailed, onCloudMediaChange, streamUrl, viewBlob } from './cloudMedia';
import { isStoredMedia, mediaStore, onMediaStored } from './mediaStore';
import { publicUrl } from './publicUrl';

export type MediaUrlState =
  /** `retry` is there for a stream from the cloud: call it when the player fails, and the file comes whole. */
  | { status: 'ready'; url: string; retry?: () => void }
  | { status: 'loading'; url?: undefined }
  /** `offline`: the file is in the cloud, and there is no connection to fetch it. */
  | { status: 'missing'; url?: undefined; offline?: boolean };

/**
 * Resolve an asset to something `src` accepts: bytes on this device become
 * object URLs (revoked on unmount); files of shared books that are not kept
 * here come from the cloud.
 */
export function useMediaUrl(asset: Pick<MediaAsset, 'id' | 'url' | 'type'> | undefined): MediaUrlState {
  const stored = asset ? isStoredMedia(asset) : false;
  const [resolved, setResolved] = useState<{ key: string; state: MediaUrlState } | null>(null);
  // Bumped when the file arrives later or can be looked for again (the storage answered, the network came back).
  const [arrivals, setArrivals] = useState(0);
  const key = asset ? `${asset.id}|${asset.url}|${arrivals}` : '';
  const assetId = asset?.id;
  const missing = useRef(false);
  missing.current = resolved?.key === key && resolved.state.status === 'missing';

  useEffect(() => {
    if (!assetId || !stored) return;
    const again = () => { if (missing.current) setArrivals((count) => count + 1); };
    const offStored = onMediaStored((id) => { if (id === assetId) setArrivals((count) => count + 1); });
    const offCloud = onCloudMediaChange(again);
    window.addEventListener('online', again);
    return () => { offStored(); offCloud(); window.removeEventListener('online', again); };
  }, [assetId, stored]);

  useEffect(() => {
    if (!asset || !stored) return;
    let active = true;
    let objectUrl: string | undefined;
    const show = (blob: Blob) => {
      objectUrl = URL.createObjectURL(blob);
      setResolved({ key, state: { status: 'ready', url: objectUrl } });
    };
    void (async () => {
      const local = await mediaStore().get(asset.id).catch(() => undefined);
      if (!active) return;
      if (local) { show(local); return; }
      const stream = streamUrl(asset);
      if (stream) {
        setResolved({ key, state: { status: 'ready', url: stream, retry: () => { markStreamFailed(asset.id); setArrivals((count) => count + 1); } } });
        return;
      }
      if (!inCloud(asset.id)) { setResolved({ key, state: { status: 'missing' } }); return; }
      try {
        const blob = await viewBlob(asset.id);
        if (!active) return;
        if (blob) show(blob);
        else setResolved({ key, state: { status: 'missing' } });
      } catch {
        if (active) setResolved({ key, state: { status: 'missing', offline: true } });
      }
    })();
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
