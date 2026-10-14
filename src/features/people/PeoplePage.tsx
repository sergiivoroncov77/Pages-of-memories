import { BookOpen, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { PersonCard } from '../../components/PersonCard';

export function PeoplePage() {
  const { people, project, memories, moments, perspectives } = useAppState();
  const momentIds = new Set(moments.map((moment) => moment.id));
  const authors = new Set([
    ...memories.map((memory) => memory.personId),
    ...perspectives.filter((perspective) => momentIds.has(perspective.momentId)).map((perspective) => perspective.authorId)
  ]);
  const active = people.filter((person) => authors.has(person.id));
  const waiting = people.filter((person) => !authors.has(person.id));
  const invitePerson = waiting[0] ?? people[0];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Участники проекта"
        title="Близкие"
        description="Выберите близкого человека, чтобы прочитать его истории или сохранить новый ответ. Всё хранится на этом устройстве."
        action={invitePerson ? (
          <Link to={`/invite/${invitePerson.id}`} className="button button--secondary button--small">
            <Link2 size={18} aria-hidden="true" /> О приглашениях
          </Link>
        ) : undefined}
      />

      {people.length === 0 ? (
        <EmptyState
          title="Рассказчиков пока нет"
          description="Восстановите книгу из резервной копии или откройте демонстрационный проект в настройках."
          action={<Link to="/settings" className="button button--secondary button--normal">Открыть настройки</Link>}
        />
      ) : null}

      {active.length > 0 ? <div className="people-list people-list--spacious">
        {active.map((person) => (
          <PersonCard key={person.id} person={person} />
        ))}
      </div> : null}

      {waiting.length > 0 ? (
        <section className="section">
          <div className="section__heading">
            <div>
              <p className="eyebrow">Начните с одного вопроса</p>
              <h2>Первые истории впереди</h2>
            </div>
          </div>
          <div className="people-list">
            {waiting.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
        </section>
      ) : null}

      <Card tone="warm" className="invite-summary">
        <span className="invite-summary__icon">
          <BookOpen size={28} aria-hidden="true" />
        </span>
        <div>
          <h2>Проект «{project.title}»</h2>
          <p>Приглашения по ссылке пока демонстрационные. Чтобы поделиться историями, соберите HTML-книгу и передайте готовый файл близким.</p>
          <Link to="/export" className="text-link">Собрать книгу для близких</Link>
        </div>
      </Card>
    </div>
  );
}
