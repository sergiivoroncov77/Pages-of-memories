import { describe, expect, it } from 'vitest';
import { seedSnapshot } from '../../data/seed';
import type { MediaAsset, Perspective } from '../../data/types';
import { chapterLabel, paginateText, readingSeconds, toRoman } from './text';
import {
  buildFilmTimeline, chronologicalMoments, DEFAULT_FILM_OPTIONS, filmMediaRequests, levelAt, musicEnvelope, narrationSpans,
  sceneIndexAt, type FilmAvailability, type FilmSource
} from './timeline';

const voiceAsset: MediaAsset = { id: 'media_voice', type: 'audio', url: 'idb:media_voice', mimeType: 'audio/webm', createdAt: '2026-10-01T10:00:00.000Z' };
const narrationAsset: MediaAsset = { ...voiceAsset, id: 'media_narration', url: 'idb:media_narration' };
const voicePerspective: Perspective = {
  id: 'perspective_voice', momentId: 'moment_summer', authorId: 'person_anna', type: 'audio', content: '',
  caption: 'Голосовая запись ответа', mediaAssetId: voiceAsset.id, createdAt: '2026-10-01T10:00:00.000Z', isPrimary: false
};

function childhoodSource(narration = false): FilmSource {
  const snapshot = structuredClone(seedSnapshot);
  snapshot.mediaAssets.push(voiceAsset, narrationAsset);
  snapshot.perspectives.push(voicePerspective);
  if (narration) snapshot.moments.find((item) => item.id === 'moment_summer')!.narrationMediaAssetId = narrationAsset.id;
  const chapter = snapshot.chapters.find((item) => item.id === 'chapter_childhood')!;
  return {
    bookTitle: snapshot.books[0].title,
    chapter,
    moments: chronologicalMoments(snapshot.moments.filter((item) => item.chapterId === chapter.id)).map((moment) => ({
      moment,
      perspectives: snapshot.perspectives.filter((item) => item.momentId === moment.id),
      reflections: snapshot.reflections.filter((item) => item.momentId === moment.id)
    })),
    assets: new Map(snapshot.mediaAssets.map((asset) => [asset.id, asset])),
    people: new Map(snapshot.people.map((person) => [person.id, person]))
  };
}

const available: FilmAvailability = {
  durations: new Map([[voiceAsset.id, 12], [narrationAsset.id, 40]]),
  photos: new Set(['asset_porch', 'asset_kitchen'])
};

describe('film text helpers', () => {
  it('splits long stories between sentences and keeps every word', () => {
    const story = 'Первое предложение о лете. Второе предложение про луг и дом! Третье — про вечер за большим столом? Четвёртое.';
    const pages = paginateText(story, 60, { flatten: true });
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page) => expect(page.length).toBeLessThanOrEqual(60));
    expect(pages.join(' ')).toBe(story);
  });

  it('breaks a sentence without punctuation by words and keeps paragraphs unless flattened', () => {
    const words = Array.from({ length: 40 }, (_, index) => 'слово' + index).join(' ');
    expect(paginateText(words, 50).every((page) => page.length <= 50)).toBe(true);
    expect(paginateText('Абзац один.\nАбзац два.', 200)).toEqual(['Абзац один.\nАбзац два.']);
    expect(paginateText('Абзац один.\nАбзац два.', 200, { flatten: true })).toEqual(['Абзац один. Абзац два.']);
  });

  it('gives readers enough but bounded time, and names chapters in words', () => {
    expect(readingSeconds('Коротко.')).toBe(4.5);
    expect(readingSeconds('а'.repeat(2000))).toBe(15);
    expect(chapterLabel(1)).toBe('Глава первая');
    expect(chapterLabel(4)).toBe('Глава четвёртая');
    expect(chapterLabel(25)).toBe('Глава 25');
    expect(toRoman(14)).toBe('XIV');
  });
});

