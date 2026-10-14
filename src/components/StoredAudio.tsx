import type { MediaAsset } from '../data/types';
import { useMediaUrl } from '../lib/useMediaUrl';

/** Native audio player for a recording whose bytes may live in the device media store. */
export function StoredAudio({ asset, label = 'Запись ответа' }: { asset: MediaAsset; label?: string }) {
  const media = useMediaUrl(asset);
  if (media.status === 'loading') return <p className="field-message" role="status">Загружаем запись…</p>;
  if (media.status === 'missing') return <p className="field-message field-message--error" role="alert">Запись не найдена на этом устройстве. Запишите ответ заново или восстановите резервную копию.</p>;
  return <audio className="recorded-answer__player" src={media.url} controls preload="metadata" aria-label={label} />;
}
