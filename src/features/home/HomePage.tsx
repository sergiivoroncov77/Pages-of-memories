import { ArrowRight, BookOpen, Mic2, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PersonCard } from '../../components/PersonCard';
import { formatDate, pluralize, truncate } from '../../lib/format';

export function HomePage() {
  const { project, people, books, chaptersForBook, momentsForChapter, perspectivesForMoment, nextQuestion, getPerson } = useAppState();
  const question = nextQuestion();
  const person = question ? getPerson(question.personId) : undefined;
  const book = books[0];
  const bookChapters = book ? chaptersForBook(book.id) : [];
  const moments = bookChapters.flatMap((chapter) => momentsForChapter(chapter.id));
  const recentMoments = [...moments].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3);
  const voiceCount = new Set(moments.flatMap((moment) => perspectivesForMoment(moment.id).map((item) => item.authorId).filter(Boolean))).size;
  const invitePerson = people.find((item) => item.status === 'invited') ?? people[0];

  return <div className="page page--home">
    <header className="home-greeting"><div><p className="eyebrow">Истории, которые остаются с нами</p><h1>{project.title}</h1><p>Сохраняйте голоса, детали и воспоминания близких. По одной истории за раз.</p></div><Link to="/book" className="button button--secondary button--small"><BookOpen size={18} aria-hidden="true" /> Открыть книгу</Link></header>
    <div className="stats-row" aria-label="Статистика проекта">
      <div><BookOpen size={21} aria-hidden="true" /><strong>{moments.length}</strong><span>{pluralize(moments.length, 'момент', 'момента', 'моментов')}</span></div>
      <div><BookOpen size={21} aria-hidden="true" /><strong>{bookChapters.length}</strong><span>{pluralize(bookChapters.length, 'глава', 'главы', 'глав')}</span></div>
      <div><Users size={21} aria-hidden="true" /><strong>{voiceCount}</strong><span>{pluralize(voiceCount, 'рассказчик', 'рассказчика', 'рассказчиков')}</span></div>
    </div>
    {question && person ? <Card tone="dark" className="next-question" padded={false}>
      <div className="next-question__top"><span className="badge badge--light"><Sparkles size={16} aria-hidden="true" /> С чего начать сегодня</span><span className="next-question__category">{question.category}</span></div>
      <div className="next-question__main"><Avatar person={person} size="large" /><div><p>{person.name} · {person.relation}</p><h2>{question.text}</h2></div></div><p className="next-question__hint">{question.hint}</p>
      <div className="next-question__actions"><Link to={'/session/' + person.id + '/' + question.id} className="button button--primary button--large"><Mic2 size={22} aria-hidden="true" /> Начать рассказ</Link><Link to={'/people/' + person.id} className="button button--light button--large">Выбрать другой вопрос <ArrowRight size={20} aria-hidden="true" /></Link></div>
    </Card> : <Card tone="dark" className="next-question"><p className="eyebrow">История продолжается</p><h2>{moments.length ? 'У каждой истории есть продолжение' : 'Начните вашу семейную книгу'}</h2><p>Добавьте новый момент или дополните уже сохранённые истории.</p><Link to="/book" className="button button--light">Перейти к книге <ArrowRight size={18} aria-hidden="true" /></Link></Card>}

    <section className="section"><div className="section__heading"><div><p className="eyebrow">Страницы вашей книги</p><h2>Недавно добавлено и дополнено</h2></div><Link to="/book" className="text-link">Вся книга <ArrowRight size={18} aria-hidden="true" /></Link></div>
      {recentMoments.length ? <div className="memory-grid">{recentMoments.map((moment) => { const perspective = perspectivesForMoment(moment.id).find((item) => item.id === moment.primaryPerspectiveId) ?? perspectivesForMoment(moment.id)[0]; const author = perspective ? getPerson(perspective.authorId ?? '') : undefined; return <Link className="home-moment-card" key={moment.id} to={'/moments/' + moment.id}><span className="home-moment-card__icon"><BookOpen size={22} aria-hidden="true" /></span><div><div className="home-moment-card__meta"><span>{author?.name ?? 'Семейная история'}</span><time>{moment.occurredAt ? formatDate(moment.occurredAt) : 'Дата не указана'}</time></div><h3>{moment.title}</h3><p>{truncate(moment.summary || perspective?.content || 'Добавьте первый рассказ.', 110)}</p></div></Link>; })}</div> : <EmptyState title="Первая страница ещё впереди" description="Начните с одного события, которое вам хочется сохранить." action={<Link to="/book" className="button button--secondary">Открыть книгу</Link>} />}
    </section>

    <section className="section"><div className="section__heading"><div><p className="eyebrow">За каждой историей — человек</p><h2>Близкие</h2></div><Link to="/people" className="text-link">Все близкие <ArrowRight size={18} aria-hidden="true" /></Link></div><div className="people-list">{people.slice(0, 3).map((item) => <PersonCard key={item.id} person={item} />)}</div>{!people.length ? <p className="muted-copy">Рассказчиков пока нет. Книгу с участниками можно восстановить в настройках.</p> : null}</section>
    {invitePerson ? <Card tone="warm" className="home-invite"><div><span className="home-invite__icon"><Users size={25} aria-hidden="true" /></span><h2>У каждого есть своя часть истории</h2><p>Посмотрите, как будет выглядеть приглашение близкого. В этой версии книга хранится на вашем устройстве, совместный доступ ещё не подключён.</p></div><Link to={'/invite/' + invitePerson.id} className="button button--secondary">Посмотреть приглашение</Link></Card> : null}
  </div>;
}
