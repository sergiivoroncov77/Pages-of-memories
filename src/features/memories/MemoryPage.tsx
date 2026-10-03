import { CalendarDays, Edit3, Heart, Link2, Mic2, Share2, Tag as TagIcon, UserRound } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { AudioPlayer } from '../../components/AudioPlayer';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { MemoryCard } from '../../components/MemoryCard';
import { PageHeader } from '../../components/PageHeader';
import { formatDate, formatDuration } from '../../lib/format';

const sourceLabels = {
  app: 'Записано в приложении',
  link: 'Записано по ссылке',
  import: 'Импортировано вручную'
} as const;

export function MemoryPage() {
  const { memoryId } = useParams();
  const navigate = useNavigate();
  const { getMemory, getPerson, getQuestion, memories, memoriesForPerson, toggleFavorite, saveDraft } = useAppState();
  const memory = memoryId ? getMemory(memoryId) : undefined;

  if (!memory) {
    return (
      <div className="page">
        <EmptyState
          title="Воспоминание не найдено"
          description="Возможно, запись была удалена или ссылка устарела."
          action={
            <Link to="/book" className="button button--secondary button--normal">
              <span>Открыть семейную книгу</span>
            </Link>
          }
        />
      </div>
    );
  }

  const person = getPerson(memory.personId);
  const question = getQuestion(memory.questionId);
  const related = memoriesForPerson(memory.personId).filter((item) => item.id !== memory.id).slice(0, 2);

  return (
    <div className="page page--memory">
      <PageHeader
        eyebrow={person?.name ?? 'Семейное воспоминание'}
        title={memory.title}
        backTo="/book"
        action={
          <button
            type="button"
            className={`icon-button ${memory.favorite ? 'is-favorite' : ''}`}
            aria-label={memory.favorite ? 'Убрать из избранного' : 'Добавить в избранное'}
            onClick={() => toggleFavorite(memory.id)}
          >
            <Heart size={23} fill={memory.favorite ? 'currentColor' : 'none'} />
          </button>
        }
      />

      <Card className="memory-detail" padded={false}>
        {memory.photoUrl ? (
          <img className="memory-detail__photo" src={memory.photoUrl} alt={memory.photoAlt} />
        ) : (
          <div className="memory-detail__photo memory-detail__photo--empty">
            <Mic2 size={46} aria-hidden="true" />
            <span>Голос без фотографии</span>
          </div>
        )}
        <div className="memory-detail__content">
          <div className="memory-detail__meta">
            {person ? (
              <Link to={`/people/${person.id}`} className="memory-person">
                <Avatar person={person} size="small" />
                <span>
                  <strong>{person.name}</strong>
                  <small>{person.relation}</small>
                </span>
              </Link>
            ) : null}
            <time dateTime={memory.recordedAt}>
              <CalendarDays size={16} aria-hidden="true" />
              {formatDate(memory.recordedAt)}
            </time>
          </div>

          <blockquote>{memory.questionText}</blockquote>
          <AudioPlayer durationSeconds={memory.durationSeconds} title={memory.title} />
        </div>
      </Card>

      <div className="memory-actions">
        <button
          type="button"
          className="button button--secondary button--normal"
          onClick={() => {
            saveDraft({
              personId: memory.personId,
              questionId: memory.questionId,
              transcript: memory.transcript,
              durationSeconds: memory.durationSeconds
            });
            navigate(`/session/${memory.personId}/${memory.questionId}`);
          }}
        >
          <Edit3 size={19} aria-hidden="true" />
          <span>Исправить текст</span>
        </button>
        <button
          type="button"
          className="button button--ghost button--normal"
          onClick={() => {
            if (navigator.share) {
              void navigator.share({ title: memory.title, text: memory.transcript });
            }
          }}
        >
          <Share2 size={19} aria-hidden="true" />
          <span>Поделиться</span>
        </button>
      </div>

      <div className="memory-layout">
        <Card className="transcript-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Текстовая версия</p>
              <h2>Расшифровка</h2>
            </div>
            <span className="badge badge--soft">Проверена в демо</span>
          </div>
          <p>{memory.transcript}</p>
          <div className="transcript-card__note">
            <Mic2 size={18} aria-hidden="true" />
            Оригинальная запись длительностью {formatDuration(memory.durationSeconds)} сохранена как основной источник.
          </div>
        </Card>

        <div className="memory-aside">
          <Card>
            <div className="card-heading card-heading--compact">
              <h2>Детали</h2>
            </div>
            <dl className="detail-list">
              <div>
                <dt>
                  <UserRound size={17} aria-hidden="true" />
                  Рассказчик
                </dt>
                <dd>{person?.name ?? 'Не указан'}</dd>
              </div>
              <div>
                <dt>
                  <Mic2 size={17} aria-hidden="true" />
                  Тема
                </dt>
                <dd>{question?.category ?? 'Без категории'}</dd>
              </div>
              <div>
                <dt>
                  <Link2 size={17} aria-hidden="true" />
                  Источник
                </dt>
                <dd>{sourceLabels[memory.source]}</dd>
              </div>
            </dl>
            <div className="tag-list">
              <TagIcon size={17} aria-hidden="true" />
              {memory.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          </Card>

          <Card tone="warm" className="memory-privacy">
            <h2>Приватность</h2>
            <p>В прототипе запись и расшифровка хранятся только в localStorage этого браузера.</p>
          </Card>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="section">
          <div className="section__heading">
            <div>
              <p className="eyebrow">Продолжение истории</p>
              <h2>Ещё от {person?.name}</h2>
            </div>
            <Link className="text-link" to={`/people/${memory.personId}`}>
              Профиль
            </Link>
          </div>
          <div className="memory-grid memory-grid--two">
            {related.map((item) => (
              <MemoryCard key={item.id} memory={item} person={person} compact />
            ))}
          </div>
        </section>
      ) : null}

      <p className="demo-footnote">Всего в демонстрационном проекте: {memories.length} воспоминаний.</p>
    </div>
  );
}
