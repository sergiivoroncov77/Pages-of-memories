import { ArrowRight, BookOpen, Mic2, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Avatar } from '../../components/Avatar';
import { Book3D } from '../../components/Book3D';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { PersonCard } from '../../components/PersonCard';
import { clothStyle } from '../../lib/cloth';
import { formatDate, pluralize, truncate } from '../../lib/format';

export function HomePage() {
  const { project, people, books, activeBook: book, mediaAssets, chaptersForBook, momentsForChapter, perspectivesForMoment, nextQuestion, getPerson } = useAppState();
  const question = nextQuestion();
  const person = question ? getPerson(question.personId) : undefined;
  const bookChapters = book ? chaptersForBook(book.id) : [];
  const moments = bookChapters.flatMap((chapter) => momentsForChapter(chapter.id));
  const recentMoments = [...moments].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3);
  const voiceCount = new Set(moments.flatMap((moment) => perspectivesForMoment(moment.id).map((item) => item.authorId).filter(Boolean))).size;
  const invitePerson = people.find((item) => item.status === 'invited') ?? people[0];

  return <div className="page page--home">
    <header className="home-greeting"><div><p className="eyebrow">Истории, которые остаются с нами</p><h1>{project.title}</h1><p>Сохраняйте голоса, детали и воспоминания близких. По одной истории за раз.</p></div>{book ? <Book3D title={book.title} cover={mediaAssets.find((asset) => asset.id === book.coverMediaAssetId)} to="/read" size="small" style={clothStyle(book, books)} label={'Читать книгу «' + book.title + '»'} /> : null}</header>
    <div className="stats-row" aria-label="Статистика проекта">
      <div><BookOpen size={21} aria-hidden="true" /><strong>{moments.length}</strong><span>{pluralize(moments.length, 'момент', 'момента', 'моментов')}</span></div>
      <div><BookOpen size={21} aria-hidden="true" /><strong>{bookChapters.length}</strong><span>{pluralize(bookChapters.length, 'глава', 'главы', 'глав')}</span></div>
      <div><Users size={21} aria-hidden="true" /><strong>{voiceCount}</strong><span>{pluralize(voiceCount, 'рассказчик', 'рассказчика', 'рассказчиков')}</span></div>
    </div>
    {question && person ? <Card tone="dark" className="next-question" padded={false}>
      <div className="next-question__top"><span className="badge badge--light"><Sparkles size={16} aria-hidden="true" /> С чего начать сегодня</span><span className="next-question__category">{question.category}</span></div>
      <div className="next-question__main"><Avatar person={person} size="large" /><div><p>{person.name} · {person.relation}</p><h2>{question.text}</h2></div></div><p className="next-question__hint">{question.hint}</p>
      <div className="next-question__actions"><Link to={'/session/' + person.id + '/' + question.id} className="button button--primary button--large"><Mic2 size={22} aria-hidden="true" /> Начать рассказ</Link><Link to={'/people/' + person.id} className="button button--light button--large">Выбрать другой вопрос <ArrowRight size={20} aria-hidden="true" /></Link></div>
    </Card> : <Card tone="dark" className="next-question"><p className="eyebrow">{book ? 'История продолжается' : 'С чего начать'}</p><h2>{!book ? 'Создайте свою первую книгу' : moments.length ? 'У каждой истории есть продолжение' : 'Начните вашу семейную книгу'}</h2><p>{!book ? 'Книга — это главы и моменты: рассказы, фото, голоса и видео. Потом добавьте близких, чтобы записать их истории.' : 'Добавьте новый момент или дополните уже сохранённые истории.'}</p><Link to="/book" className="button button--light">{book ? 'Перейти к книге' : 'Создать книгу'} <ArrowRight size={18} aria-hidden="true" /></Link></Card>}

    <section className="section"><div className="section__heading"><div><p className="eyebrow">Страницы вашей книги</p><h2>Недавно добавлено и дополнено</h2></div><Link to="/book" className="text-link">Вся книга <ArrowRight size={18} aria-hidden="true" /></Link></div>
      {recentMoments.length ? <div className="memory-grid">{recentMoments.map((moment) => { const perspective = perspectivesForMoment(moment.id).find((item) => item.id === moment.primaryPerspectiveId) ?? perspectivesForMoment(moment.id)[0]; const author = perspective ? getPerson(perspective.authorId ?? '') : undefined; return <Link className="home-moment-card" key={moment.id} to={'/moments/' + moment.id}><span className="home-moment-card__icon"><BookOpen size={22} aria-hidden="true" /></span><div><div className="home-moment-card__meta"><span>{author?.name ?? 'Семейная история'}</span><time>{moment.occurredAt ? formatDate(moment.occurredAt) : 'Дата не указана'}</time></div><h3>{moment.title}</h3><p>{truncate(moment.summary || perspective?.content || 'Добавьте первый рассказ.', 110)}</p></div></Link>; })}</div> : <EmptyState title="Первая страница ещё впереди" description="Начните с одного события, которое вам хочется сохранить." action={<Link to="/book" className="button button--secondary">Открыть книгу</Link>} />}
    </section>

    <section className="section"><div className="section__heading"><div><p className="eyebrow">За каждой историей — человек</p><h2>Близкие</h2></div><Link to="/people" className="text-link">Все близкие <ArrowRight size={18} aria-hidden="true" /></Link></div><div className="people-list">{people.slice(0, 3).map((item) => <PersonCard key={item.id} person={item} />)}</div>{!people.length ? <p className="muted-copy">Добавьте бабушку, папу или сестру — для каждого появятся вопросы для разговора. <Link to="/people?add=1" className="text-link">Добавить близкого</Link></p> : null}</section>
    {book ? <Card tone="warm" className="home-invite"><div><span className="home-invite__icon"><Users size={25} aria-hidden="true" /></span><h2>У каждого есть своя часть истории</h2><p>Отправьте книгу близким одним файлом — через MAX или почту, без регистрации. Они допишут свои воспоминания и пришлют обратно.</p></div><Link to={invitePerson ? '/invite/' + invitePerson.id : '/people?add=1'} className="button button--secondary">{invitePerson ? 'Пригласить близких' : 'Добавить близкого'}</Link></Card> : null}
  </div>;
}
