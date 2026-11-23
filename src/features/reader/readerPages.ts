import type { Book, Chapter, MediaAsset, Moment, Person, Perspective, Reflection } from '../../data/types';
import { formatDate, truncate } from '../../lib/format';
import { isAttachedMedia } from '../../lib/film/timeline';
import { chapterLabel, toRoman } from '../../lib/film/text';
import { parseStory } from '../../lib/storyMarkup';
import { paginateStoryPages, type PaginationHint, type StoryTextPage } from './readerPagination';
import { mediaCaption, perspectiveAssets } from '../../data/mediaRefs';

/** One story (or one view of a moment) on a story page: a page may hold several. */
export interface StorySection {
  /** The perspective the words belong to (the moment's id when it is its summary). */
  id: string;
  text: string;
  /** The first line continues an author's line from the preceding page. */
  startsMidParagraph: boolean;
  separatorBefore: '' | ' ' | '\n' | '\n\n';
  /** The section opens with its own kicker, «Взгляд · name». */
  kicker?: string;
  /** Recordings told with these words: small players open the section, before its text. */
  audioIds?: string[];
  /** The words written under those recordings, by id. */
  audioCaptions?: Record<string, string>;
  /** A signature closes the section: its author's name. */
  signature?: string;
  /** A drop cap opens the primary story, when it starts with a letter. */
  dropCap: boolean;
  /** Only while measuring whether a section would fit: this many blank lines of text. */
  reserveLines?: number;
}

/** One page of the page-flip reader. Pages are plain data so pagination is testable. */
export type ReaderPage =
  | { kind: 'cover'; key: string; title: string; subtitle: string; coverAssetId?: string }
  | { kind: 'contents'; key: string; entries: { chapterId: string; label: string; title: string; page: number }[] }
  | { kind: 'chapter'; key: string; chapterId: string; numeral: string; label: string; title: string; description: string; momentCount: number }
  /** The chapter's own contents, after its opener: its moments and where they begin. */
  | { kind: 'moments'; key: string; chapterId: string; label: string; title: string; continued: boolean; entries: { momentId: string; title: string; date: string; page: number }[] }
  | { kind: 'story'; key: string; chapterId: string; momentId: string; heading?: { title: string; date: string; narrators: string[] };
      /** The page goes on with a story that began on an earlier page. */
      continued: boolean; sections: StorySection[] }
  | { kind: 'photo'; key: string; chapterId: string; momentId: string; assetId: string; caption: string; author: string }
  | { kind: 'media'; key: string; chapterId: string; momentId: string; assetId: string; mediaType: 'audio' | 'video'; caption: string; author: string }
  | { kind: 'reflections'; key: string; chapterId: string; momentId: string; momentTitle: string; notes: { text: string; author: string; voiceId?: string }[] }
  | { kind: 'end'; key: string; title: string }
  | { kind: 'blank'; key: string };

export type StoryPageData = Extract<ReaderPage, { kind: 'story' }>;

/** "This candidate story page fits its page body with no vertical overflow." */
export type PageFits = (candidate: StoryPageData) => boolean;

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

/** A rough guess of how much story text fits on a page; the reader measures real pages and only uses it as a first guess. */
export interface PageBudget {
  firstPageChars: number;
  pageChars: number;
}

