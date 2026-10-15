import { Check, ChevronDown, Mic, Pause, Play, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAppState } from '../../app/AppState';
import { StoredAudio } from '../../components/StoredAudio';
import type { Moment, Perspective } from '../../data/types';
import { formatDuration } from '../../lib/format';
import { useAudioRecorder } from '../session/useAudioRecorder';

const extensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

/** One voice-over per moment: the reader tells the story, the film plays it over the photos. */
export function NarrationPanel({ moments, disabled }: { moments: { moment: Moment; perspectives: Perspective[] }[]; disabled: boolean }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  return <div className="narration-list">
    {moments.map(({ moment, perspectives }) => <NarrationRow key={moment.id} moment={moment} script={perspectives.find((item) => item.id === moment.primaryPerspectiveId)?.content
      ?? perspectives.find((item) => item.type === 'text')?.content ?? moment.summary}
      open={activeId === moment.id} onOpen={() => setActiveId(moment.id)} onClose={() => setActiveId(null)} disabled={disabled || (activeId !== null && activeId !== moment.id)} />)}
  </div>;
}

function NarrationRow({ moment, script, open, onOpen, onClose, disabled }: { moment: Moment; script: string; open: boolean; onOpen: () => void; onClose: () => void; disabled: boolean }) {
  const { mediaAssets, setMomentNarration } = useAppState();
  const recorder = useAudioRecorder();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showScript, setShowScript] = useState(true);
  const asset = moment.narrationMediaAssetId ? mediaAssets.find((item) => item.id === moment.narrationMediaAssetId) : undefined;
  const live = recorder.status === 'recording' || recorder.status === 'paused';
  const problem = recorder.status === 'denied' || recorder.status === 'unsupported' || recorder.status === 'error';

  const begin = () => {
    setError('');
    onOpen();
    void recorder.start();
  };

  const finish = async () => {
    const take = await recorder.stop();
    if (!take) { setError('Запись получилась пустой. Попробуйте ещё раз.'); return; }
    setSaving(true);
    const result = await setMomentNarration(moment.id, {
      type: 'audio', url: '', mimeType: take.mimeType, blob: take.blob, sizeBytes: take.blob.size, durationSeconds: take.durationSeconds,
      fileName: `Озвучка — ${moment.title}.${extensions[take.mimeType] ?? 'webm'}`, alt: `Озвучка момента «${moment.title}»`
    });
    setSaving(false);
    if (!result.ok) { setError(result.error.message); return; }
    onClose();
  };

  const cancel = () => {
    recorder.cancel();
    setError('');
    onClose();
  };

  const remove = async () => {
    const result = await setMomentNarration(moment.id, null);
    if (!result.ok) setError(result.error.message);
  };

  return <article className={'narration-row ' + (open ? 'is-open' : '')}>
    <div className="narration-row__head">
      <span className={'narration-row__status ' + (asset ? 'has-voice' : '')} aria-hidden="true">{asset ? <Check size={16} /> : <Mic size={16} />}</span>
      <div className="narration-row__copy">
        <strong>{moment.title}</strong>
        <small>{asset ? 'Озвучка записана' + (asset.durationSeconds ? ' · ' + formatDuration(asset.durationSeconds) : '') : 'Без озвучки'}</small>
      </div>
      {!open ? <button type="button" className="button button--secondary button--small" onClick={begin} disabled={disabled}>
        <Mic size={16} aria-hidden="true" /> {asset ? 'Перезаписать' : 'Озвучить'}
      </button> : null}
    </div>
    {asset && !open ? <div className="narration-row__player"><StoredAudio asset={asset} label={'Озвучка: ' + moment.title} />
      <button type="button" className="icon-button" aria-label={'Удалить озвучку: ' + moment.title} onClick={() => { void remove(); }} disabled={disabled}><Trash2 size={18} /></button></div> : null}
    {open ? <div className="narration-studio">
      {script ? <div className="narration-script">
        <button type="button" className="text-button" aria-expanded={showScript} onClick={() => setShowScript((value) => !value)}>
          <ChevronDown size={16} aria-hidden="true" className={showScript ? 'is-flipped' : ''} /> Текст для чтения
        </button>
        {showScript ? <p>{script}</p> : null}
      </div> : null}
      {problem ? <p className="field-message field-message--error" role="alert">{recorder.message}</p> : null}
      <div className={'narration-meter ' + (recorder.status === 'recording' ? 'is-live' : '')} role="meter" aria-label="Громкость микрофона"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((recorder.levels[recorder.levels.length - 1] ?? 0) * 100)}>
        {recorder.levels.map((level, index) => <span key={index} style={{ transform: `scaleY(${0.12 + level * 0.88})` }} />)}
      </div>
      <div className="narration-studio__bar">
        <strong className="narration-studio__timer" role="timer">{formatDuration(recorder.elapsed)}</strong>
        <span className="narration-studio__state" role="status">{saving ? 'Сохраняем…' : recorder.status === 'requesting' ? 'Ждём разрешения на микрофон…'
          : recorder.status === 'recording' ? 'Идёт запись' : recorder.status === 'paused' ? 'Пауза' : ''}</span>
        <div className="narration-studio__actions">
          {recorder.status === 'recording' ? <button type="button" className="icon-button" aria-label="Пауза" onClick={recorder.pause}><Pause size={18} /></button> : null}
          {recorder.status === 'paused' ? <button type="button" className="icon-button" aria-label="Продолжить запись" onClick={recorder.resume}><Play size={18} /></button> : null}
          {live ? <button type="button" className="button button--primary button--small" onClick={() => { void finish(); }} disabled={saving}><Square size={15} aria-hidden="true" /> Готово</button> : null}
          {problem ? <button type="button" className="button button--secondary button--small" onClick={begin}>Попробовать снова</button> : null}
          <button type="button" className="button button--ghost button--small" onClick={cancel} disabled={saving}>Отмена</button>
        </div>
      </div>
    </div> : null}
    {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
  </article>;
}
