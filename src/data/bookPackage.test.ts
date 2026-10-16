import { describe, expect, it } from 'vitest';
import { BOOK_PACKAGE_KIND, bookPackageFileName, bookPackageToHtml, buildBookPackage, mergeBookPackage, parseBookPackage } from './bookPackage';
import { createBookInSnapshot, createChapterInSnapshot, emptySnapshot } from './library';
import { addMomentToSnapshot, addReflectionToSnapshot, createMoment, createReflection, ensureMemoryMoments } from './mutations';
import { seedSnapshot } from './seed';
import type { AppSnapshot } from './types';

const demo = () => ensureMemoryMoments(structuredClone(seedSnapshot));
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

/** A device with one book that has a chapter, a moment, a photo story and a comment. */
function ownerDevice(): { snapshot: AppSnapshot; bookId: string } {
  const created = createBookInSnapshot(emptySnapshot(seedSnapshot.settings, 'Семья'), { title: 'Книга мамы' }, 'Детство');
  let snapshot = created.snapshot;
  snapshot = { ...snapshot, people: [{ ...seedSnapshot.people[0], projectId: snapshot.project.id }] };
  const chapter = snapshot.chapters[0];
  const moment = createMoment({ bookId: created.book.id, chapterId: chapter.id, title: 'Первый снег' }, 'moment_snow');
  snapshot = addMomentToSnapshot(snapshot, moment);
  snapshot = {
    ...snapshot,
    mediaAssets: [{ id: 'media_snow', type: 'photo', url: PNG, mimeType: 'image/png', createdAt: moment.createdAt }],
    perspectives: [{ id: 'perspective_snow', momentId: moment.id, authorId: seedSnapshot.people[0].id, type: 'photo', content: 'Снег', mediaAssetId: 'media_snow', createdAt: moment.createdAt, isPrimary: true }]
  };
  snapshot = addReflectionToSnapshot(snapshot, createReflection({ momentId: moment.id, text: 'Помню этот день!', authorId: seedSnapshot.people[0].id }));
  return { snapshot, bookId: created.book.id };
}

