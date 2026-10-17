import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Chapter } from '../../data/types';

interface ChapterFormProps {
  initial?: Chapter;
  submitLabel: string;
  onSubmit: (values: { title: string; description: string }) => void;
  onCancel: () => void;
  onMove?: (direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDelete?: () => void;
  /** Why the chapter cannot be deleted here, shown instead of the delete button. */
  deleteNote?: string;
}

export function ChapterForm({ initial, submitLabel, onSubmit, onCancel, onMove, canMoveUp, canMoveDown, onDelete, deleteNote }: ChapterFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError('Напишите название главы.'); return; }
    try {
      onSubmit({ title, description });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить главу.');
    }
  };

  return (
    <form className="inline-form chapter-form" onSubmit={submit}>
      <label className="field">
        <span>Название главы</span>
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Например, «Юность» или «Переезд в город»" />
      </label>
      <label className="field">
        <span>Пара слов о главе <small>необязательно</small></span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={600} placeholder="Какие истории сюда войдут" />
      </label>
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="submit" className="button button--primary">{submitLabel}</button>
        <button type="button" className="button button--ghost" onClick={onCancel}>Отмена</button>
        {onMove ? (
          <span className="chapter-form__order" role="group" aria-label="Порядок главы">
            <button type="button" className="icon-button" onClick={() => onMove(-1)} disabled={!canMoveUp} aria-label="Переместить главу выше"><ArrowUp size={19} /></button>
            <button type="button" className="icon-button" onClick={() => onMove(1)} disabled={!canMoveDown} aria-label="Переместить главу ниже"><ArrowDown size={19} /></button>
          </span>
        ) : null}
        {onDelete ? (
          <button type="button" className="button button--danger-ghost form-actions__end" onClick={onDelete}>
            <Trash2 size={17} aria-hidden="true" /> Удалить главу
          </button>
        ) : null}
      </div>
      {deleteNote ? <p className="delete-blocked">{deleteNote}</p> : null}
    </form>
  );
}
