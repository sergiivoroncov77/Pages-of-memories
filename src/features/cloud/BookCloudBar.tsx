import { Cloud, CloudOff, RefreshCw, UploadCloud, X } from 'lucide-react';
import { useState } from 'react';
import type { Book } from '../../data/types';
import { cloudErrorMessage } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';
import { formatSyncTime } from './cloudFormat';

/** Where the open book lives and a button to sync it right now. */
export function BookCloudBar({ book }: { book: Book }) {
  const cloud = useCloudSync();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  if (!cloud.connection) return null;
  const info = cloud.books[book.id];
  const syncing = cloud.status === 'syncing';

  const notices = cloud.notices.length ? (
    <div className="cloud-notices" role="status">
      {cloud.notices.map((notice) => <p key={notice}>{notice}</p>)}
      <button type="button" className="icon-button" aria-label="Скрыть сообщения" onClick={cloud.dismissNotices}><X size={18} /></button>
    </div>
  ) : null;

  if (!info) {
    const publish = async () => {
      setPublishing(true);
      setPublishError('');
      try {
        await cloud.publishBook(book.id);
      } catch (error) {
        setPublishError(cloudErrorMessage(error));
      } finally {
        setPublishing(false);
      }
    };
    return (
      <>
        {notices}
        <section className="cloud-bar cloud-bar--local" aria-label="Семейное хранилище">
          <span className="cloud-bar__icon"><CloudOff size={22} aria-hidden="true" /></span>
          <div className="cloud-bar__copy">
            <strong>Эта книга только на этом телефоне</strong>
            <span>Сохраните её в семейное хранилище на Google Диске — тогда близких можно пригласить по ссылке, и все изменения будут приходить сами.</span>
            {publishError ? <span className="cloud-bar__error" role="alert">{publishError}</span> : null}
          </div>
          <button type="button" className="button button--primary button--small" onClick={() => { void publish(); }} disabled={publishing}>
            <UploadCloud size={17} aria-hidden="true" /> {publishing ? 'Сохраняем…' : 'Сохранить в Google Диск'}
          </button>
        </section>
      </>
    );
  }

  const state = syncing ? 'Синхронизация…'
    : cloud.status === 'offline' ? 'Нет связи — изменения сохранены на телефоне и уйдут позже'
    : cloud.status === 'error' && cloud.error ? cloud.error
    : `Обновлено ${formatSyncTime(info.lastSyncAt)}`;
  return (
    <>
      {notices}
      <section className={'cloud-bar' + (cloud.status === 'error' ? ' cloud-bar--error' : '')} aria-label="Семейное хранилище">
        <span className="cloud-bar__icon"><Cloud size={22} aria-hidden="true" /></span>
        <div className="cloud-bar__copy">
          <strong>В семейном хранилище</strong>
          <span role="status">{state}</span>
          <span>{info.canManage ? 'Вы создатель книги — приглашайте близких в «Поделиться».' : `Создатель книги — ${info.creatorName ?? 'другой участник'}.`}</span>
        </div>
        <button type="button" className="button button--secondary button--small" onClick={() => { void cloud.syncNow().catch(() => undefined); }} disabled={syncing}>
          <RefreshCw size={17} aria-hidden="true" className={syncing ? 'is-spinning' : undefined} /> Синхронизировать
        </button>
      </section>
    </>
  );
}