describe('book package', () => {
  it('packs one book with its authors and media, without interview links', () => {
    const pkg = buildBookPackage(demo(), 'book_family_demo');
    expect(pkg.kind).toBe(BOOK_PACKAGE_KIND);
    expect(pkg.chapters.every((chapter) => chapter.bookId === 'book_family_demo')).toBe(true);
    expect(pkg.moments.length).toBeGreaterThan(0);
    expect(pkg.moments.some((moment) => 'sourceMemoryId' in moment)).toBe(false);
    expect(pkg.perspectives.some((item) => 'sourceMemoryId' in item)).toBe(false);
    const authors = new Set(pkg.perspectives.map((item) => item.authorId).filter(Boolean));
    expect(pkg.people.map((person) => person.id).sort()).toEqual([...authors].sort());
    expect(() => buildBookPackage(demo(), 'book_missing')).toThrow();
  });

  it('round-trips into an empty device as a new book with signatures and comments', () => {
    const { snapshot, bookId } = ownerDevice();
    const json = JSON.stringify(buildBookPackage(snapshot, bookId));
    const recipient = emptySnapshot(seedSnapshot.settings, 'Моя семья');
    const { snapshot: merged, summary } = mergeBookPackage(recipient, parseBookPackage(json), new Map([['media_snow', 'idb:media_snow']]));
    expect(summary).toMatchObject({ bookTitle: 'Книга мамы', isNewBook: true, added: { chapters: 1, moments: 1, perspectives: 1, reflections: 1, people: 1 } });
    expect(merged.books[0].projectId).toBe(recipient.project.id);
    expect(merged.people[0].projectId).toBe(recipient.project.id);
    expect(merged.settings.activeBookId).toBe(bookId);
    expect(merged.mediaAssets[0].url).toBe('idb:media_snow');
    expect(merged.perspectives[0]).toMatchObject({ authorId: seedSnapshot.people[0].id, mediaAssetId: 'media_snow' });
  });

  it('merges a returned copy: adds what the relative wrote and keeps the newer edits', () => {
    const { snapshot: owner, bookId } = ownerDevice();
    const first = mergeBookPackage(emptySnapshot(seedSnapshot.settings), parseBookPackage(JSON.stringify(buildBookPackage(owner, bookId)))).snapshot;
    // The relative adds a comment and a chapter, then sends the book back.
    let relative = addReflectionToSnapshot(first, createReflection({ momentId: 'moment_snow', text: 'А я помню санки.' }));
    relative = createChapterInSnapshot(relative, bookId, { title: 'Юность' }).snapshot;
    const later = new Date(Date.now() + 60_000).toISOString();
    relative = { ...relative, moments: relative.moments.map((moment) => ({ ...moment, title: 'Первый снег во дворе', updatedAt: later })) };
    const back = mergeBookPackage(owner, parseBookPackage(JSON.stringify(buildBookPackage(relative, bookId))));
    expect(back.summary).toMatchObject({ isNewBook: false, added: { chapters: 1, reflections: 1, moments: 0, perspectives: 0 } });
    expect(back.summary.updated).toBeGreaterThanOrEqual(1);
    expect(back.snapshot.moments.find((moment) => moment.id === 'moment_snow')?.title).toBe('Первый снег во дворе');
    expect(back.snapshot.reflections.map((item) => item.text).sort()).toEqual(['А я помню санки.', 'Помню этот день!']);
    // Importing the same file twice changes nothing.
    const again = mergeBookPackage(back.snapshot, parseBookPackage(JSON.stringify(buildBookPackage(relative, bookId))));
    expect(again.summary).toMatchObject({ added: { chapters: 0, moments: 0, perspectives: 0, reflections: 0, people: 0 }, updated: 0 });
  });

  it('keeps the interview link of a moment on the device that recorded it', () => {
    const owner = demo();
    const interview = owner.moments.find((moment) => moment.sourceMemoryId)!;
    const later = new Date(Date.now() + 60_000).toISOString();
    const pkg = buildBookPackage(owner, 'book_family_demo');
    pkg.moments = pkg.moments.map((moment) => moment.id === interview.id ? { ...moment, title: 'Новое название', updatedAt: later } : moment);
    const { snapshot } = mergeBookPackage(owner, parseBookPackage(JSON.stringify(pkg)));
    expect(snapshot.moments.find((moment) => moment.id === interview.id)).toMatchObject({ title: 'Новое название', sourceMemoryId: interview.sourceMemoryId });
  });

  it('rejects other files and broken packages', () => {
    expect(() => parseBookPackage('not json')).toThrow('В файле нет книги');
    expect(() => parseBookPackage('{"kind": broken')).toThrow('Не удалось прочитать');
    expect(() => parseBookPackage(JSON.stringify(seedSnapshot))).toThrow('Это не файл книги');
    const { snapshot, bookId } = ownerDevice();
    const pkg = buildBookPackage(snapshot, bookId);
    expect(() => parseBookPackage(JSON.stringify({ ...pkg, version: 2 }))).toThrow('более новой версии');
    expect(() => parseBookPackage(JSON.stringify({ ...pkg, moments: pkg.moments.map((moment) => ({ ...moment, chapterId: 'chapter_x' })) }))).toThrow('момента с главой');
    expect(() => parseBookPackage(JSON.stringify({ ...pkg, mediaAssets: pkg.mediaAssets.map((asset) => ({ ...asset, url: 'idb:' + asset.id })) }))).toThrow('неподдерживаемый');
    expect(() => parseBookPackage(JSON.stringify({ ...pkg, mediaAssets: pkg.mediaAssets.map((asset) => ({ ...asset, url: 'https://example.com/a.png' })) }))).toThrow('неподдерживаемый');
  });

  it('travels as a web page that explains itself and still imports', () => {
    const { snapshot, bookId } = ownerDevice();
    const pkg = buildBookPackage(snapshot, bookId);
    pkg.book.title = 'Книга </script><b>мамы</b>';
    pkg.reflections[0].text = 'Текст с </script> внутри';
    const html = bookPackageToHtml(pkg, 'https://example.github.io/app/');
    expect(html).toContain('Открыть файл книги');
    expect(html).toContain('href="https://example.github.io/app/"');
    expect(html).not.toContain('<b>мамы</b>');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    const parsed = parseBookPackage(html);
    expect(parsed.book.title).toBe('Книга </script><b>мамы</b>');
    expect(parsed.reflections[0].text).toBe('Текст с </script> внутри');
    expect(() => parseBookPackage('<html><body>Просто страница</body></html>')).toThrow('В файле нет книги');
  });

  it('names the file after the book', () => {
    expect(bookPackageFileName({ title: 'Книга мамы: лето / 1950' }, new Date('2026-10-16T10:00:00Z'))).toBe('kniga-mamy-leto-1950-2026-10-16.kniga.html');
  });
});
