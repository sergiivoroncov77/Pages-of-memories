import type { Book, Chapter, MediaAsset, Moment, Person, Perspective, Reflection } from '../../data/types';
import { formatDate, truncate } from '../../lib/format';
import { isAttachedMedia } from '../../lib/film/timeline';
import { chapterLabel, paginateText, toRoman } from '../../lib/film/text';

/** One page of the page-flip reader. Pages are plain data so pagination is testable. */
export type ReaderPage =
  | { kind: 'cover'; key: string; title: string; subtitle: string; coverAssetId?: string }
  | { kind: 'contents'; key: string; entries: { chapterId: string; label: string; title: string; page: number }[] }
  | { kind: 'chapter'; key: string; chapterId: string; numeral: string; label: string; title: string; description: string; momentCount: number }
  | { kind: 'story'; key: string; chapterId: string; momentId: string; text: string; heading?: { title: string; date: string; narrators: string[] };
      voice?: string; dropCap: boolean; continued: boolean }
  | { kind: 'photo'; key: string; chapterId: string; momentId: string; assetId: string; caption: string; author: string }
  | { kind: 'media'; key: string; chapterId: string; momentId: string; assetId: string; mediaType: 'audio' | 'video'; caption: string; author: string }
  | { kind: 'reflections'; key: string; chapterId: string; momentId: string; momentTitle: string; notes: { text: string; author: string }[] }
  | { kind: 'end'; key: string; title: string }
  | { kind: 'blank'; key: string };

export interface ReaderChapterSource {
  chapter: Chapter;
  moments: { moment: Moment; perspectives: Perspective[]; reflections: Reflection[] }[];
}

export interface ReaderSource {
  book: Book;
  chapters: ReaderChapterSource[];
  assets: ReadonlyMap<string, MediaAsset>;
  people: ReadonlyMap<string, Person>;
}

/** How much story text fits on a page; the reader measures its pages and passes a better estimate. */
export interface PageBudget {
  firstPageChars: number;
  pageChars: number;
}

export const DEFAULT_PAGE_BUDGET: PageBudget = { firstPageChars: 430, pageChars: 760 };

/** Estimate the characters of serif body text that fit on a page of the given size (CSS pixels). */
export function estimatePageBudget(pageWidth: number, pageHeight: number): PageBudget {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const fontSize = clamp(pageWidth * 0.036, 15.2, 17.3);
  const paddingX = clamp(pageWidth * 0.085, 18, 46);
  const chrome = clamp(pageWidth * 0.075, 18, 42) + clamp(pageWidth * 0.05, 12, 26) + 64;
  const charsPerLine = (pageWidth - paddingX * 2) / (fontSize * 0.5);
  const lineHeight = fontSize * 1.68;
  const lines = (pageHeight - chrome) / lineHeight - 1.5;
  const headingLines = 150 / lineHeight;
  const round = (value: number) => Math.max(160, Math.floor(value / 40) * 40);
  return { firstPageChars: round(charsPerLine * (lines - headingLines) * 0.9), pageChars: round(charsPerLine * lines * 0.9) };
}

export function pageChapterId(page: ReaderPage): string | undefined {
  return 'chapterId' in page ? page.chapterId : undefined;
}

export interface PageAnchor {
  key: string;
  momentId?: string;
  chapterId?: string;
}

export function anchorOf(page: ReaderPage): PageAnchor {
  return { key: page.key, momentId: 'momentId' in page ? page.momentId : undefined, chapterId: pageChapterId(page) };
}

/** Find a page again after re-pagination: the same page, else the start of its moment, else its chapter. */
export function findPage(pages: ReaderPage[], anchor: PageAnchor): number {
  const exact = pages.findIndex((page) => page.key === anchor.key);
  if (exact >= 0) return exact;
  const moment = anchor.momentId ? pages.findIndex((page) => 'momentId' in page && page.momentId === anchor.momentId) : -1;
  if (moment >= 0) return moment;
  const chapter = anchor.chapterId ? pages.findIndex((page) => page.kind === 'chapter' && page.chapterId === anchor.chapterId) : -1;
  return Math.max(0, chapter);
}

