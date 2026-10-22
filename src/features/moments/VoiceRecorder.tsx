import { Mic, Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDuration } from '../../lib/format';
import { findRecordedDuration } from '../../lib/mediaDuration';
import type { Recording, useAudioRecorder } from '../session/useAudioRecorder';

interface VoiceRecorderProps {
  recorder: ReturnType<typeof useAudioRecorder>;
  take: Recording | null;
  onTake: (take: Recording | null) => void;
  disabled?: boolean;
}

/** Tell the story aloud: record, listen back, record again, then add it to the moment. */
export function VoiceRecorder({ recorder, take, onTake, disabled = false }: VoiceRecorderProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const live = recorder.status === 'recording' || recorder.status === 'paused';
  const busy = live || recorder.status === 'requesting' || recorder.status === 'stopping';
  const problem = recorder.status === 'denied' || recorder.status === 'unsupported' || recorder.status === 'error';

  useEffect(() => {
    if (!take) { setUrl(''); return; }
    const objectUrl = URL.createObjectURL(take.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [take]);

  const record = () => {
    setError('');
    onTake(null);
    void recorder.start();
  };
  const finish = async () => {
    const recording = await recorder.stop();
    if (!recording) { setError('Запись получилась пустой. Попробуйте ещё раз.'); return; }
    onTake(recording);
  };

  if (take && !busy) {
    return (
      <div className="voice-recorder voice-recorder--take">
        <p className="voice-recorder__state"><Mic size={16} aria-hidden="true" /> Записано · {formatDuration(take.durationSeconds)}. Послушайте перед тем, как добавить.</p>
        {url ? <audio src={url} controls preload="metadata" aria-label="Ваша запись" onLoadedMetadata={findRecordedDuration} /> : null}
        <div className="voice-recorder__actions">
          <button type="button" className="button button--secondary button--small" onClick={record} disabled={disabled}><RotateCcw size={16} aria-hidden="true" /> Перезаписать</button>
          <button type="button" className="button button--ghost button--small" onClick={() => onTake(null)} disabled={disabled}><Trash2 size={16} aria-hidden="true" /> Удалить запись</button>
        </div>
      </div>
    );
  }

  if (!busy) {
    return (
      <div className="voice-recorder">
        <button type="button" className="button button--primary voice-recorder__start" onClick={record} disabled={disabled}><Mic size={19} aria-hidden="true" /> {problem ? 'Попробовать снова' : 'Записать голос'}</button>
        {problem ? <p className="field-message field-message--error" role="alert">{recorder.message}</p>
          : <small>Говорите как удобно: можно делать паузы и перезаписать. Запись сохранится в момент вместе с вашей подписью.</small>}
        {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="voice-recorder is-live">
      <div className={'narration-meter ' + (recorder.status === 'recording' ? 'is-live' : '')} role="meter" aria-label="Громкость микрофона"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((recorder.levels[recorder.levels.length - 1] ?? 0) * 100)}>
        {recorder.levels.map((level, index) => <span key={index} style={{ transform: `scaleY(${0.12 + level * 0.88})` }} />)}
      </div>
      <div className="narration-studio__bar">
        <strong className="narration-studio__timer" role="timer">{formatDuration(recorder.elapsed)}</strong>
        <span className="narration-studio__state" role="status">{recorder.status === 'requesting' ? 'Ждём разрешения на микрофон…'
          : recorder.status === 'stopping' ? 'Сохраняем запись…' : recorder.status === 'paused' ? 'Пауза' : 'Идёт запись'}</span>
        <div className="narration-studio__actions">
          {recorder.status === 'recording' ? <button type="button" className="icon-button" aria-label="Пауза" onClick={recorder.pause}><Pause size={18} /></button> : null}
          {recorder.status === 'paused' ? <button type="button" className="icon-button" aria-label="Продолжить запись" onClick={recorder.resume}><Play size={18} /></button> : null}
          {live ? <button type="button" className="button button--primary button--small" onClick={() => { void finish(); }}><Square size={15} aria-hidden="true" /> Готово</button> : null}
          <button type="button" className="button button--ghost button--small" onClick={recorder.cancel} disabled={recorder.status === 'requesting' || recorder.status === 'stopping'}>Отмена</button>
        </div>
      </div>
    </div>
  );
}
