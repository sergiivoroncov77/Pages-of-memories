import { Check, ChevronDown, Mic, Paperclip, Pause, Play, Square, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import { StoredAudio } from '../../components/StoredAudio';
import type { MediaAsset, Moment, Perspective, Reflection } from '../../data/types';
import { formatDuration } from '../../lib/format';
import { prepareMediaFile, validateMediaFile, type MediaUploadWithBlob } from '../../lib/mediaFiles';
import { stripStoryMarkup } from '../../lib/storyMarkup';
import type { StorageWriteResult } from '../../lib/storage';
import { useCloudSync } from '../../sync/CloudSync';
import { useAudioRecorder } from '../session/useAudioRecorder';

const extensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

interface NarrationTarget {
  key: string;
  /** What is read aloud: the moment, someone's view or a reflection. */
  kind: 'moment' | 'view' | 'reflection';
  title: string;
  script: string;
  asset?: MediaAsset;
  save: (media: MediaUploadWithBlob | null) => Promise<StorageWriteResult>;
}

/**
 * Voice-overs for the film: the moment itself, and each of its other views and
 * reflections. Anyone in the book may read a view or reflection aloud, also
 * someone else's.
 */
export function NarrationPanel({ moments, disabled, spans }: {
  moments: { moment: Moment; perspectives: Perspective[]; reflections?: Reflection[] }[];
  disabled: boolean;
  /** Seconds each part lasts in the film without voice-overs, by moment, view or reflection id. */
  spans?: ReadonlyMap<string, number>;
}) {
  const { mediaAssets, getPerson, setMomentNarration, setViewNarration } = useAppState();
  const [activeId, setActiveId] = useState<string | null>(null);
  const assetOf = (id?: string) => (id ? mediaAssets.find((item) => item.id === id) : undefined);
  const name = (id?: string) => getPerson(id ?? '')?.name ?? 'Без указания автора';

  return <div className="narration-list">
    {moments.map(({ moment, perspectives, reflections = [] }) => {
      const primary = perspectives.find((item) => item.id === moment.primaryPerspectiveId) ?? perspectives.find((item) => item.type === 'text');
      const targets: NarrationTarget[] = [
        { key: moment.id, kind: 'moment', title: moment.title, asset: assetOf(moment.narrationMediaAssetId),
          script: stripStoryMarkup(primary?.content ?? moment.summary), save: (media) => setMomentNarration(moment.id, media) },
        ...perspectives.filter((item) => item.id !== primary?.id).map((item): NarrationTarget => ({
          key: item.id, kind: 'view', title: 'Взгляд · ' + name(item.authorId), asset: assetOf(moment.narrations?.[item.id]),
          script: stripStoryMarkup(item.content || item.caption || ''), save: (media) => setViewNarration(moment.id, item.id, media)
        })),
        ...reflections.map((item): NarrationTarget => ({
          key: item.id, kind: 'reflection', title: 'Отклик · ' + name(item.authorId), asset: assetOf(moment.narrations?.[item.id]),
          script: item.text, save: (media) => setViewNarration(moment.id, item.id, media)
        }))
      ];
      return <section key={moment.id} className="narration-group" aria-label={'Озвучка: ' + moment.title}>
        {targets.map((target) => <NarrationRow key={target.key} target={target} bookId={moment.bookId} momentTitle={moment.title} span={spans?.get(target.key)}
          open={activeId === target.key} onOpen={() => setActiveId(target.key)} onClose={() => setActiveId(null)}
          disabled={disabled || (activeId !== null && activeId !== target.key)} />)}
      </section>;
    })}
  </div>;
}

/** A recording's length from the file itself (mp3, m4a and wav tell it right away). */
function readDuration(file: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value?: number) => { URL.revokeObjectURL(url); resolve(value); };
    const timer = window.setTimeout(() => done(), 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => { window.clearTimeout(timer); done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : undefined); };
    audio.onerror = () => { window.clearTimeout(timer); done(); };
    audio.src = url;
  });
}

