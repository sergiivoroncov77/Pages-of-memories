import { Check, Copy, Download, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import type { Book, Person } from '../../data/types';
import { formatFileSize } from '../../lib/format';
import { appAddress, copyText, downloadFile, shareOrDownload } from '../../lib/shareFile';
import { useCloudSync } from '../../sync/CloudSync';
import { CloudInvitePanel } from '../cloud/CloudInvitePanel';

type Status = { kind: 'idle' } | { kind: 'packing' } | { kind: 'done'; message: string; file: File } | { kind: 'error'; message: string };

/**
 * Sharing without accounts. With the family storage connected, relatives get
 * an invitation link and see every change. Without it — or without internet
 * on their side — the book leaves as one file through any messenger; the
 * relative adds their memories and sends it back, new things are merged in.
 */
export function ShareBookPanel({ book, person, onClose }: { book: Book; person?: Person; onClose?: () => void }) {
  const { packBook, moments, perspectives, mediaAssets } = useAppState();
  const cloud = useCloudSync();
  const personName = person?.name;
  const shared = Boolean(cloud.connection && cloud.books[book.id]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const address = appAddress();
  const momentIds = new Set(moments.filter((moment) => moment.bookId === book.id).map((moment) => moment.id));
  const mediaIds = new Set([
    book.coverMediaAssetId,
    ...moments.filter((moment) => momentIds.has(moment.id)).map((moment) => moment.narrationMediaAssetId),
    ...perspectives.filter((item) => momentIds.has(item.momentId)).map((item) => item.mediaAssetId)
  ]);
  const estimated = mediaAssets.filter((asset) => mediaIds.has(asset.id)).reduce((total, asset) => total + (asset.sizeBytes ?? 0), 0) * 1.37;
  const message = `${personName ? personName + ', это' : 'Это'} наша семейная книга «${book.title}». Откройте приложение «Истории близких»: ${address} — затем «Книга» → «Открыть файл книги» и выберите файл из этого сообщения. Добавьте свои воспоминания и пришлите файл обратно.`;

  const send = async () => {
    setStatus({ kind: 'packing' });
    try {
      const file = await packBook(book.id);
      const outcome = await shareOrDownload(file, { title: `Книга «${book.title}»`, text: message });
      setStatus(outcome === 'cancelled' ? { kind: 'idle' } : {
        kind: 'done',
        file,
        message: outcome === 'shared' ? `Файл отправлен (${formatFileSize(file.size)}).` : `Файл сохранён в «Загрузки» (${formatFileSize(file.size)}). Отправьте его близким в любом мессенджере.`
      });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Не удалось подготовить файл книги.' });
    }
  };

  const copyMessage = async () => {
    setCopied(await copyText(message));
    window.setTimeout(() => setCopied(false), 2400);
  };

  const fileSharing = (
    <>
      <ol className="share-steps">
        <li><strong>Отправьте файл книги.</strong> <span>Примерный размер: {estimated > 0 ? formatFileSize(estimated) : 'меньше 1 МБ'}. Фото, голос и видео едут внутри.</span></li>
        <li><strong>Близкий открывает приложение</strong> <span>по ссылке — на телефоне или планшете в Chrome, на компьютере в любом браузере — и может установить его как приложение.</span></li>
        <li><strong>«Книга» → «Открыть файл книги».</strong> <span>Книга появится у него на полке. Когда он пришлёт файл обратно, откройте его так же.</span></li>
      </ol>

      <div className="share-book__actions">
        <button type="button" className="button button--primary" onClick={() => { void send(); }} disabled={status.kind === 'packing'}>
          <Send size={18} aria-hidden="true" /> {status.kind === 'packing' ? 'Собираем файл…' : 'Отправить книгу'}
        </button>
        <button type="button" className="button button--secondary" onClick={() => { void copyMessage(); }}>
          {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />} {copied ? 'Скопировано' : 'Скопировать приглашение'}
        </button>
      </div>
      {status.kind === 'done' ? (
        <p className="field-message field-message--success" role="status">
          {status.message} <button type="button" className="text-button" onClick={() => downloadFile(status.file)}><Download size={15} aria-hidden="true" /> Скачать ещё раз</button>
        </p>
      ) : null}
      {status.kind === 'error' ? <p className="field-message field-message--error" role="alert">{status.message}</p> : null}
      <p className="share-book__note">Файл — копия на момент отправки: удаления не переносятся, а одинаковые записи не дублируются. Ссылка на приложение: <a href={address}>{address.replace(/^https?:\/\//, '')}</a></p>
    </>
  );

  return (
    <Card className="share-book" aria-labelledby="share-book-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Без регистрации</p>
          <h2 id="share-book-title">{personName ? `Пригласить: ${personName}` : 'Поделиться книгой'}</h2>
          {cloud.connection ? null : <p>Книга уйдёт одним файлом — через MAX, почту, Bluetooth или другой мессенджер. Близкий откроет его в своём приложении, допишет воспоминания и пришлёт обратно, а новое добавится к вашей книге.</p>}
        </div>
        {onClose ? <button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={20} /></button> : null}
      </div>

      {cloud.connection ? <CloudInvitePanel book={book} person={person} /> : (
        <p className="share-book__note share-book__hint">Хотите, чтобы близкие получали книгу по ссылке и сразу видели новое? <Link to="/settings#cloud" className="text-link">Подключите семейное хранилище на Google Диске</Link>.</p>
      )}

      {cloud.connection ? (
        <details className="share-book__file" open={!shared}>
          <summary>Отправить файлом — если у близкого нет интернета или хранилище недоступно</summary>
          {fileSharing}
        </details>
      ) : fileSharing}
    </Card>
  );
}
