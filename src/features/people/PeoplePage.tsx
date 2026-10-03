import { Plus, UserRoundPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { PersonCard } from '../../components/PersonCard';

export function PeoplePage() {
  const { people, project } = useAppState();
  const active = people.filter((person) => person.status !== 'invited');
  const invited = people.filter((person) => person.status === 'invited');

  return (
    <div className="page">
      <PageHeader
        eyebrow="Участники проекта"
        title="Близкие"
        description="Каждый человек отвечает в удобном темпе. Вопросы можно пропускать и возвращаться к ним позже."
        action={
          <Link to={`/invite/${invited[0]?.id ?? people[0]?.id}`} className="icon-button" aria-label="Пригласить">
            <Plus size={24} />
          </Link>
        }
      />

      <div className="people-list people-list--spacious">
        {active.map((person) => (
          <PersonCard key={person.id} person={person} />
        ))}
      </div>

      {invited.length > 0 ? (
        <section className="section">
          <div className="section__heading">
            <div>
              <p className="eyebrow">Ожидают ответа</p>
              <h2>Приглашённые</h2>
            </div>
          </div>
          <div className="people-list">
            {invited.map((person) => (
              <PersonCard key={person.id} person={person} />
            ))}
          </div>
        </section>
      ) : null}

      <Card tone="warm" className="invite-summary">
        <span className="invite-summary__icon">
          <UserRoundPlus size={28} aria-hidden="true" />
        </span>
        <div>
          <h2>Код проекта: {project.inviteCode}</h2>
          <p>Приглашение можно передать по ссылке или продиктовать код. Установка приложения не обязательна.</p>
        </div>
      </Card>
    </div>
  );
}
