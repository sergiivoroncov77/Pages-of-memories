import { useState, type FormEvent } from 'react';
import { StoryEditor } from '../../components/StoryEditor';
import type { Chapter } from '../../data/types';

export interface MomentDetails {
  title: string;
  summary: string;
  chapterId: string;
  occurredAt?: string;
  story?: string;
}

interface MomentDetailsFormProps {
  chapters: Chapter[];
  initial: MomentDetails;
  submitLabel: string;
  onSubmit: (details: MomentDetails) => void;
  onCancel: () => void;
  includeStory?: boolean;
  storyAuthorName?: string;
}

export function MomentDetailsForm({ chapters, initial, submitLabel, onSubmit, onCancel, includeStory = false, storyAuthorName }: MomentDetailsFormProps) {
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [story, setStory] = useState(initial.story ?? '');
  const [chapterId, setChapterId] = useState(initial.chapterId);
  const [occurredAt, setOccurredAt] = useState(initial.occurredAt?.slice(0, 10) ?? '');
  const [error, setError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !chapters.some((chapter) => chapter.id === chapterId)) {
      setError('Напишите название и выберите главу.');
      return;
    }
    const eventDate = String(new FormData(event.currentTarget).get('occurredAt') ?? '');
    try {
      onSubmit({ title: title.trim(), summary: summary.trim(), chapterId, occurredAt: eventDate || undefined,
        ...(includeStory ? { story } : {}) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения. Проверьте поля формы.');
    }
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">
        <span>Название момента</span>
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required placeholder="Например, первое лето на даче" />
      </label>
      <label className="field">
        <span>Короткое описание</span>
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} maxLength={3000} placeholder="Что произошло и почему это важно для вас?" />
      </label>
      {includeStory ? <>
        <StoryEditor label={<>Рассказ <small>необязательно</small></>} value={story} onChange={setStory} rows={8}
          maxLength={30000} placeholder="Расскажите, что произошло. Пустая строка отделяет один абзац от другого." />
        <small className="field-note">{storyAuthorName ? `Подпись: ${storyAuthorName}.` : 'Без указания автора.'} Рассказ можно дополнить после создания момента.</small>
      </> : null}
      <div className="form-row">
        <label className="field">
          <span>Глава</span>
          <select value={chapterId} onChange={(event) => setChapterId(event.target.value)} required>
            {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Дата события <small>необязательно</small></span>
          <input type="date" name="occurredAt" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} min="0001-01-01" max="9999-12-31" />
          <small>Моменты с датой идут в главе по порядку, от ранних к поздним. Если не помните точную дату, оставьте поле пустым.</small>
        </label>
      </div>
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="submit" className="button button--primary">{submitLabel}</button>
        <button type="button" className="button button--ghost" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}