function NarrationRow({ target, bookId, momentTitle, span, open, onOpen, onClose, disabled }: {
  target: NarrationTarget; bookId: string; momentTitle: string; span?: number; open: boolean; onOpen: () => void; onClose: () => void; disabled: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cloud = useCloudSync();
  const recorder = useAudioRecorder();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showScript, setShowScript] = useState(true);
  const { asset } = target;
  const live = recorder.status === 'recording' || recorder.status === 'paused';
  const problem = recorder.status === 'denied' || recorder.status === 'unsupported' || recorder.status === 'error';
  // In a shared book someone else's voice-over is theirs to replace or delete.
  const locked = asset ? cloud.deletionBlocker(bookId, { type: 'media', id: asset.id }) : null;
  const what = target.kind === 'moment' ? 'момента' : target.kind === 'view' ? 'взгляда' : 'отклика';

  const begin = () => {
    setError('');
    onOpen();
    void recorder.start();
  };

  const finish = async () => {
    const take = await recorder.stop();
    if (!take) { setError('Запись получилась пустой. Попробуйте ещё раз.'); return; }
    setSaving(true);
    const result = await target.save({
      type: 'audio', url: '', mimeType: take.mimeType, blob: take.blob, sizeBytes: take.blob.size, durationSeconds: take.durationSeconds,
      fileName: `Озвучка — ${momentTitle}.${extensions[take.mimeType] ?? 'webm'}`, alt: `Озвучка ${what} «${momentTitle}»`
    }).catch((cause: unknown) => ({ ok: false as const, error: { kind: 'unavailable' as const, message: cause instanceof Error ? cause.message : 'Не удалось сохранить озвучку.' } }));
    setSaving(false);
    if (!result.ok) { setError(result.error.message); return; }
    onClose();
  };

  const cancel = () => {
    recorder.cancel();
    setError('');
    onClose();
  };

  // A voice-over recorded elsewhere, from a file on this device.
  const upload = async (file: File | null) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    const problem = validateMediaFile(file, 'audio');
    if (problem) { setError(problem); return; }
    setError('');
    setSaving(true);
    const media = { ...prepareMediaFile(file), alt: `Озвучка ${what} «${momentTitle}»` };
    media.durationSeconds = await readDuration(media.blob);
    const result = await target.save(media)
      .catch((cause: unknown) => ({ ok: false as const, error: { kind: 'unavailable' as const, message: cause instanceof Error ? cause.message : 'Не удалось сохранить озвучку.' } }));
    setSaving(false);
    if (!result.ok) setError(result.error.message);
  };

  const remove = async () => {
    const result = await target.save(null);
    if (!result.ok) setError(result.error.message);
  };

  return <article className={'narration-row ' + (target.kind !== 'moment' ? 'narration-row--nested ' : '') + (open ? 'is-open' : '')}>
    <div className="narration-row__head">
      <span className={'narration-row__status ' + (asset ? 'has-voice' : '')} aria-hidden="true">{asset ? <Check size={16} /> : <Mic size={16} />}</span>
      <div className="narration-row__copy">
        <strong>{target.title}</strong>
        <small>{asset ? 'Озвучка ' + (asset.durationSeconds ? formatDuration(asset.durationSeconds) : 'записана')
          : target.kind === 'moment' ? 'Без озвучки' : target.script ? '«' + target.script.slice(0, 60) + (target.script.length > 60 ? '…»' : '»') : 'Без озвучки'}</small>
        {span !== undefined ? <small className="narration-row__span">{'В фильме ' + formatDuration(Math.round(span))
          + (asset?.durationSeconds && asset.durationSeconds > span ? ` → продлится до ${formatDuration(asset.durationSeconds + 2)} под озвучку` : '')}</small>
          : target.kind === 'view' ? <small className="narration-row__span">Покажется на фоне фото момента</small> : null}
      </div>
      {!open && !locked ? <div className="narration-row__actions">
        <label className={'icon-button narration-row__upload' + (disabled || saving ? ' is-disabled' : '')} title="Загрузить озвучку из аудиофайла">
          <Paperclip size={17} aria-hidden="true" /><span className="visually-hidden">Загрузить озвучку из файла: {target.title}</span>
          <input ref={fileInput} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.weba" hidden disabled={disabled || saving}
            onChange={(event) => { void upload(event.target.files?.[0] ?? null); }} />
        </label>
        <button type="button" className="button button--secondary button--small" onClick={begin} disabled={disabled || saving}>
          <Mic size={16} aria-hidden="true" /> {saving ? 'Сохраняем…' : asset ? 'Перезаписать' : 'Озвучить'}
        </button>
      </div> : null}
    </div>
    {asset && !open ? <div className="narration-row__player"><StoredAudio asset={asset} label={'Озвучка: ' + target.title} />
      {locked ? null : <button type="button" className="icon-button" aria-label={'Удалить озвучку: ' + target.title} onClick={() => { void remove(); }} disabled={disabled}><Trash2 size={18} /></button>}</div> : null}
    {locked && !open ? <p className="delete-blocked">Озвучку записали не вы — перезаписать или удалить её может автор или создатель книги.</p> : null}
    {open ? <div className="narration-studio">
      {target.script ? <div className="narration-script">
        <button type="button" className="text-button" aria-expanded={showScript} onClick={() => setShowScript((value) => !value)}>
          <ChevronDown size={16} aria-hidden="true" className={showScript ? 'is-flipped' : ''} /> Текст для чтения
        </button>
        {showScript ? <p>{target.script}</p> : null}
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
