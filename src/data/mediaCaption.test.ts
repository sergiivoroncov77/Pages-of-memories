import { describe, expect, it } from 'vitest';
import { captionMediaAssets, mediaCaption } from './mediaRefs';
import type { MediaAsset } from './types';

const asset = (id: string, type: MediaAsset['type'], alt?: string, fileName?: string): MediaAsset =>
  ({ id, type, url: 'media:' + id, mimeType: type === 'photo' ? 'image/jpeg' : 'audio/mpeg', alt, fileName, createdAt: '2026-01-01T00:00:00Z' });

describe('file captions', () => {
  it('shows only words someone wrote, not names the app gave a file', () => {
    expect(mediaCaption(asset('a', 'photo', 'Тётя Нина и тётя Лена, 1978 год'))).toBe('Тётя Нина и тётя Лена, 1978 год');
    expect(mediaCaption(asset('b', 'audio', 'Голос: Первоклассник'))).toBe('');
    expect(mediaCaption(asset('c', 'photo', 'IMG_2041.JPG', 'IMG_2041.JPG'))).toBe('');
    expect(mediaCaption(asset('d', 'photo', 'снимок.jpeg'))).toBe('');
    expect(mediaCaption(asset('e', 'photo'))).toBe('');
    // Older versions kept the story's words with its recording.
    expect(mediaCaption(asset('f', 'audio', 'Помню мы играли в школьном холле в мяч'), 'Помню  мы играли в школьном холле в мяч, я поставил…')).toBe('');
    expect(mediaCaption(asset('g', 'audio', 'слово '.repeat(60)))).toBe('');
    expect(mediaCaption(asset('h', 'photo', 'мой класс'), 'Мой класс был большой')).toBe('мой класс');
  });

  it('changes the captions of the given files only', () => {
    const snapshot = { mediaAssets: [asset('a', 'photo', 'Старое'), asset('b', 'audio', 'Голос: Момент'), asset('c', 'photo', 'Своё')] };
    const next = captionMediaAssets(snapshot, { a: '  Новое  ', b: '' });
    expect(next.mediaAssets.map((item) => item.alt)).toEqual(['Новое', 'Голос: Момент', 'Своё']);
    expect(next.mediaAssets[1]).toBe(snapshot.mediaAssets[1]);
    expect(captionMediaAssets(snapshot, { c: '' }).mediaAssets[2].alt).toBeUndefined();
  });
});
