import { useState, type ReactNode } from 'react';
import type { Chapter, MediaAsset } from '../../data/types';
import type { StoryPreviewProps } from '../reader/StoryPreview';
import type { MomentDetails } from './MomentDetailsForm';
import { MomentDetailsForm } from './MomentDetailsForm';
import { StoryComposer, type StoryDraft } from './StoryComposer';

export interface MomentEditorStory {
  content: string;
  /** Files the main story has now. */
  files: MediaAsset[];
}

interface MomentEditorProps {
  chapters: Chapter[];
  initial: Omit<MomentDetails, 'story'>;
  /** The main story as it is; undefined while the moment has none. */
  story?: MomentEditorStory;
  /** Why the main story cannot be changed here (someone else's, or kept in an interview); the details still can. */
  storyLocked?: ReactNode;
  preview?: Omit<StoryPreviewProps, 'content' | 'files'>;
  /** Who signs a new main story. */
  signature?: ReactNode;
  note?: string;
  submitLabel: string;
  /** May throw: the message is shown in the form. `story` is null when the story was not part of the form. */
  onSubmit: (details: Omit<MomentDetails, 'story'>, story: StoryDraft | null) => Promise<void> | void;
  onCancel: () => void;
}

/**
 * One form for a whole moment: its title, short description, chapter and date,
 * and its main story with the voice, photos and video next to the words.
 * Other people's views of the moment are changed on their own cards.
 */
export function MomentEditor({ chapters, initial, story, storyLocked, preview, signature, note, submitLabel, onSubmit, onCancel }: MomentEditorProps) {
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [chapterId, setChapterId] = useState(initial.chapterId);
  const [occurredAt, setOccurredAt] = useState(initial.occurredAt?.slice(0, 10) ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const details = () => ({ title: title.trim(), summary: summary.trim(), chapterId, occurredAt: occurredAt || undefined });

  const save = async (draft: StoryDraft | null, values = details()) => {
    if (!values.title || !chapters.some((chapter) => chapter.id === values.chapterId)) { setError('Напишите название и выберите главу.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSubmit(values, draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения. Проверьте поля формы.');
      setSaving(false);
    }
  };

  // Without the main story here, the plain details form is enough.
  if (storyLocked) {
    return <>
      <MomentDetailsForm chapters={chapters} initial={initial} submitLabel={submitLabel} onCancel={onCancel}
        onSubmit={(values) => { void save(null, { title: values.title, summary: values.summary, chapterId: values.chapterId, occurredAt: values.occurredAt }); }} />
      <p className="field-note moment-editor__locked">{storyLocked}</p>
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
    </>;
  }

  const fields = <>
    <label className="field">
      <span>Название момента</span>
      <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required disabled={saving} placeholder="Например, первое лето на даче" />
    </label>
    <label className="field">
      <span>Короткое описание <small>необязательно</small></span>
      <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={2} maxLength={3000} disabled={saving} placeholder="Что произошло и почему это важно для вас?" />
    </label>
    <div className="form-row">
      <label className="field">
        <span>Глава</span>
        <select value={chapterId} onChange={(event) => setChapterId(event.target.value)} required disabled={saving}>
          {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Дата события <small>необязательно</small></span>
        <input type="date" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} min="0001-01-01" max="9999-12-31" disabled={saving} />
        <small>Моменты с датой идут в главе по порядку. Не помните точно — оставьте пустым.</small>
      </label>
    </div>
    <h3 className="moment-editor__story-title">Основной рассказ</h3>
  </>;

  return <StoryComposer before={fields} optional initialContent={story?.content ?? ''} existing={story?.files ?? []} momentTitle={title || 'Момент'}
    label={<>Как это было? <small>необязательно</small></>} submitLabel={submitLabel} saving={saving} error={error} onError={setError}
    preview={preview ? { ...preview, moment: { ...preview.moment, title: title || preview.moment.title, occurredAt: occurredAt || undefined } } : undefined}
    signature={signature} note={note} onSubmit={(draft) => save(draft)} onCancel={onCancel} />;
}
