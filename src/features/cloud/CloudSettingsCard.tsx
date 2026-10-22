import { Cloud, CloudOff, LogIn, RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '../../app/profile';
import { Card } from '../../components/Card';
import { BookNameField } from '../profile/BookNameField';
import { pluralize } from '../../lib/format';
import { cloudErrorMessage, normalizeServerUrl } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';
import { formatSyncTime } from './cloudFormat';
import { ScriptUpdate } from './ScriptUpdate';

/** Connect the owner's first device to the family storage on Google Drive, or show its state. */
export function CloudSettingsCard() {
  const cloud = useCloudSync();
  const profile = useProfile();
  const [url, setUrl] = useState('');
  // The book being opened from the storage, and how its owner signs in it.
  const [opening, setOpening] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState('');

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeServerUrl(url);
    if (!normalized.ok) { setError(normalized.error); return; }
    setBusy(true);
    setError('');
    try {
      await cloud.connectOwner(normalized.url, profile?.name ?? 'Владелец хранилища');
      setUrl('');
    } catch (failure) {
      setError(cloudErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  if (!cloud.connection) {
    return (
      <Card className="settings-section cloud-card" id="cloud">
        <div className="settings-section__heading">
          <span className="settings-section__icon"><CloudOff size={23} aria-hidden="true" /></span>
          <div>
            <h2>Семейное хранилище на Google Диске</h2>
            <p>Книги лежат в папке на Google Диске владельца. Близкие получают их по ссылке-приглашению — без регистрации и без аккаунта Google, а всё новое приходит всем участникам книги.</p>
          </div>
        </div>
        {cloud.error ? <p className="field-message field-message--error" role="alert">{cloud.error}</p> : null}
        <ol className="share-steps">
          <li><strong>Владелец один раз ставит скрипт</strong> <span>в свой Google аккаунт — <Link to="/cloud/setup" className="text-link">пошаговая инструкция</Link>, около 10 минут.</span></li>
          <li><strong>Вставляет сюда адрес скрипта</strong> <span>и нажимает «Подключить» — и становится владельцем хранилища. Другие свои устройства он подключит потом по QR-коду в «Устройствах».</span></li>
          <li><strong>Приглашает близких</strong> <span>из книги: «Поделиться» → «Создать ссылку-приглашение».</span></li>
        </ol>
        <form className="cloud-connect" onSubmit={(event) => { void connect(event); }}>
          <label className="field">
            <span>Адрес скрипта</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://script.google.com/macros/s/…/exec" inputMode="url" autoComplete="off" spellCheck={false} required />
          </label>
          {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
          <div className="settings-actions">
            <button type="submit" className="button button--primary" disabled={busy}><LogIn size={18} aria-hidden="true" /> {busy ? 'Подключаем…' : 'Подключить хранилище'}</button>
          </div>
        </form>
        <p className="share-book__note">Вас пригласили? Просто откройте ссылку из сообщения — здесь ничего настраивать не нужно.</p>
      </Card>
    );
  }

  const { connection } = cloud;
  const shared = Object.keys(cloud.books).length;
  const syncing = cloud.status === 'syncing';
  const join = async (bookId: string, back: boolean) => {
    setJoining(bookId);
    setError('');
    try {
      await (back ? cloud.attachBook(bookId) : cloud.joinBook(bookId, opening?.name ?? ''));
      setOpening(null);
    } catch (failure) {
      setError(cloudErrorMessage(failure));
    } finally {
      setJoining('');
    }
  };

  return (
    <Card className="settings-section cloud-card" id="cloud">
      <div className="settings-section__heading">
        <span className="settings-section__icon settings-section__icon--sage"><Cloud size={23} aria-hidden="true" /></span>
        <div>
          <h2>Семейное хранилище подключено</h2>
          <p>{profile?.name ?? connection.name}{connection.admin ? ' · владелец хранилища' : ''} · {shared} {pluralize(shared, 'общая книга', 'общие книги', 'общих книг')} на этом устройстве. Отключить устройство — в «Устройствах» ниже.</p>
        </div>
      </div>
      <p role="status">{syncing ? 'Синхронизация…' : cloud.status === 'offline' ? 'Нет связи с хранилищем — изменения уйдут, когда появится интернет.' : `Последняя синхронизация: ${formatSyncTime(cloud.lastSyncAt)}.`}</p>
      {cloud.status === 'error' && cloud.error ? <p className="field-message field-message--error" role="alert">{cloud.error}</p> : null}
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      <div className="settings-actions">
        <button type="button" className="button button--primary" onClick={() => { void cloud.syncNow().catch(() => undefined); }} disabled={syncing}>
          <RefreshCw size={18} aria-hidden="true" className={syncing ? 'is-spinning' : undefined} /> Синхронизировать сейчас
        </button>
        {connection.admin ? <Link to="/cloud/setup" className="button button--ghost">Инструкция по скрипту</Link> : null}
      </div>
      {connection.admin ? <ScriptUpdate connection={connection} /> : null}
      {connection.admin && cloud.otherBooks.length ? (
        <div className="cloud-other-books">
          <h3>Другие книги в хранилище</h3>
          <p>Их создали близкие и вас пока не пригласили. Как владелец хранилища вы можете открыть любую — например, если создатель потерял своё устройство.</p>
          <ul>
            {cloud.otherBooks.map((book) => (
              <li key={book.id}>
                <span><strong>{book.title}</strong> · создатель {book.creatorName}</span>
                {opening?.id === book.id ? (
                  <form className="cloud-open-book" onSubmit={(event) => { event.preventDefault(); void join(book.id, false); }}>
                    <BookNameField autoFocus value={opening.name} onChange={(value) => setOpening({ id: book.id, name: value })} />
                    <div className="page-action-group">
                      <button type="submit" className="button button--primary button--small" disabled={joining === book.id || !opening.name.trim()}>
                        {joining === book.id ? 'Открываем…' : 'Открыть'}
                      </button>
                      <button type="button" className="button button--ghost button--small" onClick={() => setOpening(null)}>Отмена</button>
                    </div>
                  </form>
                ) : (
                  <button type="button" className="button button--secondary button--small" onClick={() => setOpening({ id: book.id, name: '' })}>Открыть на этом устройстве</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {cloud.detachedBooks.length ? (
        <div className="cloud-other-books">
          <h3>Убраны с этого устройства</h3>
          <p>Ваши книги, которые вы убрали только отсюда: у близких они на месте. Вернуть книгу — значит снова скачать её из хранилища со всеми новыми рассказами.</p>
          <ul>
            {cloud.detachedBooks.map((book) => (
              <li key={book.id}>
                <span><strong>{book.title}</strong>{book.creatorName ? ` · создатель ${book.creatorName}` : ''}</span>
                <button type="button" className="button button--secondary button--small" disabled={joining === book.id} onClick={() => { void join(book.id, true); }}>
                  {joining === book.id ? 'Скачиваем…' : 'Вернуть на это устройство'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
