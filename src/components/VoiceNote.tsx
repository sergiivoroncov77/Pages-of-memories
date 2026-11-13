import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MediaAsset } from '../data/types';
import { formatDuration } from '../lib/format';
import { findRecordedDuration } from '../lib/mediaDuration';
import { useMediaUrl } from '../lib/useMediaUrl';

/**
 * A quiet, one-line player for a voice that goes with written words: it sits
 * under the text instead of taking the place of it.
 */
export function VoiceNote({ asset, label = 'Послушать', className = '' }: { asset: MediaAsset; label?: string; className?: string }) {
  const media = useMediaUrl(asset);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(asset.durationSeconds ?? 0);

  useEffect(() => () => audio.current?.pause(), []);

  if (media.status === 'loading') return <p className={'voice-note voice-note--quiet ' + className} role="status">Загружаем запись…</p>;
  if (media.status === 'missing') {
    return <p className={'voice-note voice-note--quiet ' + className} role="status">
      {media.offline ? 'Запись в облаке: она откроется, когда появится интернет.' : 'Запись не найдена на этом устройстве.'}
    </p>;
  }

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => setPlaying(false));
    else element.pause();
  };
  const seek = (value: number) => {
    if (audio.current && Number.isFinite(value)) audio.current.currentTime = value;
    setTime(value);
  };
  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;

  return <div className={'voice-note ' + className} onPointerUp={(event) => event.stopPropagation()}>
    <button type="button" className="voice-note__play" onClick={toggle} aria-label={(playing ? 'Пауза: ' : 'Слушать: ') + label}>
      {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
    </button>
    <span className="voice-note__label">{label}</span>
    <input type="range" className="voice-note__progress" min={0} max={total || 1} step={0.1} value={Math.min(time, total || 1)}
      onChange={(event) => seek(Number(event.target.value))} aria-label={'Позиция записи: ' + label} disabled={!total}
      style={{ '--progress': `${total ? (time / total) * 100 : 0}%` } as CSSProperties} />
    <span className="voice-note__time">{formatDuration(Math.round(playing || time ? time : total))}</span>
    <audio ref={audio} src={media.url} preload="metadata"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(0); }}
      onTimeUpdate={(event) => { const at = event.currentTarget.currentTime; if (Number.isFinite(at) && at < 86400) setTime(at); }}
      onLoadedMetadata={(event) => {
        // Recordings made in the browser often report no length until asked.
        findRecordedDuration(event);
        if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
      }}
      onDurationChange={(event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }}
      onError={media.retry} />
  </div>;
}
