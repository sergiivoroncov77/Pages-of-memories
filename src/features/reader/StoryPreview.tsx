import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { storyType } from '../../data/mutations';
import type { Book, Chapter, MediaAsset, Moment, Person, Perspective } from '../../data/types';
import { PageView } from './BookReaderPage';
import { buildReaderPages, estimatePageBudget, type ReaderPage } from './readerPages';

const DRAFT_ID = 'preview-draft';
const DRAFT_AUTHOR = 'preview-author';
const PAGE_RATIO = 0.7;

export interface StoryPreviewProps {
  book: Book;
  chapter: Chapter;
  moment: Moment;
  /** The moment's other stories, as they are in the book. */
  others: Perspective[];
  people: Person[];
  /** The story being written: its words and its files (stored and just chosen). */
  content: string;
  files: MediaAsset[];
  authorName?: string;
  /** The story is the moment's main one (or will be). */
  primary: boolean;
}

/**
 * The pages this story will take in the book, drawn by the reader itself: same
 * paper, fonts, drop cap, photo prints and voice player. Page breaks follow the
 * size of this preview; on another screen they may fall a little differently.
 */
export function StoryPreview({ book, chapter, moment, others, people, content, files, authorName, primary }: StoryPreviewProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(380);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.min(460, Math.floor(entry.contentRect.width)))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pageHeight = Math.round(width / PAGE_RATIO);
  const budget = estimatePageBudget(width, pageHeight);
  const pages = useMemo<ReaderPage[]>(() => {
    const draft: Perspective = {
      id: DRAFT_ID, momentId: moment.id, authorId: DRAFT_AUTHOR, type: storyType(content, files), content: content.trim(),
      attachmentIds: files.map((file) => file.id), createdAt: new Date().toISOString(), isPrimary: primary
    };
    const draftMoment = primary ? { ...moment, primaryPerspectiveId: DRAFT_ID } : moment;
    const all = buildReaderPages({
      book,
      chapters: [{ chapter, moments: [{ moment: draftMoment, perspectives: [...(primary ? [draft] : []), ...others, ...(primary ? [] : [draft])], reflections: [] }] }],
      assets: new Map(files.map((file) => [file.id, file])),
      people: new Map([...people.map((person) => [person.id, person] as const), [DRAFT_AUTHOR, { id: DRAFT_AUTHOR, name: authorName || 'Без указания автора' } as Person]])
    }, budget);
    const ownPage = (page: ReaderPage) => page.key.includes(DRAFT_ID);
    const opening = (page: ReaderPage) => page.kind === 'story' && page.key.startsWith('story:' + moment.id);
    // The opening pages are the draft's when it is the main story; otherwise only its own pages.
    return all.filter((page) => ownPage(page) || (primary && opening(page)));
  }, [book, chapter, moment, others, people, content, files, authorName, primary, budget.firstPageChars, budget.pageChars]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = Math.min(index, Math.max(0, pages.length - 1));
  const chapterTitles = useMemo(() => new Map([[chapter.id, chapter.title]]), [chapter]);
  const assets = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);

  return <div className="story-preview" ref={frame}>
    {pages.length ? <>
      <div className="story-preview__page" style={{ '--page-w': width + 'px', '--page-h': pageHeight + 'px', width, height: pageHeight } as CSSProperties}>
        <PageView page={pages[current]} number={current + 3} total={pages.length + 10} assets={assets} chapterTitles={chapterTitles} onJump={() => undefined} />
      </div>
      {pages.length > 1 ? <div className="story-preview__nav">
        <button type="button" className="icon-button" onClick={() => setIndex(current - 1)} disabled={current === 0} aria-label="Предыдущая страница предпросмотра"><ChevronLeft size={20} /></button>
        <span>Страница {current + 1} из {pages.length}</span>
        <button type="button" className="icon-button" onClick={() => setIndex(current + 1)} disabled={current >= pages.length - 1} aria-label="Следующая страница предпросмотра"><ChevronRight size={20} /></button>
      </div> : null}
    </> : <p className="story-editor__empty">Начните рассказ — здесь появится страница книги.</p>}
  </div>;
}
