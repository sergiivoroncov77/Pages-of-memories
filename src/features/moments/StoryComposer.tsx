import { FileAudio, FileVideo, ImagePlus, Mic, Paperclip, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { StoryEditor } from '../../components/StoryEditor';
import type { MediaAsset } from '../../data/types';
import { formatDuration } from '../../lib/format';
import { MAX_MEDIA_FILE_BYTES, prepareMediaFile, validateMediaFile, type MediaUploadWithBlob } from '../../lib/mediaFiles';
import { useMediaUrl } from '../../lib/useMediaUrl';
import { StoryPreview, type StoryPreviewProps } from '../reader/StoryPreview';
import { useAudioRecorder, type Recording } from '../session/useAudioRecorder';
import { VoiceRecorder } from './VoiceRecorder';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/x-wav,audio/webm,video/mp4,video/webm,video/ogg,video/quicktime';
const extensions: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

/** A file waiting to be attached: a voice just recorded or a file chosen on the device. */
interface PendingFile {
  key: string;
  media: MediaUploadWithBlob;
  previewUrl: string;
}

export interface StoryDraft {
  content: string;
  /** Files the story already had and keeps, in order. */
  keep: string[];
  /** New files, in order. */
  files: MediaUploadWithBlob[];
}

interface StoryComposerProps {
  initialContent?: string;
  /** Files the story already has. */
  existing?: MediaAsset[];
  momentTitle: string;
  label: ReactNode;
  /** Open with the microphone already on. */
  startRecording?: boolean;
  /** Who signs: rendered under the attachments. */
  signature?: ReactNode;
  note?: string;
  /** Fields shown above the story (a moment's title, chapter and date). */
  before?: ReactNode;
  /** The story may be left empty (it is only part of a larger form). */
  optional?: boolean;
  /** Where the story goes in the book, for a preview drawn as the book's own pages. */
  preview?: Omit<StoryPreviewProps, 'content' | 'files'>;
  submitLabel: string;
  saving: boolean;
  error: string;
  onError: (message: string) => void;
  onSubmit: (draft: StoryDraft) => void | Promise<void>;
  onCancel: () => void;
}

const isLive = (status: ReturnType<typeof useAudioRecorder>['status']) =>
  status === 'requesting' || status === 'recording' || status === 'paused' || status === 'stopping';

let counter = 0;
const nextKey = () => `pending-${(counter += 1)}`;

/**
 * One form for one story: its words, and next to them a voice, photos or a
 * video — all saved together as a single story.
 */
export function StoryComposer({ initialContent = '', existing = [], momentTitle, label, startRecording = false, signature, note, preview, before, optional = false,
  submitLabel, saving, error, onError, onSubmit, onCancel }: StoryComposerProps) {
  const [content, setContent] = useState(initialContent);
  const [keep, setKeep] = useState(() => existing.map((asset) => asset.id));
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [showRecorder, setShowRecorder] = useState(startRecording);
  const [take, setTake] = useState<Recording | null>(null);
  const recorder = useAudioRecorder();
  const fileInput = useRef<HTMLInputElement>(null);
  const recording = isLive(recorder.status);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    if (startRecording) void recorder.start();
    // Only once, when the form opens from «Рассказать голосом».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => pendingRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

  const add = (media: MediaUploadWithBlob) => setPending((items) => [...items, { key: nextKey(), media, previewUrl: URL.createObjectURL(media.blob) }]);
  const removePending = (key: string) => setPending((items) => {
    const gone = items.find((item) => item.key === key);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    return items.filter((item) => item.key !== key);
  });

  const attachTake = (next: Recording | null) => {
    setTake(next);
    if (!next) return;
    if (next.blob.size > MAX_MEDIA_FILE_BYTES) { onError('Запись не помещается в книгу: до 50 МБ на файл. Запишите рассказ частями.'); return; }
    add({ type: 'audio', url: '', mimeType: next.mimeType, blob: next.blob, sizeBytes: next.blob.size, durationSeconds: next.durationSeconds,
      fileName: `Голос — ${momentTitle}.${extensions[next.mimeType] ?? 'webm'}`, alt: `Голос: ${momentTitle}` });
    setTake(null);
    setShowRecorder(false);
    onError('');
  };

  const chooseFiles = (files: FileList | null) => {
    const problems: string[] = [];
    Array.from(files ?? []).forEach((file) => {
      const problem = validateMediaFile(file);
      if (problem) { problems.push(`${file.name}: ${problem}`); return; }
      // A file name is no caption: the book shows the story's own words or nothing.
      add({ ...prepareMediaFile(file), alt: undefined });
    });
    onError(problems.join(' '));
    if (fileInput.current) fileInput.current.value = '';
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (recording) { onError('Сначала нажмите «Готово», чтобы закончить запись.'); return; }
    if (!optional && !content.trim() && !keep.length && !pending.length) { onError('Напишите рассказ или прикрепите голос, фото или видео.'); return; }
    onError('');
    void onSubmit({ content, keep, files: pending.map((item) => item.media) });
  };

  const kept = existing.filter((asset) => keep.includes(asset.id));
  const count = kept.length + pending.length;
  // Files just chosen are shown in the preview from memory, as they will look once saved.
  const previewFiles: MediaAsset[] = [...kept, ...pending.map((item) => ({
    id: item.key, type: item.media.type, url: item.previewUrl, mimeType: item.media.mimeType, fileName: item.media.fileName,
    alt: item.media.alt, durationSeconds: item.media.durationSeconds, createdAt: ''
  }))];

  return <form className="inline-form story-composer" onSubmit={submit} aria-busy={saving}>
    {before}
    <StoryEditor label={label} autoFocus={!startRecording} value={content} onChange={setContent} rows={7} maxLength={30000} disabled={saving}
      placeholder="Можно начать с одной детали…"
      renderPreview={preview ? (text) => <StoryPreview {...preview} content={text} files={previewFiles} /> : undefined} />

    <div className="field story-composer__files">
      <span>К рассказу {count ? <small>· {count} {count === 1 ? 'файл' : count < 5 ? 'файла' : 'файлов'}</small> : <small>необязательно</small>}</span>
      {kept.length || pending.length ? <ul className="attachment-list">
        {kept.map((asset) => <li key={asset.id}><StoredAttachment asset={asset} />
          <button type="button" className="card-tool card-tool--danger" aria-label={'Убрать ' + describe(asset)} disabled={saving}
            onClick={() => setKeep((ids) => ids.filter((id) => id !== asset.id))}><X size={16} /></button></li>)}
        {pending.map((item) => <li key={item.key}><AttachmentPreview type={item.media.type} url={item.previewUrl} name={item.media.fileName}
          duration={item.media.durationSeconds} />
          <button type="button" className="card-tool card-tool--danger" aria-label="Убрать файл" disabled={saving} onClick={() => removePending(item.key)}><X size={16} /></button></li>)}
      </ul> : null}
      {showRecorder || recording || take ? <div className="story-composer__recorder">
        <VoiceRecorder recorder={recorder} take={take} onTake={attachTake} disabled={saving} />
        {!recording ? <button type="button" className="text-button" onClick={() => { recorder.cancel(); setTake(null); setShowRecorder(false); }}>Не записывать</button> : null}
      </div> : <div className="story-composer__add">
        <button type="button" className="button button--secondary button--small" disabled={saving} onClick={() => { setShowRecorder(true); void recorder.start(); }}>
          <Mic size={17} aria-hidden="true" /> Записать голос</button>
        <label className="button button--secondary button--small story-composer__pick">
          <Paperclip size={17} aria-hidden="true" /> Фото, видео или аудио
          <input ref={fileInput} type="file" multiple accept={ACCEPT} disabled={saving} onChange={(event) => chooseFiles(event.target.files)} />
        </label>
      </div>}
      <small className="field-note">До 50 МБ на файл. {note}</small>
    </div>

    {signature}
    {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
    <div className="form-actions">
      <button type="submit" className="button button--primary" disabled={saving || recording}>{saving ? 'Сохраняем…' : submitLabel}</button>
      <button type="button" className="button button--ghost" disabled={saving} onClick={() => { recorder.cancel(); onCancel(); }}>Отмена</button>
    </div>
  </form>;
}

const describe = (asset: Pick<MediaAsset, 'type'>) => asset.type === 'photo' ? 'фото' : asset.type === 'video' ? 'видео' : 'запись';

function StoredAttachment({ asset }: { asset: MediaAsset }) {
  const media = useMediaUrl(asset);
  return <AttachmentPreview type={asset.type} url={media.status === 'ready' ? media.url : ''} name={asset.fileName} duration={asset.durationSeconds} />;
}

function AttachmentPreview({ type, url, name, duration }: { type: MediaAsset['type']; url: string; name?: string; duration?: number }) {
  const Icon = type === 'photo' ? ImagePlus : type === 'video' ? FileVideo : FileAudio;
  return <div className="attachment">
    {type === 'photo' && url ? <img src={url} alt="" /> : <span className="attachment__icon" aria-hidden="true"><Icon size={20} /></span>}
    <span className="attachment__name"><strong>{type === 'audio' ? 'Голос' : type === 'photo' ? 'Фото' : type === 'video' ? 'Видео' : 'Файл'}</strong>
      <small>{[name, duration ? formatDuration(duration) : ''].filter(Boolean).join(' · ')}</small></span>
    {type === 'audio' && url ? <audio src={url} controls preload="metadata" aria-label={name ?? 'Запись'} /> : null}
  </div>;
}
