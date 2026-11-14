import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Clapperboard, Maximize2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState';
import { EmptyState } from '../../components/EmptyState';
import type { MediaAsset } from '../../data/types';
import { clothStyle } from '../../lib/cloth';
import { chronologicalMoments } from '../../lib/film/timeline';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { PageView } from './PageView';
import {
  anchorOf, buildLeaves, estimateLineChars, estimatePageBudget, findPage, leavesTurnedFor, logicalForTurned, pageChapterId,
  type PageAnchor, type ReaderPage, type ReaderSource
} from './readerPages';
import { readTextSizeIndex, saveTextSizeIndex, TEXT_SIZES } from './textSize';
import { useMeasuredPages } from './useMeasuredPages';

const PAGE_RATIO = 0.7;
/** Below this page width story text is not justified: short lines would open wide gaps between words. */
const NARROW_PAGE = 440;
/** Stands in for the book until its pages are measured; nothing is drawn from it. */
const PENDING_PAGES: ReaderPage[] = [{ kind: 'blank', key: 'pending' }];

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
  return <Reader key={book.id} source={source} bookTitle={book.title} assets={mediaAssets} cloth={clothStyle(book, books)} />;
}

function initialPage(pages: ReaderPage[], params: URLSearchParams): number {
  const page = Number(params.get('page'));
  if (Number.isInteger(page) && page > 0 && page < pages.length) return page;
  const momentId = params.get('moment');
  const chapterId = params.get('chapter');
  const index = pages.findIndex((item) => momentId ? 'momentId' in item && item.momentId === momentId : chapterId ? item.kind === 'chapter' && item.chapterId === chapterId : false);
  return Math.max(0, index);
}

