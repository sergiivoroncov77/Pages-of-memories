import { ArrowRight, BookOpen, CalendarDays, Clapperboard, Heart, Plus, Search, Users, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Book3D } from '../../components/Book3D';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { MediaImage } from '../../components/MediaImage';
import { PageHeader } from '../../components/PageHeader';
import { chapterLabel, toRoman } from '../../lib/film/text';
import { formatDate, pluralize, truncate } from '../../lib/format';
import { MomentDetailsForm, type MomentDetails } from '../moments/MomentDetailsForm';

export function BookPage() {
  const { books, people, mediaAssets, chaptersForBook, momentsForChapter, perspectivesForMoment, mediaForPerspective, getPerson, addMoment, toggleMomentFavorite } = useAppState();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const book = books[0];
  const chapters = book ? chaptersForBook(book.id) : [];
  const allMoments = chapters.flatMap((chapter) => momentsForChapter(chapter.id));
  const query = params.get('q') ?? '';
  const personId = params.get('person') ?? '';
  const activeChapterId = params.get('chapter') ?? '';
  const favoritesOnly = params.get('favorites') === '1';
  const voiceCount = new Set(allMoments.flatMap((moment) => perspectivesForMoment(moment.id).map((item) => item.authorId).filter(Boolean))).size;
  const hasFilters = Boolean(query || personId || activeChapterId || favoritesOnly);

  const setFilter = (key: string, value: string) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });

  const filteredMoments = allMoments.filter((moment) => {
    if (activeChapterId && moment.chapterId !== activeChapterId) return false;
    if (favoritesOnly && !moment.favorite) return false;
    const perspectives = perspectivesForMoment(moment.id);
    if (personId && !perspectives.some((item) => item.authorId === personId)) return false;
    const normalized = query.trim().toLocaleLowerCase('ru');
    if (!normalized) return true;
    const authors = perspectives.map((item) => getPerson(item.authorId ?? '')?.name ?? '');
    const content = [moment.title, moment.summary, ...moment.tags, ...authors, ...perspectives.map((item) => item.content + ' ' + (item.caption ?? ''))];
    return content.join(' ').toLocaleLowerCase('ru').includes(normalized);
  });

  const submitMoment = (details: MomentDetails) => {
    if (!book) return;
    const moment = addMoment({ ...details, bookId: book.id, tags: [] });
    navigate('/moments/' + moment.id);
  };

  if (!book) return (
    <div className="page">
      <EmptyState title="Книги пока нет" description="Восстановите книгу из резервной копии или загрузите демонстрационный пример в настройках." action={<Link to="/settings" className="button button--primary">Открыть настройки</Link>} />
    </div>
  );

  return (
    <div className="page page--book-new">
      <PageHeader eyebrow="Ваша книга воспоминаний" title={book.title} description={book.description}
        action={<div className="page-action-group">
          <Link to="/export" className="button button--ghost button--small"><BookOpen size={18} aria-hidden="true" /> Собрать книгу</Link>
          <button type="button" className="button button--primary button--small" onClick={() => setShowCreate((value) => !value)} disabled={!chapters.length} aria-expanded={showCreate} aria-controls="create-moment"><Plus size={18} aria-hidden="true" /> Добавить момент</button>
        </div>}
      />

      <section className="book-showcase" aria-label="Книга">
        <Book3D title={book.title} cover={mediaAssets.find((asset) => asset.id === book.coverMediaAssetId)} to="/read" label={'Читать книгу «' + book.title + '» с перелистыванием страниц'} />
        <div className="book-showcase__copy">
          <span className="badge badge--soft"><BookOpen size={16} aria-hidden="true" /> История продолжается</span>
          <h2>{book.subtitle || 'Сохраните то, что хочется помнить'}</h2>
          <p>Один момент, разные голоса. Листайте книгу как настоящую или соберите главу в фильм с голосами и фотографиями.</p>
          <dl className="book-showcase__stats" aria-label="Содержание книги">
            <div><dd>{chapters.length}</dd><dt>{pluralize(chapters.length, 'глава', 'главы', 'глав')}</dt></div>
            <div><dd>{allMoments.length}</dd><dt>{pluralize(allMoments.length, 'момент', 'момента', 'моментов')}</dt></div>
            <div><dd>{voiceCount}</dd><dt>{pluralize(voiceCount, 'рассказчик', 'рассказчика', 'рассказчиков')}</dt></div>
          </dl>
          <div className="book-showcase__actions">
            <Link to="/read" className="button button--primary"><BookOpen size={18} aria-hidden="true" /> Читать книгу</Link>
            {chapters[0] ? <Link to={'/chapters/' + chapters[0].id + '/film'} className="button button--secondary"><Clapperboard size={18} aria-hidden="true" /> Фильм главы</Link> : null}
          </div>
        </div>
      </section>

      {showCreate ? <Card className="create-moment-card" id="create-moment">
        <div className="card-heading"><div><p className="eyebrow">Новая страница</p><h2>Создать момент</h2><p>Начните с названия. Рассказы и материалы можно добавить следом.</p></div>
          <button type="button" className="icon-button" aria-label="Закрыть форму" onClick={() => setShowCreate(false)}><X size={20} /></button></div>
        <MomentDetailsForm chapters={chapters} initial={{ title: '', summary: '', chapterId: chapters.find((item) => item.id === activeChapterId)?.id ?? chapters[0]?.id ?? '' }} submitLabel="Создать и открыть" onSubmit={submitMoment} onCancel={() => setShowCreate(false)} />
      </Card> : null}

      <section className="book-toolbar" aria-label="Поиск и фильтры книги">
        <div className="book-search-row">
          <label className="search-field"><Search size={20} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setFilter('q', event.target.value)} placeholder="Найти историю, человека или слово" aria-label="Поиск по книге" />
            {query ? <button type="button" onClick={() => setFilter('q', '')} aria-label="Очистить поиск"><X size={18} /></button> : null}
          </label>
          <label className="book-person-filter"><span className="visually-hidden">Рассказчик</span><Users size={18} aria-hidden="true" /><select value={personId} onChange={(event) => setFilter('person', event.target.value)} aria-label="Рассказчик"><option value="">Все рассказчики</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <button type="button" className={'favorite-filter ' + (favoritesOnly ? 'is-active' : '')} aria-pressed={favoritesOnly} onClick={() => setFilter('favorites', favoritesOnly ? '' : '1')}><Heart size={18} fill={favoritesOnly ? 'currentColor' : 'none'} aria-hidden="true" /> Избранное</button>
        </div>
        <div className="chapter-filter" aria-label="Фильтр по главе">
          <button type="button" aria-pressed={!activeChapterId} className={!activeChapterId ? 'is-active' : ''} onClick={() => setFilter('chapter', '')}>Все главы</button>
          {chapters.map((chapter) => <button type="button" key={chapter.id} aria-pressed={activeChapterId === chapter.id} className={activeChapterId === chapter.id ? 'is-active' : ''} onClick={() => setFilter('chapter', chapter.id)}>{chapter.title}</button>)}
        </div>
        {hasFilters ? <div className="book-results"><span role="status">Найдено: {filteredMoments.length} {pluralize(filteredMoments.length, 'момент', 'момента', 'моментов')}</span><button type="button" className="text-button" onClick={() => setParams({})}>Сбросить фильтры</button></div> : null}
      </section>

      {filteredMoments.length === 0 ? <EmptyState title={hasFilters ? 'Таких историй пока не нашли' : 'Начните с одного воспоминания'} description={hasFilters ? 'Попробуйте другое слово или сбросьте фильтры.' : 'Добавьте момент, о котором вам хочется рассказать близким.'}
        action={hasFilters ? <button type="button" className="button button--secondary" onClick={() => setParams({})}>Показать всю книгу</button> : chapters.length ? <button type="button" className="button button--primary" onClick={() => setShowCreate(true)}>Добавить первый момент</button> : <Link to="/settings" className="button button--secondary">Восстановить книгу</Link>} /> : <div className="chapter-list">
        {chapters.map((chapter) => {
          const moments = filteredMoments.filter((moment) => moment.chapterId === chapter.id);
          if (!moments.length) return null;
          return <section className="chapter-section" key={chapter.id}>
            <div className="chapter-section__heading"><span className="chapter-numeral" aria-hidden="true">{toRoman(chapter.order)}</span>
              <div><p className="eyebrow">{chapterLabel(chapter.order)}</p><h2>{chapter.title}</h2><p>{chapter.description}</p></div>
              <div className="chapter-actions"><span className="chapter-count">{moments.length} {pluralize(moments.length, 'момент', 'момента', 'моментов')}</span>
                <Link to={'/read?chapter=' + chapter.id} className="button button--ghost button--small"><BookOpen size={17} aria-hidden="true" /> Листать</Link>
                <Link to={'/chapters/' + chapter.id + '/film'} className="button button--secondary button--small"><Clapperboard size={17} aria-hidden="true" /> Фильм главы</Link></div></div>
            <div className="moment-grid">{moments.map((moment, index) => {
              const perspectives = perspectivesForMoment(moment.id);
              const primary = perspectives.find((item) => item.id === moment.primaryPerspectiveId) ?? perspectives[0];
              const author = primary ? getPerson(primary.authorId ?? '') : undefined;
              const participants = Array.from(new Set(perspectives.map((item) => item.authorId).filter((id): id is string => Boolean(id)))).map(getPerson).filter((person) => Boolean(person));
              const image = perspectives.map((item) => mediaForPerspective(item.id)).find((asset) => asset?.type === 'photo');
              return <article className={'moment-card ' + (image ? 'moment-card--illustrated ' : '') + (moment.favorite ? 'is-favorite' : '')} key={moment.id} style={{ '--i': index } as CSSProperties}>
                <Link to={'/moments/' + moment.id} className="moment-card__main">
                  {image ? <MediaImage className="moment-card__image" asset={image} /> : null}
                  <div className="moment-card__body"><div className="moment-card__topline"><span><CalendarDays size={15} aria-hidden="true" /> {moment.occurredAt ? formatDate(moment.occurredAt) : 'Дата не указана'}</span></div>
                    <h3>{moment.title}</h3><p>{truncate(moment.summary || primary?.content || 'Добавьте первый рассказ на эту страницу.', 150)}</p>
                    <div className="moment-card__footer"><span className="moment-card__author">{author?.name ?? 'Пока без рассказчика'}</span><span className="avatar-stack" aria-label={participants.map((person) => person?.name).join(', ')}>{participants.slice(0, 3).map((person) => person ? <span key={person.id} aria-hidden="true" style={{ background: person.avatarColor }}>{person.initials}</span> : null)}</span></div>
                    <span className="moment-card__views">{perspectives.length} {pluralize(perspectives.length, 'взгляд', 'взгляда', 'взглядов')} <ArrowRight size={16} aria-hidden="true" /></span>
                  </div>
                </Link>
                <button type="button" className={'moment-card__favorite ' + (moment.favorite ? 'is-active' : '')} aria-label={moment.favorite ? 'Убрать из избранного: ' + moment.title : 'Добавить в избранное: ' + moment.title} aria-pressed={moment.favorite} onClick={() => toggleMomentFavorite(moment.id)}><Heart size={18} fill={moment.favorite ? 'currentColor' : 'none'} /></button>
              </article>;
            })}</div>
          </section>;
        })}
      </div>}
    </div>
  );
}
