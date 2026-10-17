import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { PersonInput } from '../../data/library';
import type { Person } from '../../data/types';

interface PersonFormProps {
  initial?: Person;
  submitLabel: string;
  onSubmit: (values: PersonInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
  /** Why the person cannot be deleted here, shown instead of the delete button. */
  deleteNote?: string;
}

const RELATIONS = ['Бабушка', 'Дедушка', 'Мама', 'Папа', 'Сестра', 'Брат', 'Тётя', 'Дядя', 'Дочь', 'Сын', 'Друг семьи'];

export function PersonForm({ initial, submitLabel, onSubmit, onCancel, onDelete, deleteNote }: PersonFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [relation, setRelation] = useState(initial?.relation ?? '');
  const [birthYear, setBirthYear] = useState(initial?.birthYear ? String(initial.birthYear) : '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !relation.trim()) { setError('Напишите имя и кем вам приходится этот человек.'); return; }
    try {
      onSubmit({ name, relation, bio, birthYear: birthYear.trim() ? Number(birthYear) : undefined });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить.');
    }
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <div className="form-row">
        <label className="field">
          <span>Имя</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required autoComplete="off" placeholder="Например, Вера Николаевна" />
        </label>
        <label className="field">
          <span>Кем приходится</span>
          <input value={relation} onChange={(event) => setRelation(event.target.value)} maxLength={60} required list="person-relations" placeholder="Бабушка, дядя, сестра…" />
          <datalist id="person-relations">{RELATIONS.map((item) => <option key={item} value={item} />)}</datalist>
        </label>
      </div>
      <label className="field field--narrow">
        <span>Год рождения <small>необязательно</small></span>
        <input value={birthYear} onChange={(event) => setBirthYear(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" pattern="[0-9]{4}" placeholder="1948" />
      </label>
      <label className="field">
        <span>Пара слов о человеке <small>необязательно</small></span>
        <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={3} maxLength={800} placeholder="Где вырос(ла), чем занимается, что любит вспоминать" />
      </label>
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="submit" className="button button--primary">{submitLabel}</button>
        <button type="button" className="button button--ghost" onClick={onCancel}>Отмена</button>
        {onDelete ? (
          <button type="button" className="button button--danger-ghost form-actions__end" onClick={onDelete}>
            <Trash2 size={17} aria-hidden="true" /> Удалить
          </button>
        ) : null}
      </div>
      {deleteNote ? <p className="delete-blocked">{deleteNote}</p> : null}
    </form>
  );
}
