import { Cloud, CloudOff, RefreshCw, X } from 'lucide-react';
import type { Book } from '../../data/types';
import { useCloudSync } from '../../sync/CloudSync';
import { BookFiles, PublishBook } from './BookFiles';
import { formatSyncTime } from './cloudFormat';

/** Where the open book lives, its files on this device, and a button to sync it right now. */
export function BookCloudBar({ book }: { book: Book }) {
  const cloud = useCloudSync();
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
    return (
      <>
        {notices}
        <section className="cloud-bar cloud-bar--local" aria-label="Семейное хранилище">
          <span className="cloud-bar__icon"><CloudOff size={22} aria-hidden="true" /></span>
          <div className="cloud-bar__copy">
            <strong>Эта книга только на этом устройстве</strong>
            <span>Выгрузите её в облако — семейное хранилище на Google Диске. Тогда близких можно пригласить по ссылке, книга будет на всех ваших устройствах, а изменения будут приходить сами.</span>
            <PublishBook book={book} />
          </div>
        </section>
      </>
    );
  }

  const state = syncing ? 'Синхронизация…'
    : cloud.status === 'offline' ? 'Нет связи — изменения сохранены на устройстве и уйдут позже'
    : cloud.status === 'error' && cloud.error ? cloud.error
    : `Обновлено ${formatSyncTime(info.lastSyncAt)}`;
  return (
    <>
      {notices}
      <section className={'cloud-bar' + (cloud.status === 'error' ? ' cloud-bar--error' : '')} aria-label="Семейное хранилище">
        <span className="cloud-bar__icon"><Cloud size={22} aria-hidden="true" /></span>
        <div className="cloud-bar__copy">
          <strong>В облаке — семейном хранилище</strong>
          <span role="status">{state}</span>
          <span>{info.canManage ? 'Вы создатель книги — приглашайте близких в «Поделиться».' : `Создатель книги — ${info.creatorName ?? 'другой участник'}.`}</span>
          <BookFiles book={book} />
        </div>
        <button type="button" className="button button--secondary button--small" onClick={() => { void cloud.syncNow().catch(() => undefined); }} disabled={syncing}>
          <RefreshCw size={17} aria-hidden="true" className={syncing ? 'is-spinning' : undefined} /> Синхронизировать
        </button>
      </section>
    </>
  );
}