function Reader({ source, bookTitle, assets, cloth }: { source: ReaderSource; bookTitle: string; assets: MediaAsset[]; cloth: CSSProperties }) {
  const [params, setParams] = useSearchParams();
  const compact = useMediaQuery('(orientation: landscape) and (max-height: 600px)');
  const spread = useMediaQuery('(min-width: 900px)') && !compact;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const pageWidth = spread ? Math.min(size.width / 2, size.height * PAGE_RATIO) : Math.min(size.width, compact ? 760 : 560);
  const pageHeight = spread ? pageWidth / PAGE_RATIO : Math.min(size.height, pageWidth / 0.5);
  const narrow = pageWidth < NARROW_PAGE;
  // The text size is the device's own choice; the pages are measured again when it changes.
  const [sizeIndex, setSizeIndex] = useState(readTextSizeIndex);
  const textSize = TEXT_SIZES[sizeIndex];
  const changeTextSize = (step: number) => {
    const next = Math.min(TEXT_SIZES.length - 1, Math.max(0, sizeIndex + step));
    setSizeIndex(next);
    saveTextSizeIndex(next);
  };
  const faceRef = useRef<HTMLDivElement>(null);
  const known = size.width > 0 && size.height > 0;
  const guess = estimatePageBudget(pageWidth, pageHeight, { compact, scale: textSize.scale });
  const geometryKey = [spread ? 'spread' : 'single', compact ? 'compact' : '', pageWidth.toFixed(1), pageHeight.toFixed(1), textSize.scale].join('|');
  const measured = useMeasuredPages({
    source, faceRef, enabled: known, geometryKey,
    lineChars: estimateLineChars(pageWidth, { compact, scale: textSize.scale }), pageChars: guess.pageChars
  });
  const ready = measured !== null && known;
  const pages = measured ?? PENDING_PAGES;
  const bookStyle = { ...cloth, '--page-w': pageWidth + 'px', '--page-h': pageHeight + 'px', '--reader-scale': textSize.scale } as CSSProperties;
  // Until the pages are laid out again for a new text size or page size, the book keeps the text size they were
  // laid out for, and a page never shows a scroll bar for the moment its words do not fit.
  // New pages arrive only for the current layout (a stale one is dropped), so they take its text size in the same render.
  const [shown, setShown] = useState({ pages: measured, key: geometryKey, scale: textSize.scale });
  if (shown.pages !== measured) setShown({ pages: measured, key: geometryKey, scale: textSize.scale });
  const relayout = shown.key !== geometryKey;
  const shownStyle = { ...bookStyle, '--reader-scale': shown.scale } as CSSProperties;
  const bookClass = narrow ? ' reader-book--narrow' : '';
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
  // Reading without the menus: a tap in the middle of the page hides them and brings them back.
  const [immersive, setImmersive] = useState(false);
  const [hint, setHint] = useState(false);
  const toggleImmersive = useCallback(() => {
    setImmersive((value) => {
      if (!value) setHint(true);
      return !value;
    });
  }, []);
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(false), 2600);
    return () => window.clearTimeout(timer);
  }, [hint]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Read the size at once too: a page that is not painting (a background tab) never reports it through the observer.
    const box = stage.getBoundingClientRect();
    setSize((previous) => previous.width > 0 ? previous : { width: box.width, height: box.height });
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Resolve ?chapter= / ?moment= / ?page= once, against pages laid out for the real page size.
  useEffect(() => {
    if (!anchor && ready && pages[safeCurrent]) setAnchor(anchorOf(pages[safeCurrent]));
  }, [anchor, ready, pages, safeCurrent]);

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
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, select, textarea, audio, video, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previous(); }
      if (event.key === 'Home') { event.preventDefault(); turnTo(0); }
      if (event.key === 'End') { event.preventDefault(); turnTo(pages.length - 1); }
      if (event.key === 'Escape' && immersive) { event.preventDefault(); setImmersive(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, previous, pages.length, turnTo, immersive]);

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
    // The middle of the screen shows or hides the menus; the sides turn pages.
    const middle = spread ? x > 0.42 && x < 0.58 : x >= 0.34 && x <= 0.66;
    if (middle) toggleImmersive();
    else if (x > 0.5) next();
    else previous();
  };

  const closed = spread && turned === 0 ? 'is-closed-front' : spread && turned === leaves.length ? 'is-closed-back' : '';
  const visibleKeys = new Set(spread ? [leaves[turned - 1]?.back?.page.key, leaves[turned]?.front.page.key] : [leaves[turned]?.front.page.key]);
  const totalNumbered = pages.length - 2;
  const pageLabel = !ready ? 'Раскладываем страницы…' : safeCurrent === 0 ? 'Обложка' : safeCurrent === pages.length - 1 ? 'Последняя страница' : `Страница ${safeCurrent} из ${totalNumbered}`;

  return <div className={'page page--reader' + (immersive ? ' is-immersive' : '')}>
    {hint ? <p className="reader-hint" role="status">Нажмите в центр страницы, чтобы вернуть меню</p> : null}
    <header className="reader-header">
      <Link className="back-link" to="/book" aria-label="К книге"><ArrowLeft size={20} aria-hidden="true" /> <span className="reader-header__back-label">К книге</span></Link>
      <h1 className="reader-header__title">{bookTitle}</h1>
      {contents ? <label className="reader-jump"><BookOpen size={17} aria-hidden="true" /><span className="visually-hidden">Перейти к главе</span>
        <select value={contents.entries.find((entry) => entry.chapterId === chapterId)?.chapterId ?? ''} onChange={(event) => {
          const entry = contents.entries.find((item) => item.chapterId === event.target.value);
          turnTo(entry ? entry.page : 1);
        }}>
          <option value="">Содержание</option>
          {contents.entries.map((entry) => <option key={entry.chapterId} value={entry.chapterId}>{entry.label}: {entry.title}</option>)}
        </select></label> : null}
      <div className="reader-size" role="group" aria-label={'Размер текста: ' + textSize.label}>
        <button type="button" className="reader-size__button" onClick={() => changeTextSize(-1)} disabled={sizeIndex === 0}
          aria-label="Текст мельче" title={'Текст мельче (сейчас ' + textSize.label + ')'}><span aria-hidden="true">А<small>−</small></span></button>
        <button type="button" className="reader-size__button reader-size__button--large" onClick={() => changeTextSize(1)} disabled={sizeIndex === TEXT_SIZES.length - 1}
          aria-label="Текст крупнее" title={'Текст крупнее (сейчас ' + textSize.label + ')'}><span aria-hidden="true">А<small>+</small></span></button>
      </div>
      <button type="button" className="icon-button reader-header__immersive" onClick={toggleImmersive} aria-label="Скрыть меню для чтения" title="Скрыть меню (или нажмите в центр страницы)">
        <Maximize2 size={18} aria-hidden="true" />
      </button>
    </header>

    <div ref={stageRef} className={'reader-stage ' + (spread ? 'reader-stage--spread' : 'reader-stage--single') + (ready ? ' is-paged' : '')} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
      onPointerCancel={() => { pointer.current = null; }} aria-roledescription="книга" aria-label={bookTitle}>
      {/* Pages are measured here, unseen: the same size, text size and styles as a page of the book. */}
      {known ? <div className={'reader-book reader-measure-host' + bookClass} style={bookStyle} aria-hidden="true" inert>
        <div className="reader-leaf"><div ref={faceRef} className="reader-leaf__face reader-leaf__face--front" /></div>
      </div> : null}
      {ready ? <div className={'reader-book ' + closed + (hasTurned ? ' has-turned' : '') + bookClass + (relayout ? ' is-relayout' : '')} style={shownStyle}>
        {leaves.map((leaf, index) => {
          if (index < turned - 3 || index > turned + 2) return null;
          const isTurned = index < turned;
          // Only the open pages stay drawn once a turn ends: on some phones pages lying
          // on top of each other in 3D show through as stripes.
          const away = spread ? index !== turned - 1 && index !== turned : index !== turned;
          return <div key={leaf.key + (spread ? ':s' : ':p')} className={'reader-leaf' + (isTurned ? ' is-turned' : '') + (away ? ' is-away' : '')}
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
