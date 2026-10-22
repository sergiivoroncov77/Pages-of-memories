import { safeFileName } from '../lib/fileName';
import { pluralize } from '../lib/format';
import { entityFields, isSafeBackupMediaUrl, normalizeSnapshotValue, validateFields } from './repository';
import type { AppSnapshot, Book, Chapter, MediaAsset, Moment, Person, Perspective, Reflection } from './types';

/*
 * One book as a file a relative can open in their own copy of the app — the
 * simplest way to share without accounts or a server. Importing the same book
 * again merges it: new chapters, moments, stories and comments are added, and
 * edited ones keep the newer version, so files can travel back and forth.
 */

export const BOOK_PACKAGE_KIND = 'family-stories-book';

export interface BookPackage {
  kind: typeof BOOK_PACKAGE_KIND;
  version: 1;
  exportedAt: string;
  book: Book;
  chapters: Chapter[];
  moments: Moment[];
  perspectives: Perspective[];
  reflections: Reflection[];
  mediaAssets: MediaAsset[];
  /** Authors of the stories and comments, so signatures survive the trip. */
  people: Person[];
}

export interface MergeSummary {
  bookId: string;
  bookTitle: string;
  isNewBook: boolean;
  added: { chapters: number; moments: number; perspectives: number; reflections: number; people: number };
  updated: number;
}

/** Interview links only make sense on the device that recorded the interview. */
function withoutInterviewLink<T extends { sourceMemoryId?: string }>(item: T): T {
  const copy = { ...item };
  delete copy.sourceMemoryId;
  return copy;
}

export function buildBookPackage(snapshot: AppSnapshot, bookId: string, exportedAt = new Date().toISOString()): BookPackage {
  const book = snapshot.books.find((item) => item.id === bookId);
  if (!book) throw new Error('Книга не найдена.');
  const chapters = snapshot.chapters.filter((chapter) => chapter.bookId === bookId);
  const moments = snapshot.moments.filter((moment) => moment.bookId === bookId);
  const momentIds = new Set(moments.map((moment) => moment.id));
  const perspectives = snapshot.perspectives.filter((item) => momentIds.has(item.momentId));
  const reflections = snapshot.reflections.filter((item) => momentIds.has(item.momentId));
  const mediaIds = new Set([
    book.coverMediaAssetId,
    ...moments.map((moment) => moment.narrationMediaAssetId),
    ...perspectives.map((item) => item.mediaAssetId)
  ].filter((id): id is string => Boolean(id)));
  const authorIds = new Set([...perspectives, ...reflections].map((item) => item.authorId).filter((id): id is string => Boolean(id)));
  return {
    kind: BOOK_PACKAGE_KIND,
    version: 1,
    exportedAt,
    book: { ...book },
    chapters: chapters.map((chapter) => ({ ...chapter })),
    moments: moments.map((moment) => withoutInterviewLink({ ...moment, tags: [...moment.tags] })),
    perspectives: perspectives.map(withoutInterviewLink),
    reflections: reflections.map((item) => ({ ...item })),
    mediaAssets: snapshot.mediaAssets.filter((asset) => mediaIds.has(asset.id)).map((asset) => ({ ...asset })),
    people: snapshot.people.filter((person) => authorIds.has(person.id)).map((person) => ({ ...person }))
  };
}

export function isBookPackage(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === BOOK_PACKAGE_KIND;
}

const PACKAGE_SCRIPT_ID = 'family-stories-book';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/**
 * Phones only share files of a few types (photos, video, audio, PDF, HTML…),
 * so the book travels as a small web page: opened on its own it explains what
 * to do, and the app reads the book data embedded in it.
 */
