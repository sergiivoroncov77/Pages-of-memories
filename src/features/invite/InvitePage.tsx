import { BookOpen, Check, Copy, FileText, Link2, MessageCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function InvitePage() {
  const { personId } = useParams();
  const { getPerson, project } = useAppState();
  const [copiedLink, setCopiedLink] = useState('');
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState('');
  const person = personId ? getPerson(personId) : undefined;
  const inviteLink = `https://family-stories.example/join/${encodeURIComponent(project.inviteCode.toLowerCase())}`;
  const copied = copiedLink === inviteLink;

  if (!person) {
    return (
      <div className="page">
        <EmptyState
          title="Приглашение не найдено"
          description="Проверьте ссылку или выберите человека из списка."
          action={<Link to="/people" className="text-link">К списку близких</Link>}
        />
      </div>
    );
  }

  const copyLink = async () => {
    setCopyError('');
    setCopiedLink('');
    setCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLink(inviteLink);
    } catch {
      setCopyError('Не удалось скопировать пример. Выделите адрес в поле и скопируйте его вручную.');
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Демонстрация приглашения"
        title={`Истории: ${person.name}`}
        description="Совместные приглашения пока недоступны. Здесь можно посмотреть пример ссылки и продолжить собирать истории на этом устройстве."
        backTo={`/people/${person.id}`}
      />

      <Card tone="warm" className="invite-person">
        <Avatar person={person} size="hero" />
        <div>
          <span className="badge badge--soft">Локальный прототип</span>
          <h2>Начните с разговора рядом</h2>
          <p>
            Выберите вопрос, поговорите с близким человеком и сохраните его ответ текстом.
            Он появится в вашей книге в этом браузере.
          </p>
          <Link to={`/people/${person.id}`} className="button button--secondary button--normal">
            <MessageCircle size={18} aria-hidden="true" /> Выбрать вопрос
          </Link>
        </div>
      </Card>

      <Card className="invite-link-card">
        <div className="invite-link-card__icon">
          <Link2 size={24} aria-hidden="true" />
        </div>
        <div className="invite-link-card__content">
          <label className="eyebrow" htmlFor="demo-invite-link">Пример ссылки</label>
          <input
            id="demo-invite-link"
            className="invite-link-input"
            value={inviteLink}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            aria-describedby="demo-invite-description"
          />
          <span id="demo-invite-description">Демонстрационный адрес не открывает доступ к книге и не отправляет приглашение.</span>
        </div>
        <button type="button" className="button button--secondary button--normal" onClick={copyLink} disabled={copying}>
          {copied ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}
          <span>{copying ? 'Копируем…' : copied ? 'Пример скопирован' : 'Скопировать пример'}</span>
        </button>
      </Card>
      {copied ? <p className="muted-copy" role="status">Пример скопирован. Приглашение не отправлено; доступ по этому адресу не работает.</p> : null}
      {copyError ? <p className="form-error" role="alert">{copyError}</p> : null}

      <div className="invite-grid">
        <Card className="invite-step">
          <span>1</span>
          <MessageCircle size={26} aria-hidden="true" />
          <h3>Выберите вопрос</h3>
          <p>В профиле близкого есть темы и подсказки для спокойного разговора.</p>
        </Card>
        <Card className="invite-step">
          <span>2</span>
          <FileText size={26} aria-hidden="true" />
          <h3>Сохраните ответ</h3>
          <p>Запишите историю текстом. Незаконченный рассказ можно оставить в черновике.</p>
        </Card>
        <Card className="invite-step">
          <span>3</span>
          <BookOpen size={26} aria-hidden="true" />
          <h3>Соберите книгу</h3>
          <p>Добавьте фотографии и сохраните HTML-копию, которую можно передать близким.</p>
        </Card>
      </div>

      <Card tone="sage" className="privacy-note">
        <ShieldCheck size={26} aria-hidden="true" />
        <div>
          <h2>Истории хранятся у вас</h2>
          <p>
            Данные остаются в хранилище этого браузера и не синхронизируются с устройствами близких.
            Скачайте резервную копию в настройках, чтобы сохранить проект отдельно.
          </p>
          <Link to="/settings" className="text-link">Открыть настройки данных</Link>
        </div>
      </Card>
    </div>
  );
}
