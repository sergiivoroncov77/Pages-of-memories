import { describe, expect, it } from 'vitest';
import { seedSnapshot } from '../../data/seed';
import { chronologicalMoments } from '../../lib/film/timeline';
import type { MediaAsset, Perspective } from '../../data/types';
import {
  buildLeaves, buildReaderPages, canHaveDropCap, charCountFits, estimatePageBudget, layoutSpread, leavesTurnedFor, logicalForTurned,
  type ReaderPage, type ReaderSource, type StoryPageData
} from './readerPages';

function source(): ReaderSource {
  const snapshot = structuredClone(seedSnapshot);
  const book = snapshot.books[0];
  return {
    book,
    chapters: snapshot.chapters.filter((chapter) => chapter.bookId === book.id).sort((a, b) => a.order - b.order).map((chapter) => ({
      chapter,
      moments: chronologicalMoments(snapshot.moments.filter((moment) => moment.chapterId === chapter.id)).map((moment) => ({
        moment,
        perspectives: snapshot.perspectives.filter((item) => item.momentId === moment.id),
        reflections: snapshot.reflections.filter((item) => item.momentId === moment.id)
      }))
    })),
    assets: new Map(snapshot.mediaAssets.map((asset) => [asset.id, asset])),
    people: new Map(snapshot.people.map((person) => [person.id, person]))
  };
}

const storyPages = (pages: ReaderPage[], momentId: string) => pages.filter((page): page is StoryPageData => page.kind === 'story' && page.momentId === momentId);

/** A one-moment book with the given views; the first is the moment's main story. */
function momentSource(views: { id: string; author: string; content: string; attachmentIds?: string[] }[], assets: MediaAsset[] = []): ReaderSource {
  const base = source();
  const moment = { ...base.chapters[0].moments[0].moment, primaryPerspectiveId: views[0].id };
  const perspectives: Perspective[] = views.map((view, index) => ({
    id: view.id, momentId: moment.id, authorId: view.author, type: 'text', content: view.content, attachmentIds: view.attachmentIds,
    createdAt: '2026-01-01T00:00:00Z', isPrimary: index === 0
  }));
  return {
    book: base.book,
    chapters: [{ chapter: base.chapters[0].chapter, moments: [{ moment, perspectives, reflections: [] }] }],
    assets: new Map(assets.map((asset) => [asset.id, asset])),
    people: new Map(views.map((view) => [view.author, { id: view.author, name: 'Имя ' + view.author } as never]))
  };
}

const photo = (id: string): MediaAsset => ({ id, type: 'photo', url: 'blob:' + id, mimeType: 'image/jpeg', createdAt: '2026-01-01T00:00:00Z' });
const words = (count: number, word = 'слово') => Array.from({ length: count }, () => word).join(' ');

