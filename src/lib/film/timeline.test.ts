import { describe, expect, it } from 'vitest';
import { seedSnapshot } from '../../data/seed';
import type { MediaAsset, Perspective } from '../../data/types';
import { chapterLabel, paginateText, readingSeconds, toRoman } from './text';
import {
  buildFilmTimeline, chronologicalMoments, DEFAULT_FILM_OPTIONS, filmMediaRequests, levelAt, musicEnvelope,
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
    expect(summer).toEqual(['moment', 'text', 'text', 'photo', 'voice', 'reflections']);
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
    const voice = timeline.scenes.find((scene) => scene.kind === 'voice')!;
    expect(cue.start).toBeCloseTo(title.start + 0.9, 5);
    // The relative's own recording only starts once the voice-over has finished.
    expect(voice.start).toBeGreaterThanOrEqual(cue.start + cue.duration);
    expect(timeline.stats.narrations).toBe(1);

    const withoutNarration = buildFilmTimeline(childhoodSource(true), { ...DEFAULT_FILM_OPTIONS, includeNarration: false }, available);
    expect(withoutNarration.cues.some((item) => item.kind === 'narration')).toBe(false);
    expect(withoutNarration.duration).toBeLessThan(timeline.duration);
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
