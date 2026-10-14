import { describe, expect, it } from 'vitest';
import type { MediaAsset, Perspective } from '../data/types';
import { buildBookHtml, type BookExportInput } from './bookExport';

function fixture(): BookExportInput {
  const createdAt = '2026-10-01T10:00:00.000Z';
  return {
    title: 'Наша семейная книга',
    dedication: 'Для близких\nОт всей семьи',
    chapters: [
      { id: 'second', bookId: 'book', title: 'Вторая глава', description: 'Дальние поездки', order: 2, createdAt, updatedAt: createdAt },
      { id: 'first', bookId: 'book', title: 'Первая глава', description: 'Наш дом\nИ его истории', order: 1, createdAt, updatedAt: createdAt },
      { id: 'empty', bookId: 'book', title: 'Пустая глава', description: 'Не попадёт в книгу', order: 3, createdAt, updatedAt: createdAt }
    ],
    moments: [
      { id: 'home', bookId: 'book', chapterId: 'first', title: 'Вечер дома', summary: 'Первый абзац\nВторой абзац', tags: ['дом', 'детство'], occurredAt: '2001-04-03', createdAt, updatedAt: createdAt, favorite: false, primaryPerspectiveId: 'primary' },
      { id: 'trip', bookId: 'book', chapterId: 'second', title: 'Поездка к морю', summary: 'Дорога на юг', tags: [], createdAt, updatedAt: createdAt, favorite: false }
    ],
    perspectives: [
      { id: 'other', momentId: 'home', authorId: 'person', type: 'text', content: 'Другой взгляд', createdAt, isPrimary: false },
      { id: 'primary', momentId: 'home', authorId: 'person', type: 'text', content: 'Главный рассказ\nНовая строка', caption: 'Из семейного альбома', createdAt, isPrimary: true },
      { id: 'trip-view', momentId: 'trip', type: 'text', content: 'Рассказ о поездке', createdAt, isPrimary: true }
    ],
    reflections: [{ id: 'reflection', momentId: 'home', authorId: 'person', text: 'Тёплый отклик\nВторая строка', createdAt }],
    people: [{ id: 'person', projectId: 'project', name: 'Анна', relation: 'Мама', initials: 'А', avatarColor: '#123456', bio: '', answeredCount: 0, totalQuestions: 0, lastActiveAt: createdAt, status: 'active' }],
    mediaAssets: [],
    withMedia: true,
    withReflections: true
  };
}

function withAsset(asset: Partial<MediaAsset>, perspectiveType: Perspective['type'] = 'photo'): BookExportInput {
  const input = fixture();
  input.mediaAssets = [{ id: 'asset', type: 'photo', url: 'data:image/png;base64,aGVsbG8=', mimeType: 'image/png', createdAt: '2026-10-01T10:00:00.000Z', ...asset }];
  input.perspectives = [{ ...input.perspectives[1], type: perspectiveType, mediaAssetId: 'asset' }];
  return input;
}

