import { BookOpen, Send, UserPlus, UserRound, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Avatar } from '../../components/Avatar';
import { PersonCard } from '../../components/PersonCard';
import { useCloudSync } from '../../sync/CloudSync';
import { PersonForm } from './PersonForm';

export function PeoplePage() {
  const { people: everyone, books, memories, moments, perspectives, activeBook, createPerson } = useAppState();
  const cloud = useCloudSync();
  // How this phone signs in its books is the profile, not a relative to interview.
  const people = everyone.filter((person) => !cloud.myPersonIds.has(person.id));
  const me = everyone.filter((person) => cloud.myPersonIds.has(person.id));
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const adding = params.get('add') === '1';
  const setAdding = (value: boolean) => setParams(value ? { add: '1' } : {}, { replace: true });
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
        description="Те, чьи истории вы записываете и с кем делитесь книгой. Для каждого есть вопросы для разговора."
        action={<div className="page-action-group">
          <button type="button" className="button button--primary button--small" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <UserPlus size={18} aria-hidden="true" /> Добавить близкого
          </button>
          {invitePerson && activeBook ? (
            <Link to={`/invite/${invitePerson.id}`} className="button button--secondary button--small">
              <Send size={18} aria-hidden="true" /> Пригласить
            </Link>
          ) : null}
        </div>}
      />

      {adding ? (
        <Card className="person-form-card">
          <div className="card-heading"><div><p className="eyebrow">Новый участник</p><h2>Добавить близкого</h2><p>Появятся восемь вопросов для первого разговора — их можно задать при встрече или по телефону.</p></div>
            <button type="button" className="icon-button" aria-label="Закрыть форму" onClick={() => setAdding(false)}><X size={20} /></button></div>
          <PersonForm submitLabel="Добавить" onCancel={() => setAdding(false)} onSubmit={(values) => {
            const person = createPerson(values);
            navigate(`/people/${person.id}`);
          }} />
        </Card>
      ) : null}

      {people.length === 0 && !adding ? (
        <EmptyState
          title="Рассказчиков пока нет"
          description="Добавьте бабушку, папу, сестру — всех, чьи истории хочется сохранить. Демо-семью можно вернуть в настройках."
          action={<div className="page-action-group page-action-group--center">
            <button type="button" className="button button--primary" onClick={() => setAdding(true)}><UserPlus size={18} aria-hidden="true" /> Добавить близкого</button>
            <Link to="/settings" className="button button--ghost">Открыть настройки</Link>
          </div>}
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

      {me.length ? (
        <section className="section" aria-labelledby="people-me-title">
          <div className="section__heading">
            <div>
              <p className="eyebrow">Это вы</p>
              <h2 id="people-me-title">Ваши имена в книгах</h2>
            </div>
            <Link to="/profile" className="button button--secondary button--small"><UserRound size={17} aria-hidden="true" /> Профиль</Link>
          </div>
          <ul className="profile-books">
            {me.map((person) => (
              <li key={person.id} className="profile-books__item">
                <Avatar person={person} size="small" />
                <div className="profile-books__copy">
                  <strong>{person.name}<span className="me-badge">вы</span></strong>
                  <span>{books.filter((book) => cloud.myPersonId(book.id) === person.id).map((book) => `«${book.title}»`).join(', ') || 'Книга удалена с этого устройства'}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeBook ? (
        <Card tone="warm" className="invite-summary">
          <span className="invite-summary__icon">
            <BookOpen size={28} aria-hidden="true" />
          </span>
          <div>
            <h2>Поделиться книгой «{activeBook.title}»</h2>
            <p>Без регистрации: книга уходит одним файлом через MAX, почту или другой мессенджер. Близкий открывает его в своём приложении, дописывает воспоминания и присылает обратно — новое добавится к вашей книге.</p>
            <Link to={invitePerson ? `/invite/${invitePerson.id}` : '/book'} className="text-link">Как пригласить близких</Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
