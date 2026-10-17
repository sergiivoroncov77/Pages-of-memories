import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, FileText, Pencil, Send, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { MediaImage } from '../../components/MediaImage';
import { MemoryCard } from '../../components/MemoryCard';
import { PageHeader } from '../../components/PageHeader';
import { ProgressBar } from '../../components/ProgressBar';
import type { QuestionStatus } from '../../data/types';
import { formatDate, pluralize, truncate } from '../../lib/format';
import { useCloudSync } from '../../sync/CloudSync';
import { PersonForm } from './PersonForm';

const statusCopy: Record<QuestionStatus, string> = {
  answered: 'Ответ сохранён',
  next: 'Следующий вопрос',
  planned: 'Можно спросить позже',
  draft: 'Есть черновик'
};

export function PersonPage() {
  const { personId } = useParams();
  const { getPerson, questionsForPerson, memoriesForPerson, moments, perspectives, chapters, mediaAssets, drafts, updatePerson, deletePerson } = useAppState();
  const cloud = useCloudSync();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const person = personId ? getPerson(personId) : undefined;
  const sharedIn = person ? cloud.sharedBooksWithPerson(person.id) : [];

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

  // In a shared book a person's name is changed by them, by whoever added them, or by the creator.
  const editBlocker = cloud.renameBlocker(person.id);
  const isMe = cloud.myPersonIds.has(person.id);
  const questions = questionsForPerson(person.id);
  const personMemories = memoriesForPerson(person.id);
  const answeredIds = new Set(personMemories.map((memory) => memory.questionId));
  const answeredCount = questions.filter((question) => answeredIds.has(question.id)).length;
  const personDrafts = drafts.filter((draft) => draft.personId === person.id);
  const draftIds = new Set(personDrafts.map((draft) => draft.questionId));
  const momentIds = new Set(moments.map((moment) => moment.id));
  const personPerspectives = perspectives
    .filter((perspective) => perspective.authorId === person.id && momentIds.has(perspective.momentId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const personMoments = moments
    .map((moment) => ({ moment, contributions: personPerspectives.filter((perspective) => perspective.momentId === moment.id) }))
    .filter(({ contributions }) => contributions.length > 0)
    .sort((a, b) => b.contributions[0].createdAt.localeCompare(a.contributions[0].createdAt));
  const lastSavedAt = [
    ...personMemories.map((memory) => memory.recordedAt),
    ...personPerspectives.map((perspective) => perspective.createdAt),
    ...personDrafts.map((draft) => draft.createdAt)
  ].filter((value) => !Number.isNaN(new Date(value).getTime())).sort((a, b) => b.localeCompare(a))[0];

  return (
    <div className="page">
      <PageHeader
        eyebrow={person.relation}
        title={person.name}
        backTo="/people"
        action={<div className="page-action-group">
          {isMe ? (
            <Link to="/profile" className="button button--secondary button--small"><span>Это вы · профиль</span></Link>
          ) : (
            <Link to={`/invite/${person.id}`} className="button button--secondary button--small">
              <Send size={17} aria-hidden="true" />
              <span>Пригласить</span>
            </Link>
          )}
          <button type="button" className="button button--ghost button--small" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>
            <Pencil size={17} aria-hidden="true" />
            <span>Изменить</span>
          </button>
        </div>}
      />

      {editing ? (
        <Card className="person-form-card">
          <div className="card-heading"><div><p className="eyebrow">Участник</p><h2>Изменить данные</h2></div>
            <button type="button" className="icon-button" aria-label="Закрыть форму" onClick={() => setEditing(false)}><X size={20} /></button></div>
          {editBlocker ? <p className="delete-blocked">{editBlocker}</p> : <PersonForm key={person.id} initial={person} submitLabel="Сохранить" onCancel={() => setEditing(false)}
            onSubmit={(values) => { updatePerson(person.id, values); setEditing(false); }}
            onDelete={sharedIn.length ? undefined : () => {
              if (!window.confirm(`Удалить «${person.name}» из близких? Вопросы, черновики и ответы интервью этого человека удалятся. Истории, уже добавленные в книгу, останутся — без подписи.`)) return;
              deletePerson(person.id);
              navigate('/people');
            }}
            deleteNote={sharedIn.length ? `«${person.name}» есть в общих книгах: ${sharedIn.map((title) => `«${title}»`).join(', ')}. Чтобы рассказы не потеряли подпись у всех участников, удалить этого человека нельзя.` : undefined} />}
        </Card>
      ) : null}

      <Card tone="warm" className="profile-card">
        <Avatar person={person} size="hero" />
        <div className="profile-card__copy">
          <p>{person.bio || 'История этого человека складывается из разговоров, фотографий и воспоминаний близких.'}</p>
          <div className="profile-card__facts">
            <span>
              <BookOpen size={17} aria-hidden="true" />
              {personMoments.length} {pluralize(personMoments.length, 'момент', 'момента', 'моментов')} в книге
            </span>
            <span>
              <FileText size={17} aria-hidden="true" />
              {personMemories.length} {pluralize(personMemories.length, 'ответ', 'ответа', 'ответов')} на вопросы
            </span>
          </div>
        </div>
      </Card>

      <Card className="progress-card">
        <div className="progress-card__heading">
          <div>
            <p className="eyebrow">Разговор продолжается</p>
            <h2>{questions.length > 0 ? `${answeredCount} из ${questions.length} вопросов с ответом` : 'Можно начать с любой истории'}</h2>
          </div>
          {lastSavedAt ? <span className="progress-card__date">Последнее сохранение: {formatDate(lastSavedAt)}</span> : null}
        </div>
        <ProgressBar value={answeredCount} max={questions.length} />
      </Card>

      <section className="section">
        <div className="section__heading">
          <div>
            <p className="eyebrow">Рассказы, фотографии и материалы</p>
            <h2>Моменты в книге</h2>
          </div>
          {personMoments.length > 0 ? <Link to={`/book?person=${encodeURIComponent(person.id)}`} className="text-link">Показать в книге</Link> : null}
        </div>
        {personMoments.length > 0 ? (
          <div className="moment-grid">
            {personMoments.map(({ moment, contributions }) => {
              const chapter = chapters.find((item) => item.id === moment.chapterId);
              const photoIds = new Set(contributions.map((perspective) => perspective.mediaAssetId));
              const photo = mediaAssets.find((asset) => photoIds.has(asset.id) && asset.type === 'photo');
              const excerpt = contributions.find((perspective) => perspective.content.trim())?.content
                || contributions.find((perspective) => perspective.caption?.trim())?.caption
                || moment.summary
                || 'Откройте момент, чтобы посмотреть сохранённые материалы.';

              return (
                <article className={`moment-card ${photo ? 'moment-card--illustrated' : ''}`} key={moment.id}>
                  <Link to={`/moments/${moment.id}`} className="moment-card__main">
                    {photo ? <MediaImage className="moment-card__image" asset={photo} /> : null}
                    <div className="moment-card__body">
                      <div className="moment-card__topline">
                        <span><CalendarDays size={15} aria-hidden="true" /> {moment.occurredAt ? formatDate(moment.occurredAt) : 'Дата не указана'}</span>
                      </div>
                      <h3>{moment.title}</h3>
                      <p>{truncate(excerpt, 150)}</p>
                      <div className="moment-card__footer"><span className="moment-card__author">{chapter?.title ?? 'Семейная книга'}</span></div>
                      <span className="moment-card__views">
                        {contributions.length} {pluralize(contributions.length, 'материал', 'материала', 'материалов')} автора
                        <ArrowRight size={16} aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Первые страницы ещё впереди"
            description="Сохраните ответ на вопрос или добавьте рассказ и материалы от имени этого человека к моменту книги."
            action={<Link to="/book" className="button button--secondary button--normal">Открыть книгу</Link>}
          />
        )}
      </section>

      <section className="section">
        <div className="section__heading">
          <div>
            <p className="eyebrow">Вопросы для разговора</p>
            <h2>О чём спросить</h2>
          </div>
          <span className="section__note">{questions.length} {pluralize(questions.length, 'вопрос', 'вопроса', 'вопросов')}</span>
        </div>

        {questions.length > 0 ? (
          <div className="question-list">
            {questions.map((question) => {
              const memory = personMemories.find((item) => item.questionId === question.id);
              const hasDraft = draftIds.has(question.id);
              const status: QuestionStatus = hasDraft ? 'draft' : memory ? 'answered' : question.status === 'next' ? 'next' : 'planned';

              return (
                <article className="question-row" key={question.id}>
                  <span className={`question-row__status question-row__status--${status}`} aria-hidden="true">
                    {status === 'answered' ? <CheckCircle2 size={20} /> : status === 'next' ? <Sparkles size={20} /> : <Clock3 size={20} />}
                  </span>
                  <div className="question-row__copy">
                    <span className="question-row__category">{question.category}</span>
                    <h3>{question.text}</h3>
                    <p>{memory && hasDraft ? 'Есть сохранённый ответ и новый черновик' : statusCopy[status]}</p>
                  </div>
                  <Link className="question-row__action" to={hasDraft || !memory ? `/session/${person.id}/${question.id}` : `/memories/${memory.id}`}>
                    {hasDraft ? 'Продолжить' : memory ? 'Читать ответ' : 'Ответить'}
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted-copy">Вопросов для этого рассказчика пока нет. Его историю можно добавить прямо в книгу.</p>
        )}
      </section>

      <section className="section">
        <div className="section__heading">
          <div>
            <p className="eyebrow">Сохранённые ответы на вопросы</p>
            <h2>Интервью</h2>
          </div>
          <span className="section__note">{personMemories.length} {pluralize(personMemories.length, 'ответ', 'ответа', 'ответов')}</span>
        </div>
        {personMemories.length > 0 ? (
          <div className="memory-grid">
            {personMemories.map((memory) => <MemoryCard key={memory.id} memory={memory} person={person} />)}
          </div>
        ) : (
          <p className="muted-copy">Сохранённые ответы появятся здесь. Начните с одного из вопросов выше или добавьте материал к моменту книги.</p>
        )}
      </section>
    </div>
  );
}