describe('buildBookHtml', () => {
  it('preserves selected content, chapter order, primary stories and navigable structure without mutating input', () => {
    const input = fixture();
    const original = structuredClone(input);
    const html = buildBookHtml(input);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ru">');
    expect(html).toContain('<nav class="toc" aria-label="Оглавление">');
    expect(html).toContain('href="#chapter-1"');
    expect(html).toContain('id="chapter-1"');
    expect(html).toContain('href="#moment-2-1"');
    expect(html).toContain('id="moment-2-1"');
    expect(html.indexOf('<h2>Первая глава</h2>')).toBeLessThan(html.indexOf('<h2>Вторая глава</h2>'));
    expect(html.indexOf('Главный рассказ')).toBeLessThan(html.indexOf('Другой взгляд'));
    expect(html).toContain('дом · детство');
    expect(html).toContain('2 момента · 2 главы');
    expect(html).not.toContain('Пустая глава');
    expect(input).toEqual(original);
  });

  it('does not include unselected stories, responses, assets or empty chapters', () => {
    const input = withAsset({});
    input.perspectives = [...input.perspectives, fixture().perspectives[2]];
    input.moments = [input.moments[1]];
    const html = buildBookHtml(input);
    expect(html).toContain('Рассказ о поездке');
    expect(html).toContain('1 момент · 1 глава');
    expect(html).not.toContain('Главный рассказ');
    expect(html).not.toContain('Тёплый отклик');
    expect(html).not.toContain('Первая глава');
    expect(html).not.toContain('data:image/png');
  });

  it('escapes every user-authored text field and uses its own safe fragment ids', () => {
    const input = withAsset({ alt: '<img src=x onerror="alert(1)">' });
    const payload = '<script>alert("x")</script>&\'';
    const escaped = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#039;';
    input.title = payload;
    input.dedication = payload;
    input.chapters = input.chapters.map((chapter) => ({ ...chapter, title: payload, description: payload }));
    input.moments = input.moments.map((moment) => ({ ...moment, title: payload, summary: payload, tags: [payload] }));
    input.perspectives = input.perspectives.map((perspective) => ({ ...perspective, content: payload, caption: payload }));
    input.reflections = input.reflections.map((reflection) => ({ ...reflection, text: payload }));
    input.people = input.people.map((person) => ({ ...person, name: payload }));
    const html = buildBookHtml(input);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain(payload);
    expect(html.match(new RegExp(escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBeGreaterThan(15);
    expect(html).toContain('alt="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"');
    expect(html).toContain('id="moment-1-1"');
  });

  it('retains long multiline text, captions, dedication, chapter descriptions and responses', () => {
    const input = fixture();
    const longText = `Начало\n\n${'Очень длинная семейная история. '.repeat(1000)}\nКонец`;
    input.perspectives = [{ ...input.perspectives[0], content: longText, caption: 'Подпись\nПродолжение' }];
    const html = buildBookHtml(input);
    expect(html).toContain(longText);
    expect(html).toContain('Подпись\nПродолжение');
    expect(html).toContain(input.dedication);
    expect(html).toContain('Наш дом\nИ его истории');
    expect(html).toContain('Первый абзац\nВторой абзац');
    expect(html).toContain('Тёплый отклик\nВторая строка');
    expect(html).toContain('white-space:pre-wrap');
    expect(html).toContain('@media print');
    expect(html).toContain('object-fit:contain');
  });

  it('handles missing authors and missing or malformed dates without losing the story', () => {
    const input = fixture();
    input.people = [];
    input.moments = input.moments.map((moment, index) => ({ ...moment, occurredAt: index === 0 ? undefined : '<unknown date>' }));
    const html = buildBookHtml(input);
    expect(html).toContain('<strong>Участник</strong>');
    expect(html).toContain('— Участник');
    expect(html).toContain('Дата не указана');
    expect(html).toContain('&lt;unknown date&gt;');
    expect(html).toContain('Рассказ о поездке');
  });

  it('removes responses when their switch is off, while retaining stories', () => {
    const input = fixture();
    input.withReflections = false;
    const html = buildBookHtml(input);
    expect(html).not.toContain('Тёплый отклик');
    expect(html).not.toContain('<aside class="reflections">');
    expect(html).toContain('Главный рассказ');
  });

  it.each([
    ['photo', 'image/png', '<img '],
    ['photo', 'image/jpeg', '<img '],
    ['audio', 'audio/mpeg', '<audio '],
    ['audio', 'audio/webm', '<audio '],
    ['video', 'video/mp4', '<video '],
    ['video', 'video/webm', '<video ']
  ] as const)('embeds uploaded %s (%s) media and retains its text', (type, mimeType, element) => {
    const url = `data:${mimeType};base64,aGVsbG8=`;
    const input = withAsset({ type, mimeType, url }, type);
    const html = buildBookHtml(input);
    expect(html).toContain(element);
    expect(html).toContain(`src="${url}"`);
    expect(html).toContain('Главный рассказ');
    expect(html).toContain('Из семейного альбома');
    expect(html).not.toContain('Медиафайл не приложен');
  });

  it.each(['photo', 'audio', 'video'] as const)('removes %s media payload when media is disabled, preserving the description', (type) => {
    const mimeType = type === 'photo' ? 'image/png' : type === 'audio' ? 'audio/mpeg' : 'video/mp4';
    const input = withAsset({ type, mimeType, url: `data:${mimeType};base64,aGVsbG8=` }, type);
    input.withMedia = false;
    const html = buildBookHtml(input);
    expect(html).not.toContain('base64,aGVsbG8=');
    expect(html).not.toMatch(/<(img|audio|video)\s/);
    expect(html).toContain('Главный рассказ');
    expect(html).toContain('Медиа не включены в эту копию.');
  });

  it.each(['/demo/photo-porch.svg', '/demo/photo-kitchen.svg', '/demo/photo-walk.svg'])('inlines the known local illustration %s', (url) => {
    const html = buildBookHtml(withAsset({ url, mimeType: 'image/svg+xml' }));
    expect(html).toContain('src="data:image/svg+xml;charset=utf-8,');
    expect(html).toContain('%3Csvg');
    expect(html).toContain('Демонстрационная иллюстрация');
    expect(html).not.toContain(`src="${url}"`);
  });

  it('omits bundled illustrations as well when media is disabled', () => {
    const input = withAsset({ url: '/demo/photo-porch.svg', mimeType: 'image/svg+xml' });
    input.withMedia = false;
    expect(buildBookHtml(input)).not.toContain('<img ');
  });

  it.each(['/demo/summer-memory.mp3', '/demo/baikal-memory.mp3'])('labels absent demo audio %s instead of creating a broken player', (url) => {
    const html = buildBookHtml(withAsset({ type: 'audio', mimeType: 'audio/mpeg', url }, 'audio'));
    expect(html).not.toContain('<audio ');
    expect(html).not.toContain(url);
    expect(html).toContain('Демонстрационное аудио: звуковой файл в проекте отсутствует.');
    expect(html).toContain('Текст к аудио');
    expect(html).toContain('Главный рассказ');
  });

  it.each([
    'javascript:alert(1)',
    'https://example.com/image.png',
    '//example.com/image.png',
    'blob:https://example.com/example',
    'file:///private/photo.png',
    '/demo/unknown.svg',
    '/demo/photo-porch.svg?unsafe=1',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png,<svg onload="alert(1)">',
    'data:image/png;base64,',
    'data:image/png;base64,abc',
    'data:image/png;base64,a===',
    'data:image/png;base64,!!!!',
    'data:image/png;base64,aGVsbG8=" onerror="alert(1)',
    ' data:image/png;base64,aGVsbG8=',
    'data:image/png;charset=utf-8;base64,aGVsbG8='
  ])('does not embed unsafe, external or malformed media URLs: %s', (url) => {
    const html = buildBookHtml(withAsset({ url }));
    expect(html).not.toContain('<img ');
    expect(html).not.toContain(url);
    expect(html).toContain('Медиафайл не приложен или недоступен для автономной копии.');
  });

  it.each([
    { type: 'photo', mimeType: 'image/png', url: 'data:audio/mpeg;base64,aGVsbG8=' },
    { type: 'audio', mimeType: 'image/png', url: 'data:image/png;base64,aGVsbG8=' },
    { type: 'photo', mimeType: 'image/jpeg', url: 'data:image/png;base64,aGVsbG8=' },
    { type: 'document', mimeType: 'application/pdf', url: 'data:application/pdf;base64,aGVsbG8=' }
  ] satisfies Partial<MediaAsset>[])('rejects inconsistent or unsupported media types: %j', (asset) => {
    const html = buildBookHtml(withAsset(asset));
    expect(html).not.toMatch(/<(img|audio|video|iframe|object)\s/);
    expect(html).toContain('Главный рассказ');
  });

  it('keeps descriptions for missing asset references and never emits a false audio player', () => {
    const input = withAsset({}, 'audio');
    input.mediaAssets = [];
    const html = buildBookHtml(input);
    expect(html).not.toContain('<audio ');
    expect(html).toContain('Главный рассказ');
    expect(html).toContain('Медиафайл не приложен');
  });

  it('blocks remote resource loading and scripts in the exported document', () => {
    const html = buildBookHtml(fixture());
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'; img-src data:; media-src data:");
    expect(html).not.toMatch(/<(script|link|iframe|object)\b/);
  });

  it('rejects an empty selection and blank title with actionable messages', () => {
    expect(() => buildBookHtml({ ...fixture(), moments: [] })).toThrow('Выберите хотя бы один момент.');
    expect(() => buildBookHtml({ ...fixture(), title: '  \n ' })).toThrow('Добавьте название книги.');
  });

  it('does not silently discard selected moments whose chapter is missing or belongs to another book', () => {
    const input = fixture();
    input.chapters = [];
    expect(() => buildBookHtml(input)).toThrow('Не удалось найти главу');
    input.chapters = fixture().chapters.map((chapter) => ({ ...chapter, bookId: 'different-book' }));
    expect(() => buildBookHtml(input)).toThrow('Не удалось найти главу');
  });
});
