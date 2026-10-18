import { CloudUpload, HardDriveDownload, Pause, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Book } from '../../data/types';
import { formatFileSize, pluralize } from '../../lib/format';
import { cloudErrorMessage } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';
import { BookNameField } from '../profile/BookNameField';
import { useBookFiles } from './useBookFiles';

const files = (count: number) => `${count} ${pluralize(count, 'файл', 'файла', 'файлов')}`;
/** Above this a download asks first: on mobile internet it is better to wait for Wi-Fi. */
const ASK_ABOVE_BYTES = 100 * 1024 * 1024;

/** Put a book of this device into the family storage: «Выгрузить в облако». */
export function PublishBook({ book }: { book: Book }) {
  const cloud = useCloudSync();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [myName, setMyName] = useState('');
  // Books made before names were asked: their creator picks one now.
  const needsName = !cloud.myPersonId(book.id);

  const publish = async () => {
    setPublishing(true);
    setError('');
    try {
      await cloud.publishBook(book.id, myName);
    } catch (failure) {
      setError(cloudErrorMessage(failure));
    } finally {
      setPublishing(false);
    }
  };

  if (!cloud.connection) {
    return <p className="book-files__note">Чтобы выгрузить книгу в облако, <Link to="/settings#cloud" className="text-link">подключите семейное хранилище</Link> или примите приглашение в любую книгу.</p>;
  }
  return (
    <div className="book-files__publish">
      {needsName ? <BookNameField value={myName} onChange={setMyName} /> : null}
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      <button type="button" className="button button--primary button--small" onClick={() => { void publish(); }} disabled={publishing || (needsName && !myName.trim())}>
        <CloudUpload size={17} aria-hidden="true" /> {publishing ? 'Выгружаем…' : 'Выгрузить в облако'}
      </button>
    </div>
  );
}

/**
 * Where a book's photos, voices and videos are, with the buttons for this
 * one book: download it to the device, free the device, or put it into the cloud.
 */
export function BookFiles({ book, publish = true }: { book: Book; publish?: boolean }) {
  const cloud = useCloudSync();
  const stats = useBookFiles(book.id);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [freeing, setFreeing] = useState(false);
  const shared = cloud.books[book.id];
  const download = cloud.downloads[book.id];
  if (!stats) return null;

  if (!shared) {
    return (
      <div className="book-files">
        <p className="book-files__state">Только на этом устройстве{stats.count ? ` · ${files(stats.count)}, ${formatFileSize(stats.bytes)}` : ''}.</p>
        {publish ? <PublishBook book={book} /> : null}
      </div>
    );
  }

  const running = Boolean(download?.running);
  const startDownload = () => {
    setMessage(null);
    if (stats.cloudOnlyBytes > ASK_ABOVE_BYTES && !window.confirm(
      `Скачать ${formatFileSize(stats.cloudOnlyBytes)} на это устройство? Если интернет мобильный, лучше дождаться Wi‑Fi. Пока приложение открыто, скачивание идёт; если закрыть — продолжится при следующем открытии.`)) return;
    void cloud.downloadBook(book.id);
  };
  const free = async () => {
    if (!window.confirm(`Удалить с этого устройства фото, голос и видео книги «${book.title}» (${formatFileSize(stats.freeableBytes)})? Книга останется, а файлы будут открываться из облака, когда есть интернет. В облаке и у близких ничего не удалится.`)) return;
    setFreeing(true);
    setMessage(null);
    try {
      const result = await cloud.freeBookFiles(book.id);
      setMessage({ error: false, text: `Освобождено ${formatFileSize(result.bytes)}.${result.kept ? ` ${files(result.kept)} остались: они ещё не выгружены в облако или нужны другой книге.` : ''}` });
    } catch (failure) {
      setMessage({ error: true, text: cloudErrorMessage(failure) });
    } finally {
      setFreeing(false);
    }
  };

  const state = running
    ? `Скачиваем на устройство: ${download.done} из ${download.total || '…'}${download.failed ? `, не скачалось ${download.failed}` : ''}.`
    : stats.count === 0 ? 'Фото, голоса и видео в книге пока нет.'
    : shared.keepFiles && stats.cloudOnly === 0 ? `Скачана на устройство · ${files(stats.local)}, ${formatFileSize(stats.localBytes)}. Новые файлы скачиваются сами.`
    : shared.keepFiles ? `Скачивается на устройство: осталось ${files(stats.cloudOnly)}, ${formatFileSize(stats.cloudOnlyBytes)}.`
    : `Фото, голос и видео открываются из облака · ${files(stats.count)}, ${formatFileSize(stats.bytes)}${stats.local ? `. На устройстве: ${files(stats.local)}, ${formatFileSize(stats.localBytes)}` : ''}.`;

  return (
    <div className="book-files">
      <p className="book-files__state" role="status">{state}</p>
      {running && download.total ? <progress className="book-files__progress" value={download.done + download.failed} max={download.total} aria-label="Скачивание файлов книги" /> : null}
      {stats.notUploaded ? <p className="book-files__note">Ещё не в облаке: {files(stats.notUploaded)}. Уйдут при синхронизации.</p> : null}
      {download?.error ? <p className="field-message field-message--error" role="alert">{download.error} Скачанное осталось на устройстве.</p> : null}
      {!running && download && !download.error && download.failed ? <p className="field-message field-message--error" role="alert">Не скачалось: {files(download.failed)}. Попробуйте ещё раз.</p> : null}
      {message ? <p className={`field-message ${message.error ? 'field-message--error' : 'field-message--success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p> : null}
      <div className="page-action-group">
        {running ? (
          <button type="button" className="button button--secondary button--small" onClick={() => cloud.stopDownload(book.id)}><Pause size={16} aria-hidden="true" /> Остановить</button>
        ) : stats.cloudOnly ? (
          <button type="button" className="button button--secondary button--small" onClick={startDownload} disabled={!cloud.connection}>
            <HardDriveDownload size={16} aria-hidden="true" /> {shared.keepFiles ? 'Докачать сейчас' : 'Скачать на устройство'} <span className="button__size">· {formatFileSize(stats.cloudOnlyBytes)}</span>
          </button>
        ) : null}
        {!running && stats.freeable ? (
          <button type="button" className="button button--danger-ghost button--small" onClick={() => { void free(); }} disabled={freeing}>
            <Trash2 size={16} aria-hidden="true" /> {freeing ? 'Удаляем…' : <>Удалить файлы с устройства <span className="button__size">· {formatFileSize(stats.freeableBytes)}</span></>}
          </button>
        ) : null}
      </div>
    </div>
  );
}
