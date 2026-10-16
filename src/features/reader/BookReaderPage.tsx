import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Clapperboard, FileAudio, MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { EmptyState } from '../../components/EmptyState';
import { MediaImage } from '../../components/MediaImage';
import { StoredAudio } from '../../components/StoredAudio';
import type { MediaAsset } from '../../data/types';
import { chronologicalMoments } from '../../lib/film/timeline';
import { pluralize } from '../../lib/format';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useMediaUrl } from '../../lib/useMediaUrl';
import {
  anchorOf, buildLeaves, buildReaderPages, DEFAULT_PAGE_BUDGET, estimatePageBudget, findPage, leavesTurnedFor, logicalForTurned, pageChapterId,
  type PageAnchor, type ReaderPage, type ReaderSource
} from './readerPages';

const PAGE_RATIO = 0.7;

export function BookReaderPage() {
  const { books, activeBook, chapters, moments, chaptersForBook, momentsForChapter, perspectivesForMoment, reflectionsForMoment, mediaAssets, people, snapshot } = useAppState();
  const [params] = useSearchParams();
  // A link to a chapter or moment opens the book it belongs to, even if another book is active.
  const linkedBookId = chapters.find((item) => item.id === params.get('chapter'))?.bookId
    ?? moments.find((item) => item.id === params.get('moment'))?.bookId;
  const book = books.find((item) => item.id === linkedBookId) ?? activeBook;
  const source = useMemo<ReaderSource | null>(() => book ? {
    book,
    chapters: chaptersForBook(book.id).map((chapter) => ({
      chapter,
      moments: chronologicalMoments(momentsForChapter(chapter.id)).map((moment) => ({
        moment, perspectives: perspectivesForMoment(moment.id), reflections: reflectionsForMoment(moment.id)
      }))
    })),
    assets: new Map(mediaAssets.map((asset) => [asset.id, asset])),
    people: new Map(people.map((person) => [person.id, person]))
    // The snapshot changes whenever anything in the book does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  } : null, [snapshot, book]);

  if (!book || !source) {
    return <div className="page"><EmptyState title="Книги пока нет" description="Создайте книгу или откройте файл книги, который прислали близкие." action={<Link to="/book" className="button button--primary">К книгам</Link>} /></div>;
  }
  return <Reader key={book.id} source={source} bookTitle={book.title} assets={mediaAssets} />;
}

function initialPage(pages: ReaderPage[], params: URLSearchParams): number {
  const page = Number(params.get('page'));
  if (Number.isInteger(page) && page > 0 && page < pages.length) return page;
  const momentId = params.get('moment');
  const chapterId = params.get('chapter');
  const index = pages.findIndex((item) => momentId ? 'momentId' in item && item.momentId === momentId : chapterId ? item.kind === 'chapter' && item.chapterId === chapterId : false);
  return Math.max(0, index);
}

function Reader({ source, bookTitle, assets }: { source: ReaderSource; bookTitle: string; assets: MediaAsset[] }) {
  const [params, setParams] = useSearchParams();
  const spread = useMediaQuery('(min-width: 900px)');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const pageWidth = spread ? Math.min(size.width / 2, size.height * PAGE_RATIO) : Math.min(size.width, 560);
  const pageHeight = spread ? pageWidth / PAGE_RATIO : Math.min(size.height, Math.max(420, pageWidth / 0.6));
  const budget = size.width ? estimatePageBudget(pageWidth, pageHeight) : DEFAULT_PAGE_BUDGET;
  const pages = useMemo(() => buildReaderPages(source, budget),
    // The budget is rounded, so pages are rebuilt only when the text really fits differently.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, budget.firstPageChars, budget.pageChars]);
  // The reader remembers the page itself, not its number: re-pagination on resize keeps the place.
  const [anchor, setAnchor] = useState<PageAnchor | null>(null);
  const current = anchor ? findPage(pages, anchor) : initialPage(pages, params);
  // The shade sweep only plays once the reader has turned a page.
  const [hasTurned, setHasTurned] = useState(false);
  const turnTo = useCallback((page: number) => {
    setHasTurned(true);
    setAnchor(anchorOf(pages[Math.min(Math.max(0, page), pages.length - 1)]));
  }, [pages]);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number; time: number } | null>(null);
  const leaves = useMemo(() => buildLeaves(pages, spread), [pages, spread]);
  const safeCurrent = Math.min(current, pages.length - 1);
  const turned = leavesTurnedFor(leaves, safeCurrent, spread);
  const maxTurned = spread ? leaves.length : leaves.length - 1;
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const contents = pages.find((page): page is Extract<ReaderPage, { kind: 'contents' }> => page.kind === 'contents');
  const chapterTitles = useMemo(() => new Map(contents?.entries.map((entry) => [entry.chapterId, entry.title]) ?? []), [contents]);
  const chapterId = pageChapterId(pages[safeCurrent]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Resolve ?chapter= / ?moment= / ?page= once, against pages laid out for the real page size.
  useEffect(() => {
    if (!anchor && size.width > 0 && pages[safeCurrent]) setAnchor(anchorOf(pages[safeCurrent]));
  }, [anchor, size.width, pages, safeCurrent]);

  useEffect(() => {
    if (!anchor) return;
    setParams((existing) => {
      const next = new URLSearchParams(existing);
      next.delete('chapter');
      next.delete('moment');
      if (safeCurrent > 0) next.set('page', String(safeCurrent));
      else next.delete('page');
      return next;
    }, { replace: true });
  }, [anchor, safeCurrent, setParams]);

  const goTo = useCallback((nextTurned: number) => {
    const clamped = Math.min(Math.max(0, nextTurned), maxTurned);
    turnTo(logicalForTurned(leaves, clamped, spread));
  }, [leaves, maxTurned, spread, turnTo]);
  const next = useCallback(() => goTo(turned + 1), [goTo, turned]);
  const previous = useCallback(() => goTo(turned - 1), [goTo, turned]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, audio, video, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previous(); }
      if (event.key === 'Home') { event.preventDefault(); turnTo(0); }
      if (event.key === 'End') { event.preventDefault(); turnTo(pages.length - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, previous, pages.length, turnTo]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointer.current = { x: event.clientX, y: event.clientY, time: performance.now() };
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) next();
      else previous();
      return;
    }
    const tap = Math.abs(dx) < 8 && Math.abs(dy) < 8 && performance.now() - start.time < 400;
    if (!tap || (event.target as HTMLElement).closest('button, a, audio, video, input, select, label')) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    if (spread ? x > 0.5 : x > 0.66) next();
    else if (spread ? x <= 0.5 : x < 0.34) previous();
  };

  const closed = spread && turned === 0 ? 'is-closed-front' : spread && turned === leaves.length ? 'is-closed-back' : '';
  const visibleKeys = new Set(spread ? [leaves[turned - 1]?.back?.page.key, leaves[turned]?.front.page.key] : [leaves[turned]?.front.page.key]);
  const totalNumbered = pages.length - 2;
  const pageLabel = safeCurrent === 0 ? 'Обложка' : safeCurrent === pages.length - 1 ? 'Последняя страница' : `Страница ${safeCurrent} из ${totalNumbered}`;

  return <div className="page page--reader">
    <header className="reader-header">
      <Link className="back-link" to="/book"><ArrowLeft size={20} aria-hidden="true" /> К книге</Link>
      <h1 className="reader-header__title">{bookTitle}</h1>
      {contents ? <label className="reader-jump"><BookOpen size={17} aria-hidden="true" /><span className="visually-hidden">Перейти к главе</span>
        <select value={contents.entries.find((entry) => entry.chapterId === chapterId)?.chapterId ?? ''} onChange={(event) => {
          const entry = contents.entries.find((item) => item.chapterId === event.target.value);
          turnTo(entry ? entry.page : 1);
        }}>
          <option value="">Содержание</option>
          {contents.entries.map((entry) => <option key={entry.chapterId} value={entry.chapterId}>{entry.label}: {entry.title}</option>)}
        </select></label> : null}
    </header>

    <div ref={stageRef} className={'reader-stage ' + (spread ? 'reader-stage--spread' : 'reader-stage--single')} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
      onPointerCancel={() => { pointer.current = null; }} aria-roledescription="книга" aria-label={bookTitle}>
      {size.width > 0 ? <div className={'reader-book ' + closed + (hasTurned ? ' has-turned' : '')} style={{ '--page-w': pageWidth + 'px', '--page-h': pageHeight + 'px' } as CSSProperties}>
        {leaves.map((leaf, index) => {
          if (index < turned - 3 || index > turned + 2) return null;
          const isTurned = index < turned;
          return <div key={leaf.key + (spread ? ':s' : ':p')} className={'reader-leaf ' + (isTurned ? 'is-turned' : '')}
            style={{ zIndex: isTurned ? index + 1 : leaves.length - index + 1 }}>
            <div className="reader-leaf__face reader-leaf__face--front" aria-hidden={!visibleKeys.has(leaf.front.page.key)} inert={!visibleKeys.has(leaf.front.page.key)}>
              <PageView page={leaf.front.page} number={leaf.front.logical} assets={assetsById} chapterTitles={chapterTitles} total={pages.length} onJump={turnTo} />
            </div>
            <div className="reader-leaf__face reader-leaf__face--back" aria-hidden={!leaf.back || !visibleKeys.has(leaf.back.page.key)} inert={!leaf.back || !visibleKeys.has(leaf.back.page.key)}>
              {leaf.back ? <PageView page={leaf.back.page} number={leaf.back.logical} assets={assetsById} chapterTitles={chapterTitles} total={pages.length} onJump={turnTo} /> : <div className="reader-page reader-page--blank" />}
            </div>
          </div>;
        })}
      </div> : null}
    </div>

    <nav className="reader-controls" aria-label="Листание книги">
      <button type="button" className="icon-button reader-controls__turn" onClick={previous} disabled={turned === 0} aria-label="Предыдущая страница"><ChevronLeft size={24} /></button>
      <div className="reader-controls__middle">
        <span role="status" aria-live="polite">{pageLabel}</span>
        <input type="range" min={0} max={pages.length - 1} value={safeCurrent} onChange={(event) => turnTo(Number(event.target.value))} aria-label="Страница книги"
          style={{ '--progress': `${(safeCurrent / Math.max(1, pages.length - 1)) * 100}%` } as CSSProperties} />
      </div>
      {chapterId ? <Link className="button button--ghost button--small reader-controls__film" to={'/chapters/' + chapterId + '/film'}><Clapperboard size={17} aria-hidden="true" /><span>Фильм главы</span></Link> : null}
      <button type="button" className="icon-button reader-controls__turn" onClick={next} disabled={turned >= maxTurned} aria-label="Следующая страница"><ChevronRight size={24} /></button>
    </nav>
  </div>;
}

interface PageViewProps {
  page: ReaderPage;
  number: number;
  total: number;
  assets: Map<string, MediaAsset>;
  chapterTitles: Map<string, string>;
  onJump: (page: number) => void;
}

function PageView({ page, number, total, assets, chapterTitles, onJump }: PageViewProps) {
  const numbered = number > 0 && number < total - 1 && page.kind !== 'blank' && page.kind !== 'chapter';
  const head = 'chapterId' in page && page.kind !== 'chapter' ? <p className="reader-page__head">{chapterTitles.get(page.chapterId)}</p> : null;
  let body;
  switch (page.kind) {
    case 'cover': {
      const cover = page.coverAssetId ? assets.get(page.coverAssetId) : undefined;
      body = <div className="reader-cover">
        <div className="reader-cover__frame">
          <span className="reader-cover__eyebrow">Книга воспоминаний</span>
          <h2>{page.title}</h2>
          {cover ? <MediaImage asset={cover} className="reader-cover__photo" /> : <Fleuron className="reader-cover__mark" />}
          {page.subtitle ? <p>{page.subtitle}</p> : null}
        </div>
        <span className="reader-cover__ribbon" aria-hidden="true" />
      </div>;
      break;
    }
    case 'contents':
      body = <div className="reader-contents"><p className="reader-kicker">Оглавление</p><h2>Содержание</h2>
        <ol>{page.entries.map((entry) => <li key={entry.chapterId}><button type="button" onClick={() => onJump(entry.page)}>
          <span><small>{entry.label}</small>{entry.title}</span><i aria-hidden="true" /><b>{entry.page}</b>
        </button></li>)}</ol>
        <Fleuron /></div>;
      break;
    case 'chapter':
      body = <div className="reader-chapter"><span className="reader-chapter__numeral" aria-hidden="true">{page.numeral}</span>
        <p className="reader-kicker">{page.label}</p><h2>{page.title}</h2><Fleuron />
        {page.description ? <p className="reader-chapter__description">{page.description}</p> : null}
        <small>{page.momentCount} {pluralize(page.momentCount, 'момент', 'момента', 'моментов')}</small></div>;
      break;
    case 'story':
      body = <div className="reader-story">
        {page.heading ? <header className="reader-story__heading">
          {page.heading.date ? <p className="reader-kicker">{page.heading.date}</p> : null}
          <h2>{page.heading.title}</h2>
          {page.heading.narrators.length ? <p className="reader-story__narrators">Вспоминают: {page.heading.narrators.join(', ')}</p> : null}
        </header> : null}
        {!page.heading && page.voice && page.dropCap ? <p className="reader-kicker">Взгляд · {page.voice}</p> : null}
        <div className={'reader-story__text ' + (page.dropCap ? 'has-drop-cap' : '')}>{page.text.split('\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
        {page.voice && page.heading ? <p className="reader-story__signature">— {page.voice}</p> : null}
        {page.voice && !page.heading && !page.dropCap ? <p className="reader-story__signature">— {page.voice}</p> : null}
      </div>;
      break;
    case 'photo': {
      const asset = assets.get(page.assetId);
      body = <figure className="reader-photo">
        <div className="reader-photo__print">{asset ? <MediaImage asset={asset} alt={asset.alt ?? page.caption} /> : null}</div>
        <figcaption>{page.caption ? <span>{page.caption}</span> : null}<small>{page.author}</small></figcaption>
      </figure>;
      break;
    }
    case 'media': {
      const asset = assets.get(page.assetId);
      body = <div className="reader-media"><p className="reader-kicker">{page.mediaType === 'audio' ? 'Голос из прошлого' : 'Видео'}</p>
        <span className="reader-media__icon" aria-hidden="true"><FileAudio size={28} /></span>
        <h3>{page.author}</h3><p>{page.caption}</p>
        {asset ? page.mediaType === 'audio' ? <StoredAudio asset={asset} label={page.caption} /> : <ReaderVideo asset={asset} /> : null}</div>;
      break;
    }
    case 'reflections':
      body = <div className="reader-notes"><p className="reader-kicker"><MessageCircle size={14} aria-hidden="true" /> Отклики близких</p>
        <h3>{page.momentTitle}</h3>
        {page.notes.map((note, index) => <blockquote key={index} className="reader-note"><p>{note.text}</p><cite>{note.author}</cite></blockquote>)}</div>;
      break;
    case 'end':
      body = <div className="reader-cover reader-cover--back"><div className="reader-cover__frame"><Fleuron className="reader-cover__mark" />
        <p>История продолжается.<br />Каждый новый рассказ — ещё одна страница.</p><span className="reader-cover__eyebrow">{page.title}</span></div></div>;
      break;
    default:
      body = <Fleuron className="reader-fleuron--blank" />;
  }
  return <article className={'reader-page reader-page--' + page.kind}>
    {head}
    <div className="reader-page__body">{body}</div>
    {numbered ? <footer className="reader-page__number">{number}</footer> : null}
  </article>;
}

/** A small symmetric flourish, drawn so it never depends on a symbol font. */
function Fleuron({ className = '' }: { className?: string }) {
  return <svg className={'reader-fleuron ' + className} viewBox="0 0 64 26" aria-hidden="true" focusable="false">
    <path d="M32 6 37 13 32 20 27 13Z" fill="currentColor" />
    <path d="M25 13C18 13 15 5 9 7 4 9 5 16 10 16c4 0 4-5 1-5M39 13c7 0 10-8 16-6 5 2 4 9-1 9-4 0-4-5-1-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}

function ReaderVideo({ asset }: { asset: MediaAsset }) {
  const media = useMediaUrl(asset);
  if (media.status !== 'ready') return <p className="muted-copy">{media.status === 'loading' ? 'Загружаем видео…' : 'Видео не найдено на этом устройстве.'}</p>;
  return <video className="reader-media__video" src={media.url} controls playsInline preload="metadata" />;
}
