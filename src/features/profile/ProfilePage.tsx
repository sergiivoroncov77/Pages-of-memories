import { Check, Pencil, Save, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { MAX_NAME_LENGTH, profileAvatar, profileStore, useProfile } from '../../app/profile';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { DEMO_BOOK_ID } from '../../data/demoBook';
import type { Book } from '../../data/types';
import { cloudErrorMessage } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';

export function ProfilePage() {
  const profile = useProfile();
  const { books } = useAppState();
  const [name, setName] = useState(profile?.name ?? '');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  if (!profile) return null;

  const save = (event: FormEvent) => {
    event.preventDefault();
    try {
      const saved = profileStore.setName(name);
      setName(saved.name);
      setMessage({ error: false, text: 'Имя профиля сохранено.' });
    } catch (cause) {
      setMessage({ error: true, text: cause instanceof Error ? cause.message : 'Не удалось сохранить имя.' });
    }
  };
  const ownBooks = books.filter((book) => book.id !== DEMO_BOOK_ID);

  return (
    <div className="page">
      <PageHeader eyebrow="Профиль" title={profile.name}
        description="Профиль хранится на этом телефоне, пароль не нужен. Близкие видят вас по имени, которое вы выбрали в каждой книге." />

      <Card className="account-card">
        <Avatar person={profileAvatar(profile.name)} size="large" />
        <form className="account-card__form" onSubmit={save}>
          <label className="field">
            <span>Как вас зовут</span>
            <input value={name} onChange={(event) => { setName(event.target.value); setMessage(null); }} maxLength={MAX_NAME_LENGTH} autoComplete="name" required />
            <small>Это имя подставляется, когда вы создаёте книгу или принимаете приглашение. Имена в уже открытых книгах меняются ниже.</small>
          </label>
          <button type="submit" className="button button--primary button--normal" disabled={name.trim() === profile.name}><Save size={18} aria-hidden="true" /> Сохранить</button>
          {message ? <p className={`field-message ${message.error ? 'field-message--error' : 'field-message--success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p> : null}
        </form>
      </Card>

      <section className="section" aria-labelledby="profile-books-title">
        <div className="section__heading">
          <div>
            <p className="eyebrow">Ваши имена</p>
            <h2 id="profile-books-title">Как вас подписывать в книгах</h2>
          </div>
        </div>
        {ownBooks.length ? (
          <ul className="profile-books">
            {ownBooks.map((book) => <BookName key={book.id} book={book} fallback={profile.name} />)}
          </ul>
        ) : (
          <p className="muted-copy">Книг пока нет. <Link to="/book" className="text-link">Создайте книгу</Link> или откройте ссылку-приглашение от близких.</p>
        )}
      </section>
    </div>
  );
}

function BookName({ book, fallback }: { book: Book; fallback: string }) {
  const cloud = useCloudSync();
  const { getPerson } = useAppState();
  const personId = cloud.myPersonId(book.id);
  const person = personId ? getPerson(personId) : undefined;
  const shared = cloud.books[book.id];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(person?.name ?? fallback);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await cloud.setMyName(book.id, value);
      setEditing(false);
      setMessage({ error: false, text: shared ? 'Готово: новое имя увидят все участники книги.' : 'Готово.' });
    } catch (cause) {
      setMessage({ error: true, text: cloudErrorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="profile-books__item">
      <span className="profile-books__icon" aria-hidden="true"><UserRound size={20} /></span>
      <div className="profile-books__copy">
        <strong>«{book.title}»</strong>
        <span>{person ? <>Вы подписаны: <b>{person.name}</b></> : 'Имя в этой книге ещё не выбрано'}{shared ? ' · общая книга' : ''}</span>
        {shared && !shared.canManage ? <small>Создатель книги{shared.creatorName ? ` — ${shared.creatorName}` : ''} — тоже может изменить ваше имя.</small> : null}
        {editing ? (
          <form className="profile-books__form" onSubmit={(event) => { void save(event); }}>
            <label className="field">
              <span>Имя в книге «{book.title}»</span>
              <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} maxLength={MAX_NAME_LENGTH} required />
            </label>
            <div className="page-action-group">
              <button type="submit" className="button button--primary button--small" disabled={busy}><Check size={17} aria-hidden="true" /> {busy ? 'Сохраняем…' : 'Сохранить'}</button>
              <button type="button" className="button button--ghost button--small" onClick={() => setEditing(false)} disabled={busy}>Отмена</button>
            </div>
          </form>
        ) : null}
        {message ? <p className={`field-message ${message.error ? 'field-message--error' : 'field-message--success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p> : null}
      </div>
      {!editing ? (
        <button type="button" className="button button--secondary button--small" onClick={() => { setValue(person?.name ?? fallback); setEditing(true); setMessage(null); }}>
          <Pencil size={16} aria-hidden="true" /> {person ? 'Изменить' : 'Выбрать имя'}
        </button>
      ) : null}
    </li>
  );
}
