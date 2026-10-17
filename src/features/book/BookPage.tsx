import { ArrowRight, BookOpen, CalendarDays, Clapperboard, Heart, Pencil, Plus, Search, Share2, Users, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { Book3D } from '../../components/Book3D';
import { Card } from '../../components/Card';
import { ChoiceDialog } from '../../components/ChoiceDialog';
import { EmptyState } from '../../components/EmptyState';
import { MediaImage } from '../../components/MediaImage';
import { PageHeader } from '../../components/PageHeader';
import { clothStyle } from '../../lib/cloth';
import { chapterLabel, toRoman } from '../../lib/film/text';
import { formatDate, pluralize, truncate } from '../../lib/format';
import { cloudErrorMessage } from '../../sync/cloudApi';
import { useCloudSync } from '../../sync/CloudSync';
import { BookCloudBar } from '../cloud/BookCloudBar';
import { BookForm, type BookFormValues } from '../library/BookForm';
import { BookShelf, ImportBookButton } from '../library/BookShelf';
import { ChapterForm } from '../library/ChapterForm';
import { ShareBookPanel } from '../library/ShareBookPanel';
import { MomentDetailsForm, type MomentDetails } from '../moments/MomentDetailsForm';

type Panel = 'none' | 'new-book' | 'edit-book' | 'share' | 'moment' | 'new-chapter';

export function BookPage() {
  const {
    books, activeBook: book, people, mediaAssets, chaptersForBook, momentsForChapter, perspectivesForMoment, mediaForPerspective, getPerson,
    addMoment, toggleMomentFavorite, createBook, updateBook, setBookCover, deleteBook, createChapter, updateChapter, moveChapter, deleteChapter
  } = useAppState();
  const cloud = useCloudSync();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState<Panel>('none');
  const [momentChapterId, setMomentChapterId] = useState('');
  const [editingChapterId, setEditingChapterId] = useState('');
  // A shared book is removed through a choice: here only, for everyone, or leaving it.
  const [bookRemoval, setBookRemoval] = useState<{ busy: boolean; error: string } | null>(null);
  // A message handed over by the previous screen, e.g. after accepting an invitation.
  const [notice, setNotice] = useState(() => (typeof location.state?.notice === 'string' ? location.state.notice as string : ''));
  const chapters = book ? chaptersForBook(book.id) : [];
  const allMoments = chapters.flatMap((chapter) => momentsForChapter(chapter.id));
  const query = params.get('q') ?? '';
  const personId = params.get('person') ?? '';
  // A chapter filter left over from another book on the shelf is ignored.
  const activeChapterId = chapters.some((chapter) => chapter.id === params.get('chapter')) ? params.get('chapter')! : '';
  const favoritesOnly = params.get('favorites') === '1';
  const voiceCount = new Set(allMoments.flatMap((moment) => perspectivesForMoment(moment.id).map((item) => item.authorId).filter(Boolean))).size;
  const hasFilters = Boolean(query || personId || activeChapterId || favoritesOnly);
  const bookPhotos = mediaAssets.filter((asset) => asset.type === 'photo'
    && allMoments.some((moment) => perspectivesForMoment(moment.id).some((item) => item.mediaAssetId === asset.id)));

  const reveal = (id: string) => window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const toggle = (next: Panel) => {
    setNotice('');
    setPanel((current) => current === next ? 'none' : next);
    if (next === 'new-book') reveal('create-book');
    if (next === 'new-chapter') reveal('create-chapter');
    if (next === 'share') reveal('share-book');
  };
  const imported = (message: string) => {
    setPanel('none');
    setParams({}, { replace: true });
    setNotice(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const openMomentForm = (chapterId = '') => {
    setMomentChapterId(chapterId || chapters.find((item) => item.id === activeChapterId)?.id || chapters[0]?.id || '');
    setNotice('');
    setPanel('moment');
    reveal('create-moment');
  };

  const submitMoment = (details: MomentDetails) => {
    if (!book) return;
    const moment = addMoment({ ...details, bookId: book.id, tags: [] });
    navigate('/moments/' + moment.id);
  };

  const submitNewBook = (values: BookFormValues) => {
    const created = createBook(values, values.firstChapter);
    setParams({}, { replace: true });
    setPanel('none');
    setNotice(`Книга «${created.title}» создана. Добавьте первый момент или ещё главы.`);
    // With the family storage connected, a new book goes to Google Drive right away.
    if (cloud.connection) {
      cloud.publishBook(created.id).then(
        () => setNotice(`Книга «${created.title}» создана и сохранена в семейное хранилище. Пригласите близких через «Поделиться».`),
        (error) => setNotice(`Книга «${created.title}» создана на телефоне. В хранилище сохранить не удалось: ${cloudErrorMessage(error)} Нажмите «Сохранить в Google Диск» позже.`)
      );
    }
  };

  const submitBookEdit = (values: BookFormValues) => {
    if (!book) return;
    updateBook(book.id, values);
    if (values.coverMediaAssetId !== book.coverMediaAssetId) setBookCover(book.id, values.coverMediaAssetId);
    setPanel('none');
    setNotice('Книга обновлена.');
  };

  const sharedBook = book && cloud.connection ? cloud.books[book.id] : undefined;
  const bookContents = `${chapters.length} ${pluralize(chapters.length, 'глава', 'главы', 'глав')} и ${allMoments.length} ${pluralize(allMoments.length, 'момент', 'момента', 'моментов')}`;

  const removeBook = () => {
    if (!book) return;
    if (sharedBook) { setBookRemoval({ busy: false, error: '' }); return; }
    if (!window.confirm(`Удалить книгу «${book.title}»? Будут удалены ${bookContents} со всеми рассказами, фото и голосами. Это нельзя отменить. Если сомневаетесь, сначала скачайте резервную копию в настройках.`)) return;
    deleteBook(book.id);
    setParams({}, { replace: true });
    setPanel('none');
    setNotice(`Книга «${book.title}» удалена.`);
  };

  const finishBookRemoval = async (mode: 'local' | 'delete' | 'leave') => {
    if (!book) return;
    setBookRemoval({ busy: true, error: '' });
    try {
      await cloud.removeBook(book.id, mode);
    } catch (error) {
      setBookRemoval({ busy: false, error: `Не получилось: ${cloudErrorMessage(error)}` });
      return;
    }
    deleteBook(book.id);
    setBookRemoval(null);
    setParams({}, { replace: true });
    setPanel('none');
    setNotice(mode === 'delete' ? `Книга «${book.title}» удалена у всех участников.`
      : mode === 'leave' ? `Вы вышли из книги «${book.title}». У остальных участников она осталась.`
        : `Книга «${book.title}» убрана с этого телефона. У остальных участников она осталась; вернуть её сюда можно в «Настройки → Семейное хранилище».`);
  };

  const removeChapter = (chapterId: string) => {
    const chapter = chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    const count = momentsForChapter(chapterId).length;
    const warning = count ? ` Вместе с ней удалятся ${count} ${pluralize(count, 'момент', 'момента', 'моментов')} со всеми рассказами и материалами.` : '';
    const everyone = sharedBook ? ' у всех участников книги' : '';
    if (!window.confirm(`Удалить главу «${chapter.title}»${everyone}?${warning} Это нельзя отменить.`)) return;
    deleteChapter(chapterId);
    setEditingChapterId('');
    if (activeChapterId === chapterId) setFilter('chapter', '');
    setNotice(`Глава «${chapter.title}» удалена.`);
  };

  const shelf = <BookShelf onCreate={() => toggle('new-book')} />;
  const newBookForm = panel === 'new-book' ? (
    <Card className="library-form-card" id="create-book">
      <div className="card-heading"><div><p className="eyebrow">Новая книга</p><h2>Создать книгу</h2><p>Отдельная книга — для бабушки, для поездки, для свадьбы. У каждой свои главы и свой фильм.</p></div>
        <button type="button" className="icon-button" aria-label="Закрыть форму" onClick={() => setPanel('none')}><X size={20} /></button></div>
      <BookForm mode="create" onSubmit={submitNewBook} onCancel={() => setPanel('none')} />
    </Card>
  ) : null;
  const noticeLine = notice ? <p className="field-message field-message--success library-notice" role="status">{notice}</p> : null;

  if (!book) return (
    <div className="page page--book-new">
      <PageHeader eyebrow="Ваша библиотека" title="Создайте первую книгу" description="Книга — это главы, в каждой главе — моменты: рассказы, фото, голос и видео близких. Можно начать с одной истории." />
      {noticeLine}
      {newBookForm ?? (
        <EmptyState title="Книг пока нет" description="Создайте книгу о семье или откройте файл книги, который прислали близкие."
          action={<div className="page-action-group page-action-group--center">
            <button type="button" className="button button--primary" onClick={() => setPanel('new-book')}><Plus size={18} aria-hidden="true" /> Создать книгу</button>
            <ImportBookButton onImported={imported} />
          </div>} />
      )}
    </div>
  );

  const chapterHeading = (chapter: (typeof chapters)[number], count: number, index: number) => editingChapterId === chapter.id ? (
    <Card className="chapter-edit-card">
      <p className="eyebrow">{chapterLabel(chapter.order)}</p>
      <ChapterForm key={chapter.id} initial={chapter} submitLabel="Сохранить главу"
        onSubmit={(values) => { updateChapter(chapter.id, values); setEditingChapterId(''); }}
        onCancel={() => setEditingChapterId('')}
        onMove={(direction) => moveChapter(chapter.id, direction)} canMoveUp={index > 0} canMoveDown={index < chapters.length - 1}
        onDelete={cloud.deletionBlocker(book?.id, { type: 'chapter', id: chapter.id }) ? undefined : () => removeChapter(chapter.id)}
        deleteNote={cloud.deletionBlocker(book?.id, { type: 'chapter', id: chapter.id }) ?? undefined} />
    </Card>
  ) : (
    <div className="chapter-section__heading"><span className="chapter-numeral" aria-hidden="true">{toRoman(chapter.order)}</span>
      <div><p className="eyebrow">{chapterLabel(chapter.order)}</p><h2>{chapter.title}</h2>{chapter.description ? <p>{chapter.description}</p> : null}</div>
      <div className="chapter-actions"><span className="chapter-count">{count} {pluralize(count, 'момент', 'момента', 'моментов')}</span>
        {count ? <Link to={'/read?chapter=' + chapter.id} className="button button--ghost button--small"><BookOpen size={17} aria-hidden="true" /> Листать</Link> : null}
        {count ? <Link to={'/chapters/' + chapter.id + '/film'} className="button button--secondary button--small"><Clapperboard size={17} aria-hidden="true" /> Фильм главы</Link> : null}
        <button type="button" className="icon-button chapter-actions__edit" aria-label={'Изменить главу «' + chapter.title + '»'} onClick={() => { setEditingChapterId(chapter.id); setNotice(''); }}><Pencil size={18} /></button></div></div>
  );

  return (
    <div className="page page--book-new">
      <PageHeader eyebrow="Ваша книга воспоминаний" title={book.title} description={book.description}
        action={<div className="page-action-group">
          <Link to="/export" className="button button--ghost button--small"><BookOpen size={18} aria-hidden="true" /> Собрать книгу</Link>
          <button type="button" className="button button--primary button--small" onClick={() => panel === 'moment' ? setPanel('none') : openMomentForm()} disabled={!chapters.length} aria-expanded={panel === 'moment'} aria-controls="create-moment"><Plus size={18} aria-hidden="true" /> Добавить момент</button>
        </div>}
      />

      {shelf}
      {newBookForm}
      {noticeLine}

      <section className="book-showcase" aria-label="Книга">
        <Book3D title={book.title} cover={mediaAssets.find((asset) => asset.id === book.coverMediaAssetId)} to="/read" style={clothStyle(book, books)} label={'Читать книгу «' + book.title + '» с перелистыванием страниц'} />
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
            {chapters.find((chapter) => momentsForChapter(chapter.id).length) ? <Link to={'/chapters/' + chapters.find((chapter) => momentsForChapter(chapter.id).length)!.id + '/film'} className="button button--secondary"><Clapperboard size={18} aria-hidden="true" /> Фильм главы</Link> : null}
          </div>
          <div className="book-showcase__tools">
            <button type="button" className="button button--ghost button--small" aria-expanded={panel === 'share'} onClick={() => toggle('share')}><Share2 size={17} aria-hidden="true" /> Поделиться</button>
            <button type="button" className="button button--ghost button--small" aria-expanded={panel === 'edit-book'} onClick={() => toggle('edit-book')}><Pencil size={17} aria-hidden="true" /> Изменить книгу</button>
          </div>
        </div>
      </section>

      <BookCloudBar book={book} />

      {panel === 'edit-book' ? <Card className="library-form-card">
        <div className="card-heading"><div><p className="eyebrow">Книга</p><h2>Изменить книгу</h2></div>
          <button type="button" className="icon-button" aria-label="Закрыть форму" onClick={() => setPanel('none')}><X size={20} /></button></div>
        <BookForm key={book.id} mode="edit" initial={book} photos={bookPhotos} onSubmit={submitBookEdit} onCancel={() => setPanel('none')} onDelete={removeBook} />
      </Card> : null}

      {panel === 'share' ? <div id="share-book"><ShareBookPanel book={book} onClose={() => setPanel('none')} /></div> : null}
      <div className="library-import"><ImportBookButton className="text-button" label="Открыть файл книги от близких" onImported={imported} /></div>

      {panel === 'moment' ? <Card className="create-moment-card" id="create-moment">
        <div className="card-heading"><div><p className="eyebrow">Новая страница</p><h2>Создать момент</h2><p>Начните с названия. Рассказы и материалы можно добавить следом.</p></div>
          <button type="button" className="icon-button" aria-label="Закрыть форму" onClick={() => setPanel('none')}><X size={20} /></button></div>
        <MomentDetailsForm key={momentChapterId} chapters={chapters} initial={{ title: '', summary: '', chapterId: momentChapterId }} submitLabel="Создать и открыть" onSubmit={submitMoment} onCancel={() => setPanel('none')} />
      </Card> : null}

      {allMoments.length ? <section className="book-toolbar" aria-label="Поиск и фильтры книги">
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
      </section> : null}

      {hasFilters && filteredMoments.length === 0 ? <EmptyState title="Таких историй пока не нашли" description="Попробуйте другое слово или сбросьте фильтры."
        action={<button type="button" className="button button--secondary" onClick={() => setParams({})}>Показать всю книгу</button>} /> : <div className="chapter-list">
        {chapters.map((chapter, index) => {
          const moments = filteredMoments.filter((moment) => moment.chapterId === chapter.id);
          if (hasFilters && !moments.length) return null;
          return <section className="chapter-section" key={chapter.id}>
            {chapterHeading(chapter, momentsForChapter(chapter.id).length, index)}
            {moments.length ? <div className="moment-grid">{moments.map((moment, momentIndex) => {
              const perspectives = perspectivesForMoment(moment.id);
              const primary = perspectives.find((item) => item.id === moment.primaryPerspectiveId) ?? perspectives[0];
              const author = primary ? getPerson(primary.authorId ?? '') : undefined;
              const participants = Array.from(new Set(perspectives.map((item) => item.authorId).filter((id): id is string => Boolean(id)))).map(getPerson).filter((person) => Boolean(person));
              const image = perspectives.map((item) => mediaForPerspective(item.id)).find((asset) => asset?.type === 'photo');
              return <article className={'moment-card ' + (image ? 'moment-card--illustrated ' : '') + (moment.favorite ? 'is-favorite' : '')} key={moment.id} style={{ '--i': momentIndex } as CSSProperties}>
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
            })}</div> : <div className="chapter-empty">
              <p>В этой главе пока нет моментов. Начните с одного воспоминания — рассказ, фото, голос или видео можно добавить потом.</p>
              <button type="button" className="button button--secondary button--small" onClick={() => openMomentForm(chapter.id)}><Plus size={17} aria-hidden="true" /> Добавить момент сюда</button>
            </div>}
          </section>;
        })}
      </div>}

      {!hasFilters ? (panel === 'new-chapter' ? <Card className="library-form-card" id="create-chapter">
        <div className="card-heading"><div><p className="eyebrow">{chapterLabel(chapters.length + 1)}</p><h2>Новая глава</h2></div>
          <button type="button" className="icon-button" aria-label="Закрыть форму" onClick={() => setPanel('none')}><X size={20} /></button></div>
        <ChapterForm submitLabel="Добавить главу" onCancel={() => setPanel('none')}
          onSubmit={(values) => { const chapter = createChapter(book.id, values); setPanel('none'); setNotice(`Глава «${chapter.title}» добавлена в конец книги.`); }} />
      </Card> : <button type="button" className="add-chapter" onClick={() => toggle('new-chapter')}>
        <Plus size={22} aria-hidden="true" /><span><strong>{chapters.length ? 'Добавить главу' : 'Добавить первую главу'}</strong><small>{chapters.length ? 'Она появится в конце книги — порядок можно поменять' : 'Без главы моменты некуда положить'}</small></span>
      </button>) : null}

      {bookRemoval && sharedBook ? (
        <ChoiceDialog title={`${sharedBook.canManage ? 'Удалить' : 'Убрать'} книгу «${book.title}»?`} busy={bookRemoval.busy} error={bookRemoval.error}
          onCancel={() => setBookRemoval(null)} onChoose={(mode) => { void finishBookRemoval(mode as 'local' | 'delete' | 'leave'); }}
          choices={sharedBook.canManage ? [
            { id: 'local', label: 'Только с этого телефона', description: 'У остальных участников книга останется и будет обновляться. Вернуть её сюда можно в «Настройки → Семейное хранилище».' },
            { id: 'delete', label: 'У всех участников', danger: true, description: 'Папка книги уйдёт в корзину Google Диска хранилища (там она хранится 30 дней), участники перестанут получать изменения. Уже скачанные копии останутся на их телефонах.' }
          ] : [
            { id: 'local', label: 'Убрать с этого телефона', description: 'Вы останетесь участником: вернуть книгу можно в «Настройки → Семейное хранилище».' },
            { id: 'leave', label: 'Выйти из книги', danger: true, description: 'Книга удалится с этого телефона, а вернуться получится только по новому приглашению.' }
          ]}>
          <p>В книге {bookContents}. Она хранится в семейном хранилище{sharedBook.creatorName ? `, создатель — ${sharedBook.creatorName}` : ''}.</p>
          {!sharedBook.canManage ? <p>У создателя и остальных участников ничего не удалится.</p> : null}
        </ChoiceDialog>
      ) : null}
    </div>
  );
}