describe('book reader pages', () => {
  it('opens every chapter with the list of its moments and where each begins', () => {
    const pages = buildReaderPages(source());
    const chapters = pages.flatMap((page, index) => page.kind === 'chapter' ? [index] : []);
    chapters.forEach((index) => {
      const chapter = pages[index] as Extract<ReaderPage, { kind: 'chapter' }>;
      const contents = pages[index + 1];
      if (!chapter.momentCount) return;
      expect(contents.kind).toBe('moments');
      if (contents.kind !== 'moments') return;
      expect(contents.chapterId).toBe(chapter.chapterId);
      contents.entries.forEach((entry) => {
        const first = pages[entry.page];
        expect(first.kind).toBe('story');
        expect('momentId' in first && first.momentId).toBe(entry.momentId);
      });
    });
  });

  it('carries a long list of moments over to the next page', () => {
    const base = source();
    const template = base.chapters[0].moments[0];
    const many = Array.from({ length: 11 }, (_, index) => ({ ...template, moment: { ...template.moment, id: 'm' + index, title: 'Момент ' + index } }));
    const pages = buildReaderPages({ ...base, chapters: [{ chapter: base.chapters[0].chapter, moments: many }] });
    const lists = pages.filter((page): page is Extract<ReaderPage, { kind: 'moments' }> => page.kind === 'moments');
    expect(lists.map((page) => page.entries.length)).toEqual([8, 3]);
    expect(lists.map((page) => page.continued)).toEqual([false, true]);
  });

  it('accounts for the shorter title and narrower padding of a landscape phone', () => {
    const compact = estimatePageBudget(560, 240, { compact: true });
    expect(compact.firstPageChars).toBeLessThan(160);
    expect(compact.pageChars).toBeGreaterThan(compact.firstPageChars);
    expect(estimatePageBudget(560, 300, { compact: true }).pageChars)
      .toBeGreaterThan(estimatePageBudget(560, 300).pageChars);
  });

  it('keeps one source paragraph continuous when opening and following pages have different sizes', () => {
    const fixture = source();
    const entry = fixture.chapters[0].moments[0];
    const primary = entry.perspectives.find((perspective) => perspective.type === 'text')!;
    const text = 'Мы вспоминали дорогу домой и долгие летние вечера за семейным столом. '.repeat(10).trim();
    entry.perspectives = [{ ...primary, content: text }];
    const fits = charCountFits({ firstPageChars: 80, pageChars: 360 });
    const pages = storyPages(buildReaderPages(fixture, fits), entry.moment.id);
    const sections = pages.map((page) => page.sections[0]);

    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every((page) => page.sections.length === 1)).toBe(true);
    expect(sections.every((section) => !section.text.includes('\n'))).toBe(true);
    expect(sections.slice(1).every((section) => section.separatorBefore === ' ' && section.startsMidParagraph)).toBe(true);
    expect(sections.map((section) => section.text).join(' ')).toBe(text);
    // Keys are deterministic: the same book is cut into the same pages with the same keys.
    expect(pages.map((page) => page.key)).toEqual(storyPages(buildReaderPages(fixture, fits), entry.moment.id).map((page) => page.key));
    expect(pages.map((page) => page.key).slice(0, 3)).toEqual(['story:' + entry.moment.id, `story:${entry.moment.id}:0`, `story:${entry.moment.id}:1`]);
  });

  it('opens with a cover and contents, gives every chapter an opener and ends with a back cover', () => {
    const pages = buildReaderPages(source());
    expect(pages[0].kind).toBe('cover');
    expect(pages[1].kind).toBe('contents');
    expect(pages[pages.length - 1].kind).toBe('end');
    const contents = pages[1].kind === 'contents' ? pages[1].entries : [];
    expect(contents.map((entry) => entry.title)).toEqual(['Откуда всё начинается', 'Дороги и выборы']);
    contents.forEach((entry) => expect(pages[entry.page]).toMatchObject({ kind: 'chapter', chapterId: entry.chapterId }));

    const summer = pages.filter((page) => 'momentId' in page && page.momentId === 'moment_summer').map((page) => page.kind);
    expect(summer[0]).toBe('story');
    expect(summer).toContain('photo');
    expect(summer[summer.length - 1]).toBe('reflections');
    // Demo audio without a file gets no player page.
    expect(summer).not.toContain('media');
    const opener = pages.find((page) => page.kind === 'story' && page.momentId === 'moment_summer');
    expect(opener).toMatchObject({ continued: false, heading: { title: 'Лето у бабушки в Костромской области', date: '15 июля 1950 г.' } });
    expect(opener?.kind === 'story' && opener.sections[0].dropCap).toBe(true);
  });

  it('puts chapter openers on right-hand pages and the back cover on the last left page', () => {
    const pages = buildReaderPages(source());
    const physical = layoutSpread(pages);
    physical.forEach((item, index) => {
      if (item.page.kind === 'chapter') expect(index % 2).toBe(0);
    });
    expect(physical.length % 2).toBe(0);
    expect(physical[physical.length - 1].page.kind).toBe('end');
    expect(physical.filter((item) => item.page.kind !== 'blank').map((item) => item.page)).toEqual(pages);
  });

  it('maps between pages and turned leaves in both layouts', () => {
    const pages = buildReaderPages(source());
    const single = buildLeaves(pages, false);
    expect(single).toHaveLength(pages.length);
    expect(leavesTurnedFor(single, 3, false)).toBe(3);
    expect(logicalForTurned(single, 3, false)).toBe(3);

    const spread = buildLeaves(pages, true);
    expect(leavesTurnedFor(spread, 0, true)).toBe(0);
    expect(leavesTurnedFor(spread, 1, true)).toBe(1);
    expect(leavesTurnedFor(spread, pages.length - 1, true)).toBe(spread.length);
    pages.forEach((_, logical) => {
      const turned = leavesTurnedFor(spread, logical, true);
      const shown = [spread[turned - 1]?.back?.logical, spread[turned]?.front.logical];
      expect(shown).toContain(logical);
      expect(leavesTurnedFor(spread, logicalForTurned(spread, turned, true), true)).toBe(turned);
    });
  });

  describe('several views on one page', () => {
    const fits = (first: number, rest = first) => charCountFits({ firstPageChars: first, pageChars: rest }, 36);

    it('puts a short view on the page of the story before it, under its own kicker', () => {
      const pages = storyPages(buildReaderPages(momentSource([
        { id: 'a', author: 'p1', content: words(30) }, { id: 'b', author: 'p2', content: words(10) }
      ]), fits(900)), 'moment_summer');
      expect(pages).toHaveLength(1);
      expect(pages[0].key).toBe('story:moment_summer');
      expect(pages[0].sections.map((section) => section.id)).toEqual(['a', 'b']);
      expect(pages[0].sections[1]).toMatchObject({ kicker: 'Имя p2', dropCap: false });
      expect(pages[0].sections[0].dropCap).toBe(true);
    });

    it('starts a new page when a photo page lies between the stories', () => {
      const pages = buildReaderPages(momentSource([
        { id: 'a', author: 'p1', content: words(10), attachmentIds: ['pic'] }, { id: 'b', author: 'p2', content: words(10) }
      ], [photo('pic')]), fits(900))
        .filter((page) => 'momentId' in page && page.momentId === 'moment_summer');
      expect(pages.map((page) => page.kind)).toEqual(['story', 'photo', 'story']);
      expect(pages[2]).toMatchObject({ key: 'voice:b:0', continued: false });
      expect((pages[2] as StoryPageData).sections).toHaveLength(1);
    });

    it('starts a new page when not even three lines of the view fit under the story', () => {
      // The first story takes about 150 of 300; the kicker, the signature and three 36-character lines do not fit in the rest.
      const views = [{ id: 'a', author: 'p1', content: words(25) }, { id: 'b', author: 'p2', content: words(10) }];
      const tight = storyPages(buildReaderPages(momentSource(views), fits(300)), 'moment_summer');
      expect(tight.map((page) => page.key)).toEqual(['story:moment_summer', 'voice:b:0']);
      // The same views with a little more room share the page.
      expect(storyPages(buildReaderPages(momentSource(views), fits(500)), 'moment_summer')).toHaveLength(1);
    });

    it('lets a long view begin under the story and go on over its own pages, signed at the end', () => {
      const pages = storyPages(buildReaderPages(momentSource([
        { id: 'a', author: 'p1', content: words(20) }, { id: 'b', author: 'p2', content: words(200) }
      ]), fits(400)), 'moment_summer');
      expect(pages.length).toBeGreaterThan(2);
      expect(pages[0].sections.map((section) => section.id)).toEqual(['a', 'b']);
      expect(pages[1].key).toBe('voice:b:1');
      expect(pages[1].continued).toBe(true);
      expect(pages[1].sections[0]).toMatchObject({ kicker: undefined, signature: 'Имя p2', startsMidParagraph: true, separatorBefore: ' ' });
      const text = pages.flatMap((page) => page.sections).filter((section) => section.id === 'b').map((section) => section.text).join(' ');
      expect(text).toBe(words(200));
    });
  });

  describe('drop cap', () => {
    it('opens only the main story, and only when it begins with a letter', () => {
      expect(canHaveDropCap('Мы приехали.')).toBe(true);
      expect(canHaveDropCap('**Жирное** начало')).toBe(true);
      expect(canHaveDropCap('1950 год был жарким.')).toBe(false);
      expect(canHaveDropCap('«Помнишь?» — спросил он.')).toBe(false);
      expect(canHaveDropCap('## Заголовок\n\nТекст')).toBe(false);

      const open = (text: string) => storyPages(buildReaderPages(momentSource([{ id: 'a', author: 'p1', content: text }, { id: 'b', author: 'p2', content: 'Другой взгляд.' }]),
        charCountFits({ firstPageChars: 900, pageChars: 900 })), 'moment_summer')[0];
      expect(open('Мы приехали.').sections.map((section) => section.dropCap)).toEqual([true, false]);
      expect(open('1950 год был жарким.').sections.map((section) => section.dropCap)).toEqual([false, false]);
    });

    it('is only on the first page of a story, not on the pages that go on', () => {
      const pages = storyPages(buildReaderPages(momentSource([{ id: 'a', author: 'p1', content: words(200) }]),
        charCountFits({ firstPageChars: 300, pageChars: 300 })), 'moment_summer');
      expect(pages.length).toBeGreaterThan(2);
      expect(pages.map((page) => page.sections[0].dropCap)).toEqual(pages.map((_, index) => index === 0));
    });
  });
});
