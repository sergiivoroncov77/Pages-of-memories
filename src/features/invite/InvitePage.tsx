import { Check, Copy, Link2, MessageCircle, Mic2, ShieldCheck, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function InvitePage() {
  const { personId } = useParams();
  const { getPerson, project } = useAppState();
  const [copied, setCopied] = useState(false);
  const person = personId ? getPerson(personId) : undefined;
  const inviteLink = useMemo(
    () => `https://family-stories.local/join/${project.inviteCode.toLowerCase()}`,
    [project.inviteCode]
  );

  if (!person) {
    return (
      <div className="page">
        <EmptyState title="Приглашение не найдено" description="Проверьте ссылку или выберите человека из списка." />
      </div>
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      // В демо ссылку можно выделить вручную.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Приглашение"
        title={`Позовите ${person.name}`}
        description="Один короткий разговор и несколько вопросов. Начать можно с любого телефона."
        backTo={`/people/${person.id}`}
      />

      <Card tone="warm" className="invite-person">
        <Avatar person={person} size="hero" />
        <div>
          <span className="badge badge--soft">Установка не обязательна</span>
          <h2>{person.relation} сможет ответить по ссылке</h2>
          <p>
            Не нужно создавать аккаунт и разбираться в приложении. Страница задаст вопрос, запишет ответ и сохранит
            его в семейном проекте после подтверждения.
          </p>
        </div>
      </Card>

      <Card className="invite-link-card">
        <div className="invite-link-card__icon">
          <Link2 size={24} aria-hidden="true" />
        </div>
        <div className="invite-link-card__content">
          <p className="eyebrow">Личная ссылка</p>
          <strong>{inviteLink}</strong>
          <span>Ссылка действует 14 дней. В прототипе это только демонстрационный адрес.</span>
        </div>
        <button type="button" className="button button--primary button--normal" onClick={copyLink}>
          {copied ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}
          <span>{copied ? 'Скопировано' : 'Скопировать'}</span>
        </button>
      </Card>

      <div className="invite-grid">
        <Card className="invite-step">
          <span>1</span>
          <Mic2 size={26} aria-hidden="true" />
          <h3>Ответить голосом</h3>
          <p>Приложение показывает вопрос и большие кнопки записи.</p>
        </Card>
        <Card className="invite-step">
          <span>2</span>
          <MessageCircle size={26} aria-hidden="true" />
          <h3>Проверить текст</h3>
          <p>Расшифровку можно исправить до того, как она попадёт в книгу.</p>
        </Card>
        <Card className="invite-step">
          <span>3</span>
          <Smartphone size={26} aria-hidden="true" />
          <h3>Продолжить позже</h3>
          <p>Ссылка сохраняется, поэтому можно вернуться в удобное время.</p>
        </Card>
      </div>

      <Card tone="sage" className="privacy-note">
        <ShieldCheck size={26} aria-hidden="true" />
        <div>
          <h2>Что важно знать</h2>
          <p>
            Оригинальная запись остаётся главной. Текст — только вспомогательный. В демоверсии ничего не отправляется
            в интернет, а данные хранятся в localStorage браузера.
          </p>
        </div>
      </Card>
    </div>
  );
}
