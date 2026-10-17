import { Check, Copy, Link2, Send, UploadCloud, UserMinus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '../../app/AppState';
import type { Book, Person } from '../../data/types';
import { copyText, shareLink } from '../../lib/shareFile';
import { cloudErrorMessage } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';
import type { CloudMember } from '../../sync/syncEngine';
import { formatExpiry } from './cloudFormat';

function MembersList({ bookId, canManage }: { bookId: string; canManage: boolean }) {
  const cloud = useCloudSync();
  const { getPerson } = useAppState();
  const [members, setMembers] = useState<CloudMember[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    cloud.members(bookId).then((reply) => { setMembers(reply.members); setError(''); }, (failure) => setError(cloudErrorMessage(failure)));
    // cloud changes identity on every render; the list only depends on the book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);
  useEffect(load, [load]);

  const remove = async (member: CloudMember) => {
    if (!window.confirm(`Убрать из книги: ${member.name}? Обновления перестанут приходить на телефон этого человека, а ссылка, по которой он вошёл, перестанет действовать. Уже скачанная копия книги останется у него.`)) return;
    try {
      await cloud.removeMember(bookId, member.id);
      load();
    } catch (failure) {
      setError(cloudErrorMessage(failure));
    }
  };

  if (error) return <p className="field-message field-message--error">{error}</p>;
  if (!members) return <p className="muted-copy">Загружаем участников…</p>;
  return (
    <div className="cloud-members">
      <h4>Участники книги · {members.length}</h4>
      <ul>
        {members.map((member) => {
          const person = member.personId ? getPerson(member.personId) : undefined;
          return (
            <li key={member.id}>
              <span className="cloud-members__name">{member.name}{person && person.name !== member.name ? ` (${person.name})` : ''}</span>
              <span className="cloud-members__tags">{[member.isCreator && 'создатель', member.isYou && 'это вы'].filter(Boolean).join(' · ')}</span>
              {canManage && !member.isCreator && !member.isYou ? (
                <button type="button" className="icon-button" aria-label={`Убрать ${member.name} из книги`} onClick={() => { void remove(member); }}><UserMinus size={18} /></button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Invitations by link: the relative opens it and the shared book appears on their phone. */
export function CloudInvitePanel({ book, person }: { book: Book; person?: Person }) {
  const cloud = useCloudSync();
  const { people } = useAppState();
  const [personId, setPersonId] = useState(person?.id ?? '');
  const [invite, setInvite] = useState<{ link: string; expiresAt: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState('');
  const sendButton = useRef<HTMLButtonElement>(null);

  // The create button disappears with the new link; keep focus on the next step.
  useEffect(() => { if (invite) sendButton.current?.focus(); }, [invite]);
  const info = cloud.books[book.id];
  if (!cloud.connection) return null;

  if (!info) {
    const publish = async () => {
      setBusy(true);
      setError('');
      try { await cloud.publishBook(book.id); } catch (failure) { setError(cloudErrorMessage(failure)); } finally { setBusy(false); }
    };
    return (
      <section className="cloud-invite" aria-labelledby="cloud-invite-title">
        <h3 id="cloud-invite-title"><Link2 size={19} aria-hidden="true" /> Пригласить по ссылке</h3>
        <p>Сначала сохраните книгу в семейное хранилище на Google Диске. Тогда близкие получат её по ссылке, а всё новое будет приходить само — без пересылки файлов.</p>
        <button type="button" className="button button--primary" onClick={() => { void publish(); }} disabled={busy}>
          <UploadCloud size={18} aria-hidden="true" /> {busy ? 'Сохраняем…' : 'Сохранить в Google Диск'}
        </button>
        {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      </section>
    );
  }

  if (!info.canManage) {
    return (
      <section className="cloud-invite" aria-labelledby="cloud-invite-title">
        <h3 id="cloud-invite-title"><Link2 size={19} aria-hidden="true" /> Пригласить по ссылке</h3>
        <p>Приглашать в книгу может её создатель — {info.creatorName ?? 'тот, кто её создал'}. Попросите его прислать ссылку тому, кого хотите позвать.</p>
        <MembersList bookId={book.id} canManage={false} />
      </section>
    );
  }

  const invited = person ?? people.find((item) => item.id === personId);
  const create = async () => {
    setBusy(true);
    setError('');
    setSent('');
    try {
      const result = await cloud.createInviteLink(book.id, invited ? { id: invited.id, name: invited.name } : undefined);
      setInvite({ ...result, name: invited?.name ?? '' });
    } catch (failure) {
      setError(cloudErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  const text = invite ? `${invite.name ? invite.name + ', приглашаю' : 'Приглашаю'} тебя в нашу семейную книгу «${book.title}» в приложении «Истории близких». Открой ссылку — книга появится у тебя на телефоне, и можно будет дописывать свои воспоминания:` : '';
  const send = async () => {
    if (!invite) return;
    const outcome = await shareLink({ title: `Книга «${book.title}»`, text, url: invite.link });
    setSent(outcome === 'shared' ? 'Приглашение отправлено.' : outcome === 'copied' ? 'Приглашение скопировано — вставьте его в сообщение.' : outcome === 'failed' ? 'Не удалось открыть меню «Поделиться». Скопируйте ссылку вручную.' : '');
  };
  const copy = async () => {
    if (!invite) return;
    setCopied(await copyText(`${text}\n${invite.link}`));
    window.setTimeout(() => setCopied(false), 2400);
  };

  return (
    <section className="cloud-invite" aria-labelledby="cloud-invite-title">
      <h3 id="cloud-invite-title"><Link2 size={19} aria-hidden="true" /> Пригласить по ссылке</h3>
      <p>Близкий откроет ссылку и сразу получит книгу. Всё, что он добавит, появится у вас и у других участников. Регистрация и аккаунт Google ему не нужны.</p>
      {!person ? (
        <label className="field">
          <span>Кого приглашаете</span>
          <select value={personId} onChange={(event) => { setPersonId(event.target.value); setInvite(null); }}>
            <option value="">Не выбирать — человек подпишется сам</option>
            {people.map((item) => <option key={item.id} value={item.id}>{item.name}{item.relation ? ` — ${item.relation}` : ''}</option>)}
          </select>
          <small>Тогда его рассказы сразу будут подписаны этим именем.</small>
        </label>
      ) : null}
      {!invite ? (
        <button type="button" className="button button--primary" onClick={() => { void create(); }} disabled={busy}>
          <Link2 size={18} aria-hidden="true" /> {busy ? 'Создаём ссылку…' : invited ? `Создать ссылку для: ${invited.name}` : 'Создать ссылку-приглашение'}
        </button>
      ) : (
        <div className="cloud-invite__result">
          <label className="field">
            <span>Ссылка-приглашение{invite.name ? ` для: ${invite.name}` : ''}</span>
            <input readOnly value={invite.link} onFocus={(event) => event.currentTarget.select()} />
            <small>Действует до {formatExpiry(invite.expiresAt)}. Ссылка — как ключ: отправьте её только тому, кого приглашаете.</small>
          </label>
          <div className="share-book__actions">
            <button ref={sendButton} type="button" className="button button--primary" onClick={() => { void send(); }}><Send size={18} aria-hidden="true" /> Отправить</button>
            <button type="button" className="button button--secondary" onClick={() => { void copy(); }}>
              {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />} {copied ? 'Скопировано' : 'Скопировать'}
            </button>
          </div>
          {sent ? <p className="field-message field-message--success" role="status">{sent}</p> : null}
          <button type="button" className="text-button" onClick={() => setInvite(null)}>Создать ещё одну ссылку</button>
        </div>
      )}
      {error ? <p className="field-message field-message--error" role="alert">{error}</p> : null}
      <MembersList bookId={book.id} canManage />
    </section>
  );
}
