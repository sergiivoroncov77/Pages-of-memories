import { CheckCircle2, Clock3, Mic2, Send, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { MemoryCard } from '../../components/MemoryCard';
import { PageHeader } from '../../components/PageHeader';
import { ProgressBar } from '../../components/ProgressBar';
import type { QuestionStatus } from '../../data/types';
import { formatDate, pluralize } from '../../lib/format';

const statusCopy: Record<QuestionStatus, string> = {
  answered: 'Есть воспоминание',
  next: 'Следующий вопрос',
  planned: 'Можно спросить позже',
  draft: 'Есть черновик'
};

export function PersonPage() {
  const { personId } = useParams();
  const { getPerson, questionsForPerson, memoriesForPerson, memories } = useAppState();
  const person = personId ? getPerson(personId) : undefined;

  if (!person) {
    return (
      <div className="page">
        <EmptyState
          title="Рассказчик не найден"
          description="Возможно, ссылка устарела. Вернитесь к списку близких."
          action={
            <Link className="button button--secondary button--normal" to="/people">
              <span>К списку близких</span>
            </Link>
          }
        />
      </div>
    );
  }

  const questions = questionsForPerson(person.id);
  const personMemories = memoriesForPerson(person.id);
  const minutes = Math.round(personMemories.reduce((sum, memory) => sum + memory.durationSeconds, 0) / 60);

  return (
    <div className="page">
      <PageHeader
        eyebrow={person.relation}
        title={person.name}
        backTo="/people"
        action={
          <Link to={`/invite/${person.id}`} className="button button--secondary button--small">
            <Send size={17} aria-hidden="true" />
            <span>Пригласить</span>
          </Link>
        }
      />

      <Card tone="warm" className="profile-card">
        <Avatar person={person} size="hero" showStatus />
        <div className="profile-card__copy">
          <p>{person.bio}</p>
          <div className="profile-card__facts">
            <span>
              <Mic2 size={17} aria-hidden="true" />
              {personMemories.length} {pluralize(personMemories.length, 'воспоминание', 'воспоминания', 'воспоминаний')}
            </span>
            <span>
              <Clock3 size={17} aria-hidden="true" />
              {minutes} {pluralize(minutes, 'минута', 'минуты', 'минут')} голоса
            </span>
          </div>
        </div>
      </Card>

      <Card className="progress-card">
        <div className="progress-card__heading">
          <div>
            <p className="eyebrow">Общий прогресс</p>
            <h2>
              {person.answeredCount} из {person.totalQuestions} тем начато
            </h2>
          </div>
          <span className="progress-card__date">Активность: {formatDate(person.lastActiveAt)}</span>
        </div>
        <ProgressBar value={person.answeredCount} max={person.totalQuestions} />
      </Card>

      <section className="section">
        <div className="section__heading">
          <div>
            <p className="eyebrow">Вопросы для разговора</p>
            <h2>О чём спросить</h2>
          </div>
          <span className="section__note">{questions.length} вопросов</span>
        </div>

        <div className="question-list">
          {questions.map((question) => {
            const memory = memories.find((item) => item.questionId === question.id);
            const answered = question.status === 'answered' && memory;

            return (
              <article className="question-row" key={question.id}>
                <span className={`question-row__status question-row__status--${question.status}`}>
                  {answered ? <CheckCircle2 size={20} /> : question.status === 'next' ? <Sparkles size={20} /> : <Clock3 size={20} />}
                </span>
                <div className="question-row__copy">
                  <span className="question-row__category">{question.category}</span>
                  <h3>{question.text}</h3>
                  <p>{statusCopy[question.status]}</p>
                </div>
                <Link
                  className="question-row__action"
                  to={answered ? `/memories/${memory.id}` : `/session/${person.id}/${question.id}`}
                >
                  {answered ? 'Слушать' : 'Ответить'}
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      {personMemories.length > 0 ? (
        <section className="section">
          <div className="section__heading">
            <div>
              <p className="eyebrow">Записи этого человека</p>
              <h2>Воспоминания</h2>
            </div>
            <Link to={`/book?person=${person.id}`} className="text-link">
              В книге
            </Link>
          </div>
          <div className="memory-grid">
            {personMemories.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} person={person} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
