import type { MediaAsset } from '../data/types';
import { useMediaUrl } from '../lib/useMediaUrl';

/** A decorative or captioned photo whose bytes may live in the device media store. */
export function MediaImage({ asset, className, alt = '' }: { asset: MediaAsset; className?: string; alt?: string }) {
  const media = useMediaUrl(asset);
  return media.status === 'ready' ? <img className={className} src={media.url} alt={alt} loading="lazy" /> : null;
}