export function bookPackageToHtml(pkg: BookPackage, appUrl: string): string {
  const title = escapeHtml(pkg.book.title);
  const count = (n: number, one: string, few: string, many: string) => `${n} ${pluralize(n, one, few, many)}`;
  const counts = [count(pkg.chapters.length, 'глава', 'главы', 'глав'), count(pkg.moments.length, 'момент', 'момента', 'моментов'),
    count(pkg.mediaAssets.length, 'фото или запись', 'фото или записи', 'фото и записей')].join(' · ');
  // `<` is escaped so the data can never close the script element early.
  const data = JSON.stringify(pkg).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Книга «${title}» — Истории близких</title>
<style>body{margin:0;padding:32px 20px;font:17px/1.6 system-ui,sans-serif;background:#f7f1e7;color:#2f2923}main{max-width:560px;margin:auto}
h1{font:600 1.8rem/1.2 Georgia,serif}ol{padding-left:1.2em}a.button{display:inline-block;margin-top:12px;padding:12px 20px;border-radius:999px;background:#9b5038;color:#fff;text-decoration:none;font-weight:700}
small{color:#7a6a5c}</style></head>
<body><main><p><small>Истории близких · семейная книга</small></p><h1>«${title}»</h1><p><small>${escapeHtml(counts)}</small></p>
<p>Этот файл — книга воспоминаний. Чтобы её открыть:</p>
<ol><li>Откройте приложение «Истории близких» по ссылке ниже (на телефоне или планшете — в Chrome).</li>
<li>Перейдите в раздел «Библиотека» и нажмите «Открыть файл книги».</li><li>Выберите этот файл. Книга появится на вашей полке.</li></ol>
<p>Добавляйте свои воспоминания и комментарии, а потом отправьте книгу обратно тем же способом — всё новое добавится к оригиналу.</p>
<a class="button" href="${escapeHtml(appUrl)}">Открыть приложение</a></main>
<script type="application/json" id="${PACKAGE_SCRIPT_ID}">${data}</script></body></html>`;
}

/** The book data from a shared file: the HTML page above or plain JSON. */
export function extractBookPackageJson(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) return trimmed;
  const match = new RegExp(`<script type="application/json" id="${PACKAGE_SCRIPT_ID}">([\\s\\S]*?)</script>`).exec(text);
  if (!match) throw new Error('В файле нет книги. Выберите файл, который прислали из приложения «Истории близких».');
  return match[1];
}

/** Strict check of a received file before anything on this device changes. */
export function parseBookPackage(text: string): BookPackage {
  let value: unknown;
  try { value = JSON.parse(extractBookPackageJson(text)); } catch (error) {
    if (error instanceof Error && error.message.startsWith('В файле нет книги')) throw error;
    throw new Error('Не удалось прочитать файл. Выберите файл книги из приложения «Истории близких».');
  }
  if (!isBookPackage(value)) throw new Error('Это не файл книги. Резервную копию всего архива восстанавливают в настройках.');
  const pkg = value as Record<string, unknown>;
  if (pkg.version !== 1) throw new Error('Файл книги из более новой версии приложения. Обновите приложение и попробуйте снова.');
  validateFields(pkg.book, entityFields.books, 'book');
  const book = pkg.book as unknown as Book;
  const lists = ['chapters', 'moments', 'perspectives', 'reflections', 'mediaAssets', 'people'] as const;
  for (const name of lists) {
    const items = pkg[name];
    if (!Array.isArray(items)) throw new Error(`Файл книги неполный: нет списка ${name}.`);
    const ids = new Set<string>();
    items.forEach((item, index) => {
      validateFields(item, entityFields[name], `${name}[${index + 1}]`);
      if (ids.has(item.id as string)) throw new Error(`Файл книги повреждён: повторяется ${name}/${String(item.id)}.`);
      ids.add(item.id as string);
    });
  }
  const typed = value as BookPackage;
  const chapters = new Set(typed.chapters.map((chapter) => chapter.id));
  const moments = new Set(typed.moments.map((moment) => moment.id));
  const people = new Set(typed.people.map((person) => person.id));
  const assets = new Map(typed.mediaAssets.map((asset) => [asset.id, asset]));
  const check = (valid: boolean, label: string) => {
    if (!valid) throw new Error(`Файл книги повреждён: нарушена связь ${label}.`);
  };
  typed.chapters.forEach((chapter) => check(chapter.bookId === book.id, 'главы с книгой'));
  typed.moments.forEach((moment) => {
    check(moment.bookId === book.id && chapters.has(moment.chapterId), 'момента с главой');
    if (moment.narrationMediaAssetId !== undefined) check(assets.get(moment.narrationMediaAssetId)?.type === 'audio', 'озвучки с аудио');
  });
  [...typed.perspectives, ...typed.reflections].forEach((item) => {
    check(moments.has(item.momentId), 'рассказа или отклика с моментом');
    if (item.authorId !== undefined) check(people.has(item.authorId), 'рассказа с автором');
  });
  typed.perspectives.forEach((item) => {
    if (item.mediaAssetId !== undefined) check(item.type === 'text' || assets.get(item.mediaAssetId)?.type === item.type, 'материала с файлом');
  });
  if (book.coverMediaAssetId !== undefined) check(assets.get(book.coverMediaAssetId)?.type === 'photo', 'обложки с фотографией');
  typed.mediaAssets.forEach((asset) => {
    // Files must travel inside the package; device-local references would dangle.
    if (asset.url.startsWith('idb:') || !isSafeBackupMediaUrl(asset.url, asset.type, asset.id)) {
      throw new Error('В файле книги есть неподдерживаемый материал или внешняя ссылка. Попросите отправить файл ещё раз.');
    }
  });
  return typed;
}

const newer = (incoming: { updatedAt: string }, local: { updatedAt: string }) =>
  new Date(incoming.updatedAt).getTime() > new Date(local.updatedAt).getTime();

/**
 * Merge a received book into this device's archive. `mediaUrls` maps asset ids
 * to where their bytes now live on this device (`idb:` after storing them).
 */
export function mergeBookPackage(snapshot: AppSnapshot, pkg: BookPackage, mediaUrls: Map<string, string> = new Map()): { snapshot: AppSnapshot; summary: MergeSummary } {
  const projectId = snapshot.project.id;
  const added = { chapters: 0, moments: 0, perspectives: 0, reflections: 0, people: 0 };
  let updated = 0;

  const localBook = snapshot.books.find((item) => item.id === pkg.book.id);
  const incomingBook: Book = { ...pkg.book, projectId };
  const book = !localBook ? incomingBook
    : newer(incomingBook, localBook) ? { ...incomingBook, coverMediaAssetId: incomingBook.coverMediaAssetId ?? localBook.coverMediaAssetId }
    : localBook;
  if (localBook && book !== localBook) updated += 1;

  const people = [...snapshot.people];
  pkg.people.forEach((person) => {
    if (people.some((item) => item.id === person.id)) return;
    people.push({ ...person, projectId });
    added.people += 1;
  });

  const chapters = [...snapshot.chapters];
  pkg.chapters.forEach((chapter) => {
    const index = chapters.findIndex((item) => item.id === chapter.id);
    if (index === -1) { chapters.push({ ...chapter }); added.chapters += 1; return; }
    if (newer(chapter, chapters[index])) { chapters[index] = { ...chapter, bookId: chapters[index].bookId }; updated += 1; }
  });

  const moments = [...snapshot.moments];
  pkg.moments.forEach((moment) => {
    const index = moments.findIndex((item) => item.id === moment.id);
    if (index === -1) { moments.push({ ...moment, tags: [...moment.tags] }); added.moments += 1; return; }
    const local = moments[index];
    if (newer(moment, local)) {
      moments[index] = { ...moment, tags: [...moment.tags], sourceMemoryId: local.sourceMemoryId };
      updated += 1;
    }
  });

  const perspectives = [...snapshot.perspectives];
  pkg.perspectives.forEach((item) => {
    if (perspectives.some((local) => local.id === item.id)) return;
    perspectives.push({ ...item });
    added.perspectives += 1;
  });

  const reflections = [...snapshot.reflections];
  pkg.reflections.forEach((item) => {
    if (reflections.some((local) => local.id === item.id)) return;
    reflections.push({ ...item });
    added.reflections += 1;
  });

  const mediaAssets = [...snapshot.mediaAssets];
  pkg.mediaAssets.forEach((asset) => {
    if (mediaAssets.some((local) => local.id === asset.id)) return;
    mediaAssets.push({ ...asset, url: mediaUrls.get(asset.id) ?? asset.url });
  });

  const merged = normalizeSnapshotValue({
    ...snapshot,
    people,
    books: localBook ? snapshot.books.map((item) => item.id === book.id ? book : item) : [...snapshot.books, book],
    chapters,
    moments,
    perspectives,
    reflections,
    mediaAssets,
    settings: { ...snapshot.settings, activeBookId: book.id }
  });
  return { snapshot: merged, summary: { bookId: book.id, bookTitle: book.title, isNewBook: !localBook, added, updated } };
}

/** File name for a shared book: readable in a chat, safe on every phone. */
export function bookPackageFileName(book: Pick<Book, 'title'>, date = new Date()): string {
  return `${safeFileName(book.title)}-${date.toISOString().slice(0, 10)}.kniga.html`;
}