export function buildReaderPages(source: ReaderSource, { firstPageChars, pageChars }: PageBudget = DEFAULT_PAGE_BUDGET): ReaderPage[] {
  const pages: ReaderPage[] = [];
  const name = (id?: string) => (id && source.people.get(id)?.name) || 'Без указания автора';
  pages.push({ kind: 'cover', key: 'cover', title: source.book.title, subtitle: source.book.subtitle, coverAssetId: source.book.coverMediaAssetId });
  const contents: Extract<ReaderPage, { kind: 'contents' }> = { kind: 'contents', key: 'contents', entries: [] };
  pages.push(contents);

  source.chapters.forEach(({ chapter, moments }) => {
    contents.entries.push({ chapterId: chapter.id, label: chapterLabel(chapter.order), title: chapter.title, page: pages.length });
    pages.push({
      kind: 'chapter', key: 'chapter:' + chapter.id, chapterId: chapter.id, numeral: toRoman(chapter.order), label: chapterLabel(chapter.order),
      title: chapter.title, description: chapter.description, momentCount: moments.length
    });
    moments.forEach(({ moment, perspectives, reflections }) => {
      const base = { chapterId: chapter.id, momentId: moment.id };
      const primary = perspectives.find((item) => item.id === moment.primaryPerspectiveId && item.type === 'text' && item.content.trim())
        ?? perspectives.find((item) => item.type === 'text' && item.content.trim());
      const heading = {
        title: moment.title,
        date: moment.occurredAt ? formatDate(moment.occurredAt) : '',
        narrators: [...new Set(perspectives.map((item) => item.authorId).filter((id): id is string => Boolean(id)).map(name))]
      };
      const opening = primary?.content ?? moment.summary;
      const [first = '', ...restText] = opening.trim() ? paginateText(opening, firstPageChars) : [''];
      pages.push({ kind: 'story', key: 'story:' + moment.id, ...base, heading, text: first, dropCap: Boolean(first), continued: false,
        voice: primary && restText.length === 0 && perspectives.filter((item) => item.type === 'text').length > 1 ? name(primary.authorId) : undefined });
      paginateText(restText.join('\n'), pageChars).forEach((text, index, all) => pages.push({
        kind: 'story', key: `story:${moment.id}:${index}`, ...base, text, dropCap: false, continued: true,
        voice: primary && index === all.length - 1 && perspectives.filter((item) => item.type === 'text').length > 1 ? name(primary.authorId) : undefined
      }));

      perspectives.forEach((perspective) => {
        const asset = perspective.mediaAssetId ? source.assets.get(perspective.mediaAssetId) : undefined;
        const author = name(perspective.authorId);
        if (perspective.type === 'text' && perspective.id !== primary?.id && perspective.content.trim()) {
          paginateText(perspective.content, pageChars).forEach((text, index) => pages.push({
            kind: 'story', key: `voice:${perspective.id}:${index}`, ...base, text, dropCap: index === 0, continued: index > 0,
            voice: author
          }));
        }
        if (asset?.type === 'photo' && (perspective.type === 'photo' || perspective.type === 'text')) {
          pages.push({ kind: 'photo', key: 'photo:' + perspective.id, ...base, assetId: asset.id, caption: perspective.caption || perspective.content || asset.alt || '', author });
        }
        if ((perspective.type === 'audio' || perspective.type === 'video') && isAttachedMedia(asset) && asset.type === perspective.type) {
          pages.push({ kind: 'media', key: 'media:' + perspective.id, ...base, assetId: asset.id, mediaType: perspective.type,
            caption: perspective.caption || perspective.content || (perspective.type === 'audio' ? 'Голосовая запись' : 'Видео'), author });
        }
      });

      for (let index = 0; index < reflections.length; index += 3) {
        pages.push({
          kind: 'reflections', key: `reflections:${moment.id}:${index}`, ...base, momentTitle: moment.title,
          notes: reflections.slice(index, index + 3).map((reflection) => ({ text: truncate(reflection.text, 320), author: name(reflection.authorId) }))
        });
      }
    });
  });
  pages.push({ kind: 'end', key: 'end', title: source.book.title });
  return pages;
}

export interface PhysicalPage {
  page: ReaderPage;
  /** Index in the logical page list; blanks borrow the next page's index. */
  logical: number;
}

/**
 * For a two-page spread, chapters open on a right-hand page and the back
 * cover lands on the back of the last leaf, as in a printed book.
 */
export function layoutSpread(pages: ReaderPage[]): PhysicalPage[] {
  const physical: PhysicalPage[] = [];
  pages.forEach((page, logical) => {
    const rightSide = physical.length % 2 === 0;
    if ((page.kind === 'chapter' && !rightSide) || (page.kind === 'end' && rightSide)) {
      physical.push({ page: { kind: 'blank', key: 'blank:' + page.key }, logical });
    }
    physical.push({ page, logical });
  });
  return physical;
}

export interface Leaf {
  key: string;
  front: PhysicalPage;
  back: PhysicalPage | null;
}

export function buildLeaves(pages: ReaderPage[], spread: boolean): Leaf[] {
  if (!spread) return pages.map((page, logical) => ({ key: page.key, front: { page, logical }, back: null }));
  const physical = layoutSpread(pages);
  const leaves: Leaf[] = [];
  for (let index = 0; index < physical.length; index += 2) {
    leaves.push({ key: physical[index].page.key, front: physical[index], back: physical[index + 1] ?? null });
  }
  return leaves;
}

/** How many leaves are turned when `logical` is on screen (a back face is a left page, so its leaf is turned). */
export function leavesTurnedFor(leaves: Leaf[], logical: number, spread: boolean): number {
  if (!spread) return Math.min(Math.max(0, logical), leaves.length - 1);
  for (let index = 0; index < leaves.length; index += 1) {
    const { front, back } = leaves[index];
    if (front.logical === logical && front.page.kind !== 'blank') return index;
    if (back && back.logical === logical && back.page.kind !== 'blank') return index + 1;
  }
  return 0;
}

/** The logical page a reader is on after turning to `turned` leaves. */
export function logicalForTurned(leaves: Leaf[], turned: number, spread: boolean): number {
  if (!spread) return leaves[Math.min(Math.max(0, turned), leaves.length - 1)].front.logical;
  const left = turned > 0 ? leaves[turned - 1]?.back : null;
  if (left && left.page.kind !== 'blank') return left.logical;
  const right = leaves[turned]?.front;
  if (right) return right.logical;
  return leaves[leaves.length - 1].back?.logical ?? leaves[leaves.length - 1].front.logical;
}
