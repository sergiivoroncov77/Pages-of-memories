import { Cloud, CloudOff, LogIn, RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { pluralize } from '../../lib/format';
import { cloudErrorMessage, normalizeServerUrl } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';
import { formatSyncTime } from './cloudFormat';

/** Connect the owner's phone to the family storage on Google Drive, or show its state. */
export function CloudSettingsCard() {
  const cloud = useCloudSync();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
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
      await cloud.connectOwner(normalized.url, name.trim() || 'Владелец хранилища');
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
          <li><strong>Вставляет сюда адрес скрипта</strong> <span>и нажимает «Подключить». Этот телефон станет телефоном владельца.</span></li>
          <li><strong>Приглашает близких</strong> <span>из книги: «Поделиться» → «Создать ссылку-приглашение».</span></li>
        </ol>
        <form className="cloud-connect" onSubmit={(event) => { void connect(event); }}>
          <label className="field">
            <span>Адрес скрипта</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://script.google.com/macros/s/…/exec" inputMode="url" autoComplete="off" spellCheck={false} required />
          </label>
          <label className="field">
            <span>Ваше имя для близких</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Сергей" maxLength={80} autoComplete="name" />
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
  const disconnect = () => {
    const warning = connection.admin
      ? ' Это телефон владельца: подключиться снова получится, только если запустить в скрипте функцию resetOwner (см. инструкцию).'
      : ' Чтобы подключиться снова, понадобится новое приглашение.';
    if (window.confirm(`Отключить этот телефон от семейного хранилища? Книги останутся на телефоне, но перестанут обновляться.${warning}`)) cloud.disconnect();
  };
  const join = async (bookId: string, back: boolean) => {
    setJoining(bookId);
    setError('');
    try { await (back ? cloud.attachBook(bookId) : cloud.joinBook(bookId)); } catch (failure) { setError(cloudErrorMessage(failure)); } finally { setJoining(''); }
  };

  return (
    <Card className="settings-section cloud-card" id="cloud">
      <div className="settings-section__heading">
        <span className="settings-section__icon settings-section__icon--sage"><Cloud size={23} aria-hidden="true" /></span>
        <div>
          <h2>Семейное хранилище подключено</h2>
          <p>{connection.name}{connection.admin ? ' · владелец хранилища' : ''} · {shared} {pluralize(shared, 'общая книга', 'общие книги', 'общих книг')} на этом телефоне.</p>
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
        <button type="button" className="button button--danger-ghost" onClick={disconnect}>Отключить этот телефон</button>
      </div>
      {connection.admin && cloud.otherBooks.length ? (
        <div className="cloud-other-books">
          <h3>Другие книги в хранилище</h3>
          <p>Их создали близкие и вас пока не пригласили. Как владелец хранилища вы можете открыть любую — например, если создатель потерял телефон.</p>
          <ul>
            {cloud.otherBooks.map((book) => (
              <li key={book.id}>
                <span><strong>{book.title}</strong> · создатель {book.creatorName}</span>
                <button type="button" className="button button--secondary button--small" disabled={joining === book.id} onClick={() => { void join(book.id, false); }}>
                  {joining === book.id ? 'Открываем…' : 'Открыть на этом телефоне'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {cloud.detachedBooks.length ? (
        <div className="cloud-other-books">
          <h3>Убраны с этого телефона</h3>
          <p>Вы по-прежнему участник этих книг, и у близких они на месте. Вернуть книгу — значит снова скачать её из хранилища со всеми новыми рассказами.</p>
          <ul>
            {cloud.detachedBooks.map((book) => (
              <li key={book.id}>
                <span><strong>{book.title}</strong>{book.creatorName ? ` · создатель ${book.creatorName}` : ''}</span>
                <button type="button" className="button button--secondary button--small" disabled={joining === book.id} onClick={() => { void join(book.id, true); }}>
                  {joining === book.id ? 'Скачиваем…' : 'Вернуть на телефон'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
