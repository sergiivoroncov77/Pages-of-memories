import { describe, expect, it } from 'vitest';
import { buildReaderPages } from '../features/reader/readerPages';
import { mediaIdsOfBook } from '../sync/bookEntities';
import { deletePerspectiveFromSnapshot, deleteReflectionFromSnapshot } from './library';
import { perspectiveMediaIds } from './mediaRefs';
import {
  addMediaAssetToSnapshot, addPerspectiveToSnapshot, addReflectionToSnapshot, createMediaAsset, createPerspective, createReflection,
  ensureMemoryMoments, storyType, updatePerspectiveInSnapshot
} from './mutations';
import { normalizeSnapshotValue } from './repository';
import { seedSnapshot } from './seed';
import type { AppSnapshot, MediaAsset } from './types';

const demo = () => ensureMemoryMoments(structuredClone(seedSnapshot));
const asset = (id: string, type: MediaAsset['type']) =>
  createMediaAsset({ type, url: 'idb:' + id, mimeType: type === 'photo' ? 'image/png' : 'audio/webm', fileName: id }, id);

function withStory(snapshot: AppSnapshot) {
  const momentId = snapshot.moments[0].id;
  let next = [asset('voice_1', 'audio'), asset('photo_1', 'photo')].reduce(addMediaAssetToSnapshot, snapshot);
  const story = createPerspective({ momentId, type: 'text', content: 'Слова и голос вместе.', attachmentIds: ['voice_1', 'photo_1'] }, 'story_1');
  next = addPerspectiveToSnapshot(next, story);
  return { snapshot: next, momentId, story };
}

describe('a story with words, voice and photos', () => {
  it('keeps every attached file through normalization and counts them as the book’s media', () => {
    const { snapshot } = withStory(demo());
    const normalized = normalizeSnapshotValue(snapshot);
    const story = normalized.perspectives.find((item) => item.id === 'story_1')!;
    expect(story.attachmentIds).toEqual(['voice_1', 'photo_1']);
    const bookId = normalized.moments.find((item) => item.id === story.momentId)!.bookId;
    expect([...mediaIdsOfBook(normalized, bookId)]).toEqual(expect.arrayContaining(['voice_1', 'photo_1']));
  });

  it('removes its files only when the story is deleted, and only files nothing else uses', () => {
    const { snapshot } = withStory(demo());
    const result = deletePerspectiveFromSnapshot(snapshot, 'story_1');
    expect(result.removedMediaIds.sort()).toEqual(['photo_1', 'voice_1']);
    expect(result.snapshot.mediaAssets.some((item) => item.id === 'voice_1')).toBe(false);
  });

  it('takes a file off the story while keeping the rest, and switches type with the words', () => {
    const { snapshot } = withStory(demo());
    const edited = updatePerspectiveInSnapshot(snapshot, 'story_1', { content: '', attachmentIds: ['voice_1'] });
    const story = edited.perspectives.find((item) => item.id === 'story_1')!;
    expect(perspectiveMediaIds(story)).toEqual(['voice_1']);
    expect(story.type).toBe('audio');
    expect(() => updatePerspectiveInSnapshot(snapshot, 'story_1', { content: '', attachmentIds: [] })).toThrow();
  });

  it('shows the words first in the reader with the voice as a small player, and no separate voice page', () => {
    const { snapshot, momentId } = withStory(demo());
    const moment = snapshot.moments.find((item) => item.id === momentId)!;
    const book = snapshot.books.find((item) => item.id === moment.bookId)!;
    const chapter = snapshot.chapters.find((item) => item.id === moment.chapterId)!;
    const pages = buildReaderPages({
      book,
      chapters: [{ chapter, moments: [{ moment, perspectives: snapshot.perspectives.filter((item) => item.id === 'story_1'), reflections: [] }] }],
      assets: new Map(snapshot.mediaAssets.map((item) => [item.id, item])),
      people: new Map()
    });
    const story = pages.find((page) => page.kind === 'story' && page.text.includes('Слова и голос'));
    expect(story && story.kind === 'story' ? story.audioIds : undefined).toEqual(['voice_1']);
    expect(pages.some((page) => page.kind === 'media' && page.assetId === 'voice_1')).toBe(false);
    expect(pages.some((page) => page.kind === 'photo' && page.assetId === 'photo_1')).toBe(true);
  });

  it('keeps a photo with its description a photo after an edit, so the words stay its caption', () => {
    const snapshot = addMediaAssetToSnapshot(demo(), asset('photo_9', 'photo'));
    const photo = createPerspective({ momentId: snapshot.moments[0].id, type: 'photo', content: 'Лето', mediaAssetId: 'photo_9' }, 'photo_story');
    const next = updatePerspectiveInSnapshot(addPerspectiveToSnapshot(snapshot, photo), 'photo_story', { content: 'Лето 1979', attachmentIds: ['photo_9'] });
    expect(next.perspectives.find((item) => item.id === 'photo_story')).toMatchObject({ type: 'photo', content: 'Лето 1979', attachmentIds: ['photo_9'] });
  });

  it('names its type by its contents', () => {
    expect(storyType('слова', [asset('a', 'audio')])).toBe('text');
    expect(storyType('', [asset('b', 'photo')])).toBe('photo');
  });
});

describe('a reflection told aloud', () => {
  it('may have no words, keeps its voice, and lets the voice go with it', () => {
    const snapshot = addMediaAssetToSnapshot(demo(), asset('reply_voice', 'audio'));
    const momentId = snapshot.moments[0].id;
    const next = addReflectionToSnapshot(snapshot, createReflection({ momentId, text: '', mediaAssetId: 'reply_voice' }, 'reply_1'));
    expect(normalizeSnapshotValue(next).reflections.find((item) => item.id === 'reply_1')?.mediaAssetId).toBe('reply_voice');
    expect(() => addReflectionToSnapshot(snapshot, createReflection({ momentId, text: ' ' }))).toThrow();
    const removed = deleteReflectionFromSnapshot(next, 'reply_1');
    expect(removed.removedMediaIds).toEqual(['reply_voice']);
  });
});