export const DEFAULT_PAGE_BUDGET: PageBudget = { firstPageChars: 430, pageChars: 760 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The size of story text in the reader, as in the stylesheet: a share of the page width between 17px and 21px, times the reader's text size. */
export function storyFontSize(pageWidth: number, scale = 1, compact = false): number {
  // A phone on its side has a wide, low page: there the text keeps its smallest size.
  return (compact ? 17 : clamp(pageWidth * 0.045, 17, 21)) * scale;
}

function pagePaddingX(pageWidth: number, compact: boolean): number {
  return compact ? 24 : clamp(pageWidth * 0.085, 18, 46);
}

/** About how many characters make a line of story text. */
export function estimateLineChars(pageWidth: number, { compact = false, scale = 1 } = {}): number {
  return Math.max(12, Math.floor((pageWidth - pagePaddingX(pageWidth, compact) * 2) / (storyFontSize(pageWidth, scale, compact) * 0.5)));
}

/** Estimate the characters of serif body text that fit on a page of the given size (CSS pixels). */
export function estimatePageBudget(pageWidth: number, pageHeight: number, { compact = false, scale = 1 } = {}): PageBudget {
  const fontSize = storyFontSize(pageWidth, scale, compact);
  // The landscape reader uses narrower padding and a smaller title so the
  // estimate matches its actual text area rather than a tall portrait page.
  const chrome = compact ? 60 : clamp(pageWidth * 0.075, 18, 42) + clamp(pageWidth * 0.05, 12, 26) + 64;
  const charsPerLine = estimateLineChars(pageWidth, { compact, scale });
  const lineHeight = fontSize * 1.6;
  const lines = (pageHeight - chrome) / lineHeight - 1.5;
  const headingLines = (compact ? 100 : 150) / lineHeight;
  const round = (value: number, minimum: number) => Math.max(minimum, Math.floor(value / 40) * 40);
  return {
    firstPageChars: round(charsPerLine * (lines - headingLines) * 0.9, compact ? 60 : 160),
    pageChars: round(charsPerLine * lines * 0.9, compact ? 100 : 160)
  };
}

/**
 * A stand-in for measuring, for tests and for callers without a screen: counts
 * characters. Players, kickers, signatures and reserved lines take some room.
 */
export function charCountFits(budget: PageBudget = DEFAULT_PAGE_BUDGET, lineChars = 36): PageFits {
  return (page) => {
    const used = page.sections.reduce((total, section, index) => total + section.text.length
      + (section.audioIds?.length ?? 0) * 120 + (section.reserveLines ?? 0) * lineChars
      + (section.kicker ? 60 : 0) + (section.signature ? 40 : 0) + (index > 0 ? 40 : 0), 0);
    return used <= (page.heading ? budget.firstPageChars : budget.pageChars);
  };
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

/** How many moments a page of a chapter's contents lists. */
export const MOMENTS_PER_PAGE = 8;

/** A view with words continues the page before it only when at least this many lines of its text fit there. */
export const MERGE_MIN_LINES = 3;

export interface BuildOptions {
  /** About how many characters a full page holds, to start from; learned while paginating. */
  hint?: PaginationHint;
  /** About how many characters make a line. */
  lineChars?: number;
}

/** A drop cap only opens a paragraph that begins with a letter, not a digit or a quotation mark. */
export function canHaveDropCap(text: string): boolean {
  const first = parseStory(text)[0];
  return first?.kind === 'paragraph' && /^\p{L}/u.test(first.lines[0]?.[0]?.text ?? '');
}

/**
 * Build the book's pages. Story text is cut by `fits`, which says whether a
 * candidate story page fits; the generator yields after each page and moment so
 * a caller measuring in the browser can give the screen a moment in between.
 */
export function* paginateBook(source: ReaderSource, fits: PageFits, options: BuildOptions = {}): Generator<void, ReaderPage[]> {
  const pages: ReaderPage[] = [];
  const name = (id?: string) => (id && source.people.get(id)?.name) || 'Без указания автора';
  const hint = options.hint ?? { chars: DEFAULT_PAGE_BUDGET.pageChars };
  const paginate = { hint, lineChars: options.lineChars };
  pages.push({ kind: 'cover', key: 'cover', title: source.book.title, subtitle: source.book.subtitle, coverAssetId: source.book.coverMediaAssetId });
  const contents: Extract<ReaderPage, { kind: 'contents' }> = { kind: 'contents', key: 'contents', entries: [] };
  pages.push(contents);

  for (const { chapter, moments } of source.chapters) {
    contents.entries.push({ chapterId: chapter.id, label: chapterLabel(chapter.order), title: chapter.title, page: pages.length });
    pages.push({
      kind: 'chapter', key: 'chapter:' + chapter.id, chapterId: chapter.id, numeral: toRoman(chapter.order), label: chapterLabel(chapter.order),
      title: chapter.title, description: chapter.description, momentCount: moments.length
    });
    // Right after the opener, the chapter's moments, a few to a page.
    const momentContents: Extract<ReaderPage, { kind: 'moments' }>[] = [];
    for (let index = 0; index < moments.length; index += MOMENTS_PER_PAGE) {
      const page: Extract<ReaderPage, { kind: 'moments' }> = { kind: 'moments', key: `moments:${chapter.id}:${index / MOMENTS_PER_PAGE}`,
        chapterId: chapter.id, label: chapterLabel(chapter.order), title: chapter.title, continued: index > 0, entries: [] };
      momentContents.push(page);
      pages.push(page);
    }
    for (const { moment, perspectives, reflections } of moments) {
      const base = { chapterId: chapter.id, momentId: moment.id };
      // Any story with words opens the moment, whether it was written or told aloud with a few words.
      const told = (item: Perspective) => Boolean(item.content.trim()) && item.type !== 'photo' && item.type !== 'video';
      const primary = perspectives.find((item) => item.id === moment.primaryPerspectiveId && told(item))
        ?? perspectives.find((item) => item.type === 'text' && item.content.trim()) ?? perspectives.find(told);
      const filesOf = (item: Perspective) => perspectiveAssets(item, source.assets);
      const voicesOf = (item: Perspective) => filesOf(item).filter((asset) => asset.type === 'audio' && isAttachedMedia(asset)).map((asset) => asset.id);
      const voiceCaptions = (item: Perspective) => Object.fromEntries(filesOf(item).filter((asset) => asset.type === 'audio')
        .map((asset) => [asset.id, mediaCaption(asset, item.content)]).filter(([, caption]) => caption));
      const wordsCount = perspectives.filter(told).length;
      const heading = {
        title: moment.title,
        date: moment.occurredAt ? formatDate(moment.occurredAt) : '',
        narrators: [...new Set(perspectives.map((item) => item.authorId).filter((id): id is string => Boolean(id)).map(name))]
      };
      momentContents[Math.floor(momentContents.flatMap((page) => page.entries).length / MOMENTS_PER_PAGE)]
        ?.entries.push({ momentId: moment.id, title: moment.title, date: heading.date, page: pages.length });
      const storyPage = (key: string, sections: StorySection[], continued: boolean, withHeading = false): StoryPageData =>
        ({ kind: 'story', key, ...base, heading: withHeading ? heading : undefined, continued, sections });

      // The moment opens with its primary story (or its summary), under the heading.
      const opening = primary?.content ?? moment.summary;
      const openingId = primary?.id ?? moment.id;
      const players = primary ? voicesOf(primary) : [];
      const signed = primary && wordsCount > 1 ? name(primary.authorId) : undefined;
      const openingSection = (part: StoryTextPage, index: number, last: boolean): StorySection => ({
        // The drop cap opens the words wherever they begin: on the heading page, or on the next one when none fit there.
        id: openingId, ...part, dropCap: part.separatorBefore === '' && !part.startsMidParagraph && canHaveDropCap(part.text),
        audioIds: index === 0 && players.length ? players : undefined, audioCaptions: index === 0 && primary ? voiceCaptions(primary) : undefined,
        signature: last ? signed : undefined
      });
      const openingPage = (index: number, section: StorySection) =>
        storyPage(index === 0 ? 'story:' + moment.id : `story:${moment.id}:${index - 1}`, [section], index > 0, index === 0);
      const written = yield* paginateStoryPages(opening, (part, index, last) => fits(openingPage(index, openingSection(part, index, last))), { ...paginate, emptyFirstPage: true });
      const parts = written.length ? written : [{ text: '', startsMidParagraph: false, separatorBefore: '' as const }];
      parts.forEach((part, index) => pages.push(openingPage(index, openingSection(part, index, index === parts.length - 1))));

      for (const perspective of perspectives) {
        const author = name(perspective.authorId);
        const files = filesOf(perspective);
        // An older story's own file keeps the page key it always had.
        const keyOf = (asset: MediaAsset) => asset.id === perspective.mediaAssetId ? perspective.id : perspective.id + ':' + asset.id;
        const withWords = told(perspective);
        const voices = voicesOf(perspective);
        if (withWords && perspective.id !== primary?.id) {
          const sectionOf = (part: StoryTextPage, index: number): StorySection => ({
            id: perspective.id, ...part, dropCap: false, kicker: index === 0 ? author : undefined,
            signature: index > 0 ? author : undefined, audioIds: index === 0 && voices.length ? voices : undefined,
            audioCaptions: index === 0 ? voiceCaptions(perspective) : undefined
          });
          const ownPage = (index: number, part: StoryTextPage) => storyPage(`voice:${perspective.id}:${index}`, [sectionOf(part, index)], index > 0);
          // A short view goes on the page before it when that page is the one just before and has room for it.
          const previous = pages[pages.length - 1];
          let parts: StoryTextPage[] | undefined;
          let joined: ((part: StoryTextPage) => StoryPageData) | undefined;
          if (previous?.kind === 'story' && previous.momentId === moment.id) {
            const onto = (section: StorySection): StoryPageData => ({ ...previous, sections: [...previous.sections, section] });
            const room = fits(onto({ ...sectionOf({ text: '', startsMidParagraph: false, separatorBefore: '' }, 0), reserveLines: MERGE_MIN_LINES }));
            if (room) {
              const attempt = yield* paginateStoryPages(perspective.content,
                (part, index) => index === 0 ? fits(onto(sectionOf(part, 0))) : fits(ownPage(index, part)), paginate);
              if (attempt.length && fits(onto(sectionOf(attempt[0], 0)))) {
                parts = attempt;
                joined = (part) => onto(sectionOf(part, 0));
              }
            }
          }
          parts ??= yield* paginateStoryPages(perspective.content, (part, index) => fits(ownPage(index, part)), paginate);
          parts.forEach((part, index) => {
            if (index === 0 && joined) pages[pages.length - 1] = joined(part);
            else pages.push(ownPage(index, part));
          });
        }
        files.forEach((asset) => {
          const own = asset.id === perspective.mediaAssetId;
          // A photo or video story's words are its caption; files next to a story carry their own.
          const describes = own || perspective.type === 'photo' || perspective.type === 'video';
          // A caption written under the file itself comes first.
          const caption = mediaCaption(asset, perspective.content) || (describes ? perspective.caption || perspective.content || '' : perspective.caption || '');
          if (asset.type === 'photo' && (!own || perspective.type === 'photo' || perspective.type === 'text')) {
            pages.push({ kind: 'photo', key: 'photo:' + keyOf(asset), ...base, assetId: asset.id, caption, author });
          }
          if (asset.type === 'video' && isAttachedMedia(asset) && (!own || perspective.type === 'video')) {
            pages.push({ kind: 'media', key: 'media:' + keyOf(asset), ...base, assetId: asset.id, mediaType: 'video', caption: caption || 'Видео', author });
          }
          // A voice without words gets a quiet page of its own; with words it plays under the text.
          if (asset.type === 'audio' && !withWords && isAttachedMedia(asset) && (!own || perspective.type === 'audio')) {
            pages.push({ kind: 'media', key: 'media:' + keyOf(asset), ...base, assetId: asset.id, mediaType: 'audio', caption: caption || 'Рассказ голосом', author });
          }
        });
      }

      for (let index = 0; index < reflections.length; index += 3) {
        pages.push({
          kind: 'reflections', key: `reflections:${moment.id}:${index}`, ...base, momentTitle: moment.title,
          notes: reflections.slice(index, index + 3).map((reflection) => ({ text: truncate(reflection.text, 320), author: name(reflection.authorId),
            voiceId: reflection.mediaAssetId && isAttachedMedia(source.assets.get(reflection.mediaAssetId)) ? reflection.mediaAssetId : undefined }))
        });
      }
      yield;
    }
  }
  pages.push({ kind: 'end', key: 'end', title: source.book.title });
  return pages;
}

/** The book's pages at once: for tests and for callers that can wait. */
export function buildReaderPages(source: ReaderSource, fits: PageFits = charCountFits(), options?: BuildOptions): ReaderPage[] {
  const steps = paginateBook(source, fits, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
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
