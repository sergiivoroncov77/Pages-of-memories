import { BookOpen, Check, Cloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { cloudErrorMessage, parseInviteHash } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';
import type { InvitePreview } from '../../sync/syncEngine';

/** Opened from an invitation link: …/join#s=<storage>&c=<code>. */
export function JoinPage() {
  const cloud = useCloudSync();
  const { setActiveBook } = useAppState();
  const navigate = useNavigate();
  const [invite] = useState(() => parseInviteHash(window.location.hash));
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!invite) return;
    let active = true;
    cloud.previewInvite(invite.url, invite.code).then((reply) => {
      if (active) setPreview(reply);
    }, (failure) => {
      if (active) setError(cloudErrorMessage(failure));
    });
    return () => { active = false; };
    // The invitation is read once from the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite]);

  if (!invite) {
    return (
      <div className="page">
        <EmptyState title="Ссылка-приглашение повреждена" description="Скопируйте ссылку из сообщения целиком или попросите прислать её ещё раз."
          action={<Link to="/book" className="button button--secondary">Открыть приложение</Link>} />
      </div>
    );
  }

  const alreadyIn = preview ? Boolean(cloud.connection?.url === invite.url && cloud.books[preview.bookId]) : false;
  const displayName = preview?.personName || name.trim();

  const accept = async () => {
    if (!preview) return;
    if (cloud.connection && cloud.connection.url !== invite.url && !window.confirm(
      'Это приглашение из другого семейного хранилища. Подключить телефон к нему? Книги из нынешнего хранилища останутся на телефоне, но перестанут обновляться.')) return;
    setJoining(true);
    setError('');
    try {
      const { bookId, pending } = await cloud.acceptInvite(invite.url, invite.code, displayName || 'Участник');
      setActiveBook(bookId);
      // The code is no longer needed in the address bar or history.
      window.history.replaceState(window.history.state, '', window.location.pathname);
      navigate('/book', { replace: true, state: { notice: pending
        ? `Книга «${preview.bookTitle}» на вашей полке. Часть фото и записей ещё загружается — они появятся при следующей синхронизации.`
        : `Книга «${preview.bookTitle}» на вашей полке. Добавляйте воспоминания — их увидят все участники.` } });
    } catch (failure) {
      setError(cloudErrorMessage(failure));
      setJoining(false);
    }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Приглашение в книгу" title={preview ? `«${preview.bookTitle}»` : 'Открываем приглашение…'}
        description="Семейная книга воспоминаний: рассказы, фото, голос и видео близких." />
      {error ? <p className="field-message field-message--error library-notice" role="alert">{error}</p> : null}
      {preview ? (
        <Card tone="warm" className="join-card">
          <span className="join-card__icon"><BookOpen size={28} aria-hidden="true" /></span>
          <div>
            <h2>{preview.inviterName} приглашает вас в книгу</h2>
            {preview.personName ? <p>Приглашение для: <strong>{preview.personName}</strong>. Ваши рассказы будут подписаны этим именем.</p> : null}
            <p>Книга появится на этом телефоне. Всё, что вы добавите — рассказы, фото, голос, видео, отклики, — увидят остальные участники. Регистрация не нужна.</p>
            {!preview.personName ? (
              <label className="field">
                <span>Как вас подписать</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, тётя Галя" maxLength={80} autoComplete="name" />
              </label>
            ) : null}
            {alreadyIn ? <p className="field-message field-message--success"><Check size={16} aria-hidden="true" /> Эта книга уже есть на телефоне — откройте её на полке.</p> : null}
            <div className="page-action-group">
              <button type="button" className="button button--primary" onClick={() => { void accept(); }} disabled={joining || (!preview.personName && !name.trim())}>
                <Cloud size={18} aria-hidden="true" /> {joining ? 'Загружаем книгу…' : 'Принять приглашение'}
              </button>
              <Link to="/book" className="button button--ghost">Не сейчас</Link>
            </div>
            <p className="share-book__note">Совет: откройте ссылку в Chrome и выберите «Добавить на главный экран» — приложение будет работать и без интернета, а изменения отправит, когда связь появится.</p>
          </div>
        </Card>
      ) : !error ? <p className="muted-copy" role="status">Проверяем приглашение…</p> : null}
    </div>
  );
}
