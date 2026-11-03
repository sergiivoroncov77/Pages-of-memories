import { describe, expect, it } from 'vitest';
import { seedSnapshot } from '../../data/seed';
import { chronologicalMoments } from '../../lib/film/timeline';
import { buildLeaves, buildReaderPages, estimatePageBudget, layoutSpread, leavesTurnedFor, logicalForTurned, type ReaderSource } from './readerPages';

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

describe('book reader pages', () => {
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
    const pages = buildReaderPages(fixture, { firstPageChars: 80, pageChars: 360 })
      .filter((page) => page.kind === 'story' && page.momentId === entry.moment.id);

    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every((page) => page.kind === 'story' && !page.text.includes('\n'))).toBe(true);
    expect(pages.map((page) => page.kind === 'story' ? page.text : '').join(' ')).toBe(text);
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
    expect(opener).toMatchObject({ dropCap: true, heading: { title: 'Лето у бабушки в Костромской области', date: '15 июля 1950 г.' } });
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
});
