import { Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDuration } from '../lib/format';

const waveform = [18, 30, 22, 44, 34, 56, 28, 48, 62, 36, 52, 26, 42, 68, 38, 58, 32, 50, 66, 40, 54, 24, 46, 60, 30, 52, 70, 36, 48, 28, 42, 58, 34, 50, 62, 26, 44, 56, 32, 46];

export function AudioPlayer({ durationSeconds, title }: { durationSeconds: number; title: string }) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setCurrent((value) => {
        if (value >= durationSeconds - 1) {
          setPlaying(false);
          return durationSeconds;
        }
        return value + 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [durationSeconds, playing]);

  const ratio = durationSeconds ? current / durationSeconds : 0;

  return (
    <div className="audio-player" aria-label={`Аудиозапись: ${title}`}>
      <div className="audio-player__top">
        <button
          type="button"
          className="audio-player__main"
          onClick={() => {
            if (current >= durationSeconds) setCurrent(0);
            setPlaying((value) => !value);
          }}
          aria-label={playing ? 'Поставить на паузу' : 'Воспроизвести запись'}
        >
          {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
        </button>
        <div className="audio-player__info">
          <strong>{playing ? 'Идёт воспроизведение' : 'Голосовая запись'}</strong>
          <span>
            {formatDuration(current)} из {formatDuration(durationSeconds)}
          </span>
        </div>
        <Volume2 size={22} aria-hidden="true" />
      </div>

      <div className="waveform" aria-hidden="true">
        {waveform.map((height, index) => (
          <span
            key={`${height}-${index}`}
            className={index / waveform.length <= ratio ? 'is-played' : ''}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <input
        className="audio-player__range"
        type="range"
        min={0}
        max={durationSeconds}
        value={current}
        onChange={(event) => setCurrent(Number(event.target.value))}
        aria-label="Позиция воспроизведения"
      />

      <button
        type="button"
        className="audio-player__reset"
        onClick={() => {
          setCurrent(0);
          setPlaying(false);
        }}
      >
        <RotateCcw size={17} aria-hidden="true" />
        В начало
      </button>
    </div>
  );
}
