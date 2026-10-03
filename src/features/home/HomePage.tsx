import { ArrowRight, Clock3, Mic2, Plus, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { MemoryCard } from '../../components/MemoryCard';
import { PersonCard } from '../../components/PersonCard';
import { pluralize } from '../../lib/format';

export function HomePage() {
  const { project, people, memories, nextQuestion, getPerson } = useAppState();
  const question = nextQuestion();
  const person = question ? getPerson(question.personId) : undefined;
  const recentMemories = [...memories]
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .slice(0, 3);
  const totalMinutes = Math.round(memories.reduce((sum, memory) => sum + memory.durationSeconds, 0) / 60);
  const activePeople = people.filter((item) => item.status === 'active').length;

  return (
    <div className="page page--home">
      <header className="home-greeting">
        <div>
          <p className="eyebrow">Семейный проект</p>
          <h1>{project.title}</h1>
          <p>{project.subtitle}. Записи хранятся локально в этом демонстрационном прототипе.</p>
        </div>
        <Link to="/invite/person_dmitry" className="icon-button" aria-label="Пригласить близкого">
          <Plus size={24} />
        </Link>
      </header>

      <div className="stats-row" aria-label="Статистика проекта">
        <div>
          <Users size={20} aria-hidden="true" />
          <strong>{activePeople}</strong>
          <span>{pluralize(activePeople, 'рассказчик', 'рассказчика', 'рассказчиков')}</span>
        </div>
        <div>
          <Mic2 size={20} aria-hidden="true" />
          <strong>{memories.length}</strong>
          <span>{pluralize(memories.length, 'воспоминание', 'воспоминания', 'воспоминаний')}</span>
        </div>
        <div>
          <Clock3 size={20} aria-hidden="true" />
          <strong>{totalMinutes}</strong>
          <span>{pluralize(totalMinutes, 'минута', 'минуты', 'минут')} голоса</span>
        </div>
      </div>

      {question && person ? (
        <Card tone="dark" className="next-question" padded={false}>
          <div className="next-question__glow" />
          <div className="next-question__top">
            <span className="badge badge--light">
              <Sparkles size={16} aria-hidden="true" />
              Следующий вопрос
            </span>
            <span className="next-question__category">{question.category}</span>
          </div>
          <div className="next-question__main">
            <Avatar person={person} size="large" />
            <div>
              <p>{person.name}</p>
              <h2>{question.text}</h2>
            </div>
          </div>
          <p className="next-question__hint">{question.hint}</p>
          <div className="next-question__actions">
            <Link
              to={`/session/${person.id}/${question.id}`}
              className="button button--primary button--large"
            >
              <Mic2 size={22} aria-hidden="true" />
              <span>Ответить голосом</span>
            </Link>
            <Link to={`/people/${person.id}`} className="button button--light button--large">
              <span>Все вопросы</span>
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
          </div>
        </Card>
      ) : null}

      <section className="section">
        <div className="section__heading">
          <div>
            <p className="eyebrow">Кто рассказывает</p>
            <h2>Близкие</h2>
          </div>
          <Link to="/people" className="text-link">
            Все <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="people-list">
          {people.slice(0, 3).map((item) => (
            <PersonCard key={item.id} person={item} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__heading">
          <div>
            <p className="eyebrow">Семейная книга</p>
            <h2>Недавние воспоминания</h2>
          </div>
          <Link to="/book" className="text-link">
            Вся книга <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="memory-grid">
          {recentMemories.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} person={getPerson(memory.personId)} />
          ))}
        </div>
      </section>

      <Card tone="warm" className="home-invite">
        <div>
          <span className="home-invite__icon">
            <Users size={24} aria-hidden="true" />
          </span>
          <h2>Пригласите ещё одного рассказчика</h2>
          <p>
            Отправьте простую ссылку. Близкому не нужно устанавливать приложение, чтобы записать первые
            воспоминания.
          </p>
        </div>
        <Link to="/invite/person_dmitry" className="button button--secondary button--normal">
          Открыть приглашение
        </Link>
      </Card>
    </div>
  );
}
