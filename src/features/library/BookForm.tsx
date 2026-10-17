import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MediaImage } from '../../components/MediaImage';
import type { Book, MediaAsset } from '../../data/types';
import { BookNameField } from '../profile/BookNameField';

export interface BookFormValues {
  title: string;
  subtitle: string;
  description: string;
  firstChapter: string;
  /** How the creator signs in the new book. */
  myName: string;
  coverMediaAssetId?: string;
}

interface BookFormProps {
  mode: 'create' | 'edit';
  initial?: Book;
  /** Photos of this book that can become its cover (edit mode). */
  photos?: MediaAsset[];
  onSubmit: (values: BookFormValues) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function BookForm({ mode, initial, photos = [], onSubmit, onCancel, onDelete }: BookFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [firstChapter, setFirstChapter] = useState('Начало');
  const [myName, setMyName] = useState('');
  const [cover, setCover] = useState(initial?.coverMediaAssetId ?? '');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError('Напишите название книги.'); return; }
    if (mode === 'create' && !myName.trim()) { setError('Напишите, как вас подписывать в этой книге.'); return; }
    try {
      onSubmit({ title, subtitle, description, firstChapter, myName, coverMediaAssetId: cover || undefined });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить книгу.');
    }
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">
        <span>Название книги</span>
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Например, «Книга бабушки Веры»" />
      </label>
      <label className="field">
        <span>Подзаголовок <small>необязательно</small></span>
        <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} maxLength={160} placeholder="Истории, которые хочется перечитывать" />
      </label>
      <label className="field">
        <span>О чём эта книга <small>необязательно</small></span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={1200} placeholder="Для кого вы её собираете и что в ней будет" />
      </label>
      {mode === 'create' ? (
        <label className="field">
          <span>Первая глава</span>
          <input value={firstChapter} onChange={(event) => setFirstChapter(event.target.value)} maxLength={120} placeholder="Например, «Детство»" />
          <small>Главы можно добавить, переименовать и переставить потом.</small>
        </label>
      ) : null}
      {mode === 'create' ? <BookNameField value={myName} onChange={setMyName} /> : null}
      {mode === 'edit' && photos.length ? (
        <fieldset className="cover-picker">
          <legend>Фото на обложке</legend>
          <div className="cover-picker__options">
            <label className={'cover-picker__option cover-picker__option--plain ' + (!cover ? 'is-selected' : '')}>
              <input type="radio" name="cover" value="" checked={!cover} onChange={() => setCover('')} />
              <span>Без фото</span>
            </label>
            {photos.map((photo) => (
              <label key={photo.id} className={'cover-picker__option ' + (cover === photo.id ? 'is-selected' : '')}>
                <input type="radio" name="cover" value={photo.id} checked={cover === photo.id} onChange={() => setCover(photo.id)} aria-label={photo.alt || photo.fileName || 'Фотография'} />
                <MediaImage asset={photo} />
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="submit" className="button button--primary">{mode === 'create' ? 'Создать книгу' : 'Сохранить'}</button>
        <button type="button" className="button button--ghost" onClick={onCancel}>Отмена</button>
        {onDelete ? (
          <button type="button" className="button button--danger-ghost form-actions__end" onClick={onDelete}>
            <Trash2 size={17} aria-hidden="true" /> Удалить книгу
          </button>
        ) : null}
      </div>
    </form>
  );
}