describe('chapter film timeline', () => {
  it('tells the chapter from the earliest moment with title, story, photos, voices and reflections', () => {
    const timeline = buildFilmTimeline(childhoodSource(), DEFAULT_FILM_OPTIONS, available);
    const kinds = timeline.scenes.map((scene) => scene.kind);
    expect(kinds[0]).toBe('chapter');
    expect(kinds[kinds.length - 1]).toBe('finale');
    const momentOrder = timeline.scenes.filter((scene) => scene.kind === 'moment').map((scene) => scene.momentId);
    expect(momentOrder).toEqual(['moment_summer', 'moment_table']);
    const summer = timeline.scenes.filter((scene) => scene.momentId === 'moment_summer').map((scene) => scene.kind);
    // The demo recording has no file, so its words are shown as a page of their own.
    // Every story first, in words or aloud, then its photos.
    expect(summer).toEqual(['moment', 'text', 'text', 'text', 'voice', 'photo', 'reflections']);
    expect(timeline.stats).toMatchObject({ moments: 2, photos: 2, voices: 1, reflections: 2 });

    // Scenes are back to back and the film ends when the last one does.
    timeline.scenes.slice(1).forEach((scene, index) => {
      const previous = timeline.scenes[index];
      expect(scene.start).toBeCloseTo(previous.start + previous.duration, 5);
    });
    const last = timeline.scenes[timeline.scenes.length - 1];
    expect(timeline.duration).toBeCloseTo(last.start + last.duration, 5);

    const voice = timeline.scenes.find((scene) => scene.kind === 'voice')!;
    expect(timeline.cues).toEqual([{ assetId: voiceAsset.id, kind: 'voice', start: voice.start + 0.6, duration: 12 }]);
    expect(voice.duration).toBeCloseTo(13.2, 5);
  });

  it('shows the photos of a story and of the views of its author over the time of the story, then one by one', () => {
    const photo = (id: string): MediaAsset => ({ id, type: 'photo', url: 'idb:' + id, mimeType: 'image/jpeg', createdAt: '2026-10-01T10:00:00.000Z' });
    const assets = new Map(['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => [id, photo(id)] as const));
    const base = { momentId: 'm1', createdAt: '2026-10-01T10:00:00.000Z', isPrimary: false };
    const long = Array.from({ length: 40 }, (_, index) => `Предложение номер ${index + 1} о первом классе и школе.`).join(' ');
    const story: Perspective = { ...base, id: 'story', authorId: 'dima', type: 'text', content: long, attachmentIds: ['p1', 'p2', 'p3'], isPrimary: true };
    const view: Perspective = { ...base, id: 'view', authorId: 'dima', type: 'photo', content: 'Во дворе', mediaAssetId: 'p4' };
    const other: Perspective = { ...base, id: 'other', authorId: 'olya', type: 'photo', content: 'Чужое', mediaAssetId: 'p5' };
    const moment = { id: 'm1', bookId: 'b', chapterId: 'c', title: 'Первоклассник', summary: '', tags: [], primaryPerspectiveId: 'story',
      createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', favorite: false };
    const source: FilmSource = { bookTitle: 'Книга', chapter: { id: 'c', bookId: 'b', title: 'Школа', order: 1 } as FilmSource['chapter'],
      moments: [{ moment, perspectives: [story, view, other], reflections: [] }], assets, people: new Map() };
    const timeline = buildFilmTimeline(source, DEFAULT_FILM_OPTIONS, { durations: new Map(), photos: new Set(assets.keys()) });
    const pages = timeline.scenes.filter((scene) => scene.kind === 'text');
    expect(pages.length).toBeGreaterThan(1);
    // Dima's own photos and the photo of his view (Olya's is not his) run over the whole story, apart from its pages:
    // every page knows where in the story it begins, and each photo has a quarter of the story's time.
    const span = pages.reduce((sum, scene) => sum + scene.duration, 0);
    let offset = 0;
    pages.forEach((scene) => {
      if (scene.kind !== 'text') return;
      expect(scene.photoIds).toEqual(['p1', 'p2', 'p3', 'p4']);
      expect(scene.photoKey).toBe('text:story');
      expect(scene.photoOffset).toBeCloseTo(offset, 1);
      expect(scene.photoSpan).toBeCloseTo(span, 1);
      expect(scene.photoId).toBe(['p1', 'p2', 'p3', 'p4'][Math.min(3, Math.floor(offset / (span / 4)))]);
      offset += scene.duration;
    });
    // Then the photos one by one, after the words.
    const kinds = timeline.scenes.filter((scene) => scene.momentId === 'm1').map((scene) => scene.kind);
    expect(kinds.lastIndexOf('text')).toBeLessThan(kinds.indexOf('photo'));
  });

  it('plays the voice of a story while its words are on screen, not after them', () => {
    const source = childhoodSource();
    source.moments.forEach((entry) => {
      entry.perspectives = entry.perspectives.map((item) => item.id === 'perspective_voice' ? { ...item, content: 'Короткий рассказ о лете.' } : item);
    });
    const timeline = buildFilmTimeline(source, DEFAULT_FILM_OPTIONS, available);
    expect(timeline.scenes.some((scene) => scene.kind === 'voice')).toBe(false);
    const words = timeline.scenes.find((scene) => scene.id === 'text:perspective_voice:0')!;
    expect(timeline.cues).toEqual([{ assetId: voiceAsset.id, kind: 'voice', start: words.start + 0.6, duration: 12 }]);
    // The page stays on screen as long as the voice speaks.
    expect(words.duration).toBeCloseTo(13.2, 5);
    expect(timeline.quietSpans).toContainEqual({ start: words.start + 0.6, end: words.start + 12.6 });
  });

  it('leaves reflections, texts and voices out on request and skips demo audio without a file', () => {
    const source = childhoodSource();
    const timeline = buildFilmTimeline(source, { ...DEFAULT_FILM_OPTIONS, includeReflections: false, includeText: false, includeVoices: false }, available);
    expect(timeline.scenes.some((scene) => scene.kind === 'reflections' || scene.kind === 'text' || scene.kind === 'voice')).toBe(false);
    expect(timeline.cues).toEqual([]);
    expect(filmMediaRequests(source).audio.map((asset) => asset.id)).toEqual([voiceAsset.id]);
  });

  it('plays a moment voice-over over its title, story and photos, stretching them to fit', () => {
    const timeline = buildFilmTimeline(childhoodSource(true), DEFAULT_FILM_OPTIONS, available);
    const cue = timeline.cues.find((item) => item.kind === 'narration')!;
    const title = timeline.scenes.find((scene) => scene.id === 'moment:moment_summer')!;
    expect(cue.start).toBeCloseTo(title.start + 0.9, 5);
    // The voice-over tells the moment: the stories' own recordings stay silent.
    expect(timeline.scenes.some((scene) => scene.kind === 'voice' && scene.momentId === 'moment_summer')).toBe(false);
    expect(timeline.cues.filter((item) => item.kind === 'voice')).toEqual([]);
    expect(timeline.stats.narrations).toBe(1);

    // Without the voice-over the recordings are heard again.
    const withoutNarration = buildFilmTimeline(childhoodSource(true), { ...DEFAULT_FILM_OPTIONS, includeNarration: false }, available);
    expect(withoutNarration.cues.some((item) => item.kind === 'narration')).toBe(false);
    expect(withoutNarration.cues.some((item) => item.assetId === voiceAsset.id)).toBe(true);
  });

  it('reads a view aloud in its own stretch after the moment, instead of its recording', () => {
    const source = childhoodSource();
    const summer = source.moments.find((entry) => entry.moment.id === 'moment_summer')!;
    summer.moment = { ...summer.moment, narrations: { [voicePerspective.id]: narrationAsset.id } };
    expect(filmMediaRequests(source).audio.map((asset) => asset.id)).toContain(narrationAsset.id);
    const timeline = buildFilmTimeline(source, DEFAULT_FILM_OPTIONS, available);
    // The view had only a recording: it is now heard through the voice-over, its own voice stays silent.
    expect(timeline.cues.some((cue) => cue.assetId === voiceAsset.id)).toBe(false);
    const cue = timeline.cues.find((item) => item.assetId === narrationAsset.id)!;
    expect(cue.kind).toBe('narration');
    const scene = timeline.scenes.find((item) => item.id === 'voice:perspective_voice:narration')!;
    expect(cue.start).toBeCloseTo(scene.start + 0.9, 5);
    expect(scene.start + scene.duration).toBeGreaterThanOrEqual(cue.start + cue.duration);
  });

  it('tells how long each part lasts, to measure a voice-over against', () => {
    const timeline = buildFilmTimeline(childhoodSource(), { ...DEFAULT_FILM_OPTIONS, includeNarration: false }, available);
    const spans = narrationSpans(timeline);
    const summer = timeline.scenes.filter((scene) => scene.momentId === 'moment_summer' && ['moment', 'text', 'photo'].includes(scene.kind));
    expect(spans.get('moment_summer')).toBeCloseTo(summer.reduce((sum, scene) => sum + scene.duration, 0), 0);
    // A view with only a recording lasts as long as its voice scene.
    expect(spans.get('perspective_voice')).toBeCloseTo(13.2, 1);
    const reflections = timeline.scenes.find((scene) => scene.kind === 'reflections' && scene.momentId === 'moment_summer');
    const firstReflection = reflections && reflections.kind === 'reflections' ? reflections.reflectionIds?.[0] : undefined;
    expect(firstReflection && spans.get(firstReflection)).toBeGreaterThan(2);
  });

  it('reads a reflection aloud when its note appears', () => {
    const source = childhoodSource();
    const summer = source.moments.find((entry) => entry.moment.id === 'moment_summer')!;
    const reflection = summer.reflections[0];
    summer.moment = { ...summer.moment, narrations: { [reflection.id]: narrationAsset.id } };
    const timeline = buildFilmTimeline(source, DEFAULT_FILM_OPTIONS, available);
    const scene = timeline.scenes.find((item) => item.kind === 'reflections' && item.momentId === 'moment_summer')!;
    const cue = timeline.cues.find((item) => item.assetId === narrationAsset.id)!;
    expect(cue).toMatchObject({ kind: 'narration', duration: 40 });
    expect(cue.start).toBeCloseTo(scene.start + 1.5, 5);
    expect(scene.start + scene.duration).toBeGreaterThan(cue.start + cue.duration);
  });

  it('plays a reflection told aloud when its note appears and keeps the note up while it speaks', () => {
    const source = childhoodSource();
    const reflectionVoice = { ...voiceAsset, id: 'asset_reflection_voice' };
    source.assets = new Map([...source.assets, [reflectionVoice.id, reflectionVoice]]);
    source.moments.forEach((entry) => {
      if (entry.moment.id !== 'moment_summer') return;
      entry.reflections = [{ id: 'reflection_voice', momentId: 'moment_summer', text: '', mediaAssetId: reflectionVoice.id, createdAt: '2026-01-01T00:00:00.000Z' }];
    });
    expect(filmMediaRequests(source).audio.map((asset) => asset.id)).toContain(reflectionVoice.id);
    const timeline = buildFilmTimeline(source, DEFAULT_FILM_OPTIONS, { ...available, durations: new Map([...available.durations, [reflectionVoice.id, 9]]) });
    const scene = timeline.scenes.find((item) => item.kind === 'reflections' && item.momentId === 'moment_summer')!;
    const cue = timeline.cues.find((item) => item.assetId === reflectionVoice.id)!;
    expect(cue.start).toBeCloseTo(scene.start + 1.5, 5);
    expect(scene.start + scene.duration).toBeGreaterThan(cue.start + cue.duration);
    expect(scene.kind === 'reflections' && scene.notes[0]).toMatchObject({ text: 'Отклик голосом', voiced: true });
  });

  it('skips media that did not open on this device', () => {
    const timeline = buildFilmTimeline(childhoodSource(), DEFAULT_FILM_OPTIONS, { durations: new Map(), photos: new Set() });
    expect(timeline.scenes.some((scene) => scene.kind === 'photo' || scene.kind === 'voice')).toBe(false);
    expect(timeline.scenes.filter((scene) => scene.kind === 'text').every((scene) => scene.kind === 'text' && !scene.photoId)).toBe(true);
  });

  it('finds the scene at a time and ducks the music under voices', () => {
    const timeline = buildFilmTimeline(childhoodSource(), DEFAULT_FILM_OPTIONS, available);
    expect(sceneIndexAt(timeline, 0)).toBe(0);
    const third = timeline.scenes[2];
    expect(sceneIndexAt(timeline, third.start + 0.01)).toBe(2);
    expect(sceneIndexAt(timeline, timeline.duration + 10)).toBe(timeline.scenes.length - 1);

    const envelope = musicEnvelope(timeline, 1, 0.3);
    const cue = timeline.cues[0];
    expect(levelAt(envelope, 0)).toBe(0);
    expect(levelAt(envelope, cue.start + cue.duration / 2)).toBeCloseTo(0.3, 5);
    expect(levelAt(envelope, timeline.duration)).toBe(0);
  });
});
