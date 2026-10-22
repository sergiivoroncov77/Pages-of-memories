import type { Chapter, MediaAsset, Moment, Person, Perspective, Reflection } from '../../data/types';

export { chronologicalMoments } from '../../data/library';
import { formatDate, truncate } from '../format';
import { chapterLabel, paginateText, readingSeconds } from './text';

/**
 * The chapter film is described as plain data: a list of timed scenes plus
 * the audio cues that play over them. The renderer and the player only read
 * this plan, so the order and timing rules are testable without a browser.
 */

export type FilmFormat = 'landscape' | 'portrait';

export interface FilmOptions {
  /** Written stories appear as pages of text. */
  includeText: boolean;
  /** Voice recordings of the relatives play over the moment's photos. */
  includeVoices: boolean;
  /** A moment's voice-over plays over its title, photos and text. */
  includeNarration: boolean;
  includeVideos: boolean;
  /** Reflections (comments) are optional and shown after each moment. */
  includeReflections: boolean;
  music: boolean;
  format: FilmFormat;
}

export const DEFAULT_FILM_OPTIONS: FilmOptions = {
  includeText: true,
  includeVoices: true,
  includeNarration: true,
  includeVideos: true,
  includeReflections: true,
  music: true,
  format: 'landscape'
};

export const FILM_SIZES: Record<FilmFormat, { width: number; height: number }> = {
  landscape: { width: 1280, height: 720 },
  portrait: { width: 720, height: 1280 }
};

export type FilmTransition = 'fade' | 'page';
export const TRANSITION_SECONDS: Record<FilmTransition, number> = { fade: 0.8, page: 1.1 };

interface SceneBase {
  id: string;
  start: number;
  duration: number;
  transition: FilmTransition;
  momentId?: string;
  /** Short storyboard label. */
  label: string;
}

export interface ChapterScene extends SceneBase {
  kind: 'chapter';
  bookTitle: string;
  chapterLabel: string;
  title: string;
  description: string;
}

export interface MomentScene extends SceneBase {
  kind: 'moment';
  title: string;
  date: string;
  summary: string;
  narrators: string[];
  narrated: boolean;
}

export interface PhotoScene extends SceneBase {
  kind: 'photo';
  assetId: string;
  caption: string;
  author: string;
}

export interface TextScene extends SceneBase {
  kind: 'text';
  text: string;
  author: string;
  page: number;
  pages: number;
  photoId?: string;
}

export interface VoiceScene extends SceneBase {
  kind: 'voice';
  assetId: string;
  /** Seconds into the scene when the recording starts. */
  audioOffset: number;
  author: string;
  initials: string;
  color: string;
  caption: string;
  photoIds: string[];
}

export interface VideoScene extends SceneBase {
  kind: 'video';
  assetId: string;
  videoOffset: number;
  author: string;
  caption: string;
}

export interface ReflectionsScene extends SceneBase {
  kind: 'reflections';
  momentTitle: string;
  notes: { text: string; author: string; appearAt: number }[];
}

export interface FinaleScene extends SceneBase {
  kind: 'finale';
  bookTitle: string;
  chapterLabel: string;
  chapterTitle: string;
  narrators: string[];
}

export type FilmScene = ChapterScene | MomentScene | PhotoScene | TextScene | VoiceScene | VideoScene | ReflectionsScene | FinaleScene;

export interface FilmAudioCue {
  assetId: string;
  kind: 'voice' | 'narration';
  start: number;
  duration: number;
}

export interface FilmTimeline {
  format: FilmFormat;
  scenes: FilmScene[];
  cues: FilmAudioCue[];
  /** Spans where a voice or a video speaks; background music steps back. */
  quietSpans: { start: number; end: number }[];
  duration: number;
  stats: { moments: number; photos: number; texts: number; voices: number; narrations: number; videos: number; reflections: number };
}

export interface FilmMomentSource {
  moment: Moment;
  perspectives: Perspective[];
  reflections: Reflection[];
}

export interface FilmSource {
  bookTitle: string;
  chapter: Chapter;
  moments: FilmMomentSource[];
  assets: ReadonlyMap<string, MediaAsset>;
  people: ReadonlyMap<string, Person>;
}

/** What actually opened on this device: decoded durations for audio/video and the photos that loaded. */
export interface FilmAvailability {
  durations: ReadonlyMap<string, number>;
  photos: ReadonlySet<string>;
}

const CHAPTER_SECONDS = 5.5;
const PHOTO_SECONDS = 5.5;
const FINALE_SECONDS = 6;
const VOICE_PADDING = 0.6;
const NARRATION_DELAY = 0.9;
const MAX_VIDEO_SECONDS = 180;
const TEXT_PAGE_CHARS = 260;

/** Demo audio and video in the seed data point at files that are not shipped. */
export function isAttachedMedia(asset: MediaAsset | undefined): asset is MediaAsset {
  return Boolean(asset) && !(asset!.type !== 'photo' && asset!.url.startsWith('/demo/'));
}

/** Every asset the film may need, so toggling options never requires loading again. */
export function filmMediaRequests(source: FilmSource): { photos: MediaAsset[]; audio: MediaAsset[]; videos: MediaAsset[] } {
  const photos = new Map<string, MediaAsset>();
  const audio = new Map<string, MediaAsset>();
  const videos = new Map<string, MediaAsset>();
  source.moments.forEach(({ moment, perspectives }) => {
    perspectives.forEach((perspective) => {
      const asset = perspective.mediaAssetId ? source.assets.get(perspective.mediaAssetId) : undefined;
      if (!isAttachedMedia(asset)) return;
      if (asset.type === 'photo') photos.set(asset.id, asset);
      if (asset.type === 'audio' && perspective.type === 'audio') audio.set(asset.id, asset);
      if (asset.type === 'video' && perspective.type === 'video') videos.set(asset.id, asset);
    });
    const narration = moment.narrationMediaAssetId ? source.assets.get(moment.narrationMediaAssetId) : undefined;
    if (isAttachedMedia(narration) && narration.type === 'audio') audio.set(narration.id, narration);
  });
  return { photos: [...photos.values()], audio: [...audio.values()], videos: [...videos.values()] };
}

function personName(source: FilmSource, id?: string): string {
  return (id && source.people.get(id)?.name) || 'Без указания автора';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Draft = DistributiveOmit<FilmScene, 'start'>;

export function buildFilmTimeline(source: FilmSource, options: FilmOptions, availability: FilmAvailability): FilmTimeline {
  const scenes: FilmScene[] = [];
  const cues: FilmAudioCue[] = [];
  const quietSpans: FilmTimeline['quietSpans'] = [];
  const stats: FilmTimeline['stats'] = { moments: 0, photos: 0, texts: 0, voices: 0, narrations: 0, videos: 0, reflections: 0 };
  const filmNarrators: string[] = [];
  let cursor = 0;
  const place = (draft: Draft) => {
    const scene = { ...draft, start: cursor } as FilmScene;
    cursor += scene.duration;
    scenes.push(scene);
    return scene;
  };
  const label = chapterLabel(source.chapter.order);

  place({
    id: 'chapter:' + source.chapter.id, kind: 'chapter', duration: CHAPTER_SECONDS, transition: 'fade',
    label: label + ': ' + source.chapter.title, bookTitle: source.bookTitle, chapterLabel: label,
    title: source.chapter.title, description: source.chapter.description
  });

  source.moments.forEach(({ moment, perspectives, reflections }) => {
    stats.moments += 1;
    const assetOf = (perspective: Perspective) => perspective.mediaAssetId ? source.assets.get(perspective.mediaAssetId) : undefined;
    const photoPerspectives = perspectives.filter((item) => {
      const asset = assetOf(item);
      return asset?.type === 'photo' && availability.photos.has(asset.id);
    });
    const photoIds = unique(photoPerspectives.map((item) => item.mediaAssetId!));
    const narration = options.includeNarration && moment.narrationMediaAssetId
      ? availability.durations.get(moment.narrationMediaAssetId) : undefined;

    const photos: Draft[] = [];
    const texts: Draft[] = [];
    const seenPhotos = new Set<string>();
    perspectives.forEach((perspective) => {
      if (perspective.type === 'text' && options.includeText && perspective.content.trim()) {
        const pages = paginateText(perspective.content, TEXT_PAGE_CHARS, { flatten: true });
        const author = personName(source, perspective.authorId);
        const photoId = photoIds.length ? photoIds[texts.length % photoIds.length] : undefined;
        pages.forEach((text, index) => texts.push({
          id: `text:${perspective.id}:${index}`, kind: 'text', momentId: moment.id, transition: 'fade',
          duration: readingSeconds(text), label: 'Рассказ: ' + author + (pages.length > 1 ? ` (${index + 1}/${pages.length})` : ''),
          text, author, page: index + 1, pages: pages.length, photoId
        }));
        stats.texts += 1;
        filmNarrators.push(author);
      }
      const asset = assetOf(perspective);
      if (perspective.type === 'photo' && asset && photoIds.includes(asset.id) && !seenPhotos.has(asset.id)) {
        seenPhotos.add(asset.id);
        const author = personName(source, perspective.authorId);
        photos.push({
          id: 'photo:' + perspective.id, kind: 'photo', momentId: moment.id, transition: 'fade', duration: PHOTO_SECONDS,
          label: 'Фото: ' + truncate(perspective.caption || perspective.content || asset.alt || 'без подписи', 40),
          assetId: asset.id, caption: perspective.caption || perspective.content || '', author
        });
        stats.photos += 1;
        filmNarrators.push(author);
      }
    });
    // The primary story comes first, its photos follow: the voice-over reads over both.
    const group: Draft[] = [...texts, ...photos];

    const momentScene: Draft = {
      id: 'moment:' + moment.id, kind: 'moment', momentId: moment.id, transition: 'page',
      duration: Math.min(7, 4.5 + moment.summary.length / 60), label: moment.title, title: moment.title,
      date: moment.occurredAt ? formatDate(moment.occurredAt) : '', summary: moment.summary,
      narrators: unique(perspectives.map((item) => item.authorId ? personName(source, item.authorId) : '')),
      narrated: narration !== undefined
    };
    group.unshift(momentScene);

    if (narration !== undefined) {
      const span = group.reduce((sum, item) => sum + item.duration, 0);
      const needed = narration + NARRATION_DELAY + 0.8;
      if (span < needed) {
        const factor = needed / span;
        group.forEach((item) => { item.duration = Math.round(item.duration * factor * 100) / 100; });
      }
    }
    const placed = group.map(place);
    if (narration !== undefined) {
      const start = placed[0].start + NARRATION_DELAY;
      cues.push({ assetId: moment.narrationMediaAssetId!, kind: 'narration', start, duration: narration });
      quietSpans.push({ start, end: start + narration });
      stats.narrations += 1;
    }

    if (options.includeVoices) perspectives.forEach((perspective) => {
      const asset = assetOf(perspective);
      const seconds = asset ? availability.durations.get(asset.id) : undefined;
      if (perspective.type !== 'audio' || asset?.type !== 'audio' || seconds === undefined) return;
      const person = perspective.authorId ? source.people.get(perspective.authorId) : undefined;
      const author = personName(source, perspective.authorId);
      const scene = place({
        id: 'voice:' + perspective.id, kind: 'voice', momentId: moment.id, transition: 'fade',
        duration: seconds + VOICE_PADDING * 2, assetId: asset.id, audioOffset: VOICE_PADDING, label: 'Голос: ' + author,
        author, initials: person?.initials ?? '♪', color: person?.avatarColor ?? '#9b5038',
        caption: perspective.caption || perspective.content || 'Голосовая запись', photoIds
      });
      cues.push({ assetId: asset.id, kind: 'voice', start: scene.start + VOICE_PADDING, duration: seconds });
      quietSpans.push({ start: scene.start + VOICE_PADDING, end: scene.start + VOICE_PADDING + seconds });
      stats.voices += 1;
      filmNarrators.push(author);
    });

    if (options.includeVideos) perspectives.forEach((perspective) => {
      const asset = assetOf(perspective);
      const seconds = asset ? availability.durations.get(asset.id) : undefined;
      if (perspective.type !== 'video' || asset?.type !== 'video' || seconds === undefined) return;
      const author = personName(source, perspective.authorId);
      const length = Math.min(seconds, MAX_VIDEO_SECONDS);
      const scene = place({
        id: 'video:' + perspective.id, kind: 'video', momentId: moment.id, transition: 'fade',
        duration: length + 0.8, assetId: asset.id, videoOffset: 0.4, label: 'Видео: ' + author, author,
        caption: perspective.caption || perspective.content || ''
      });
      quietSpans.push({ start: scene.start + 0.4, end: scene.start + 0.4 + length });
      stats.videos += 1;
      filmNarrators.push(author);
    });

    if (options.includeReflections && reflections.length) {
      for (let index = 0; index < reflections.length; index += 3) {
        const group = reflections.slice(index, index + 3);
        let at = 1.2;
        const notes = group.map((reflection) => {
          const text = truncate(reflection.text, 220);
          const note = { text, author: personName(source, reflection.authorId), appearAt: at };
          at += readingSeconds(text, { min: 2.6, max: 7 });
          return note;
        });
        place({
          id: `reflections:${moment.id}:${index}`, kind: 'reflections', momentId: moment.id, transition: 'fade',
          duration: Math.round((at + 1.4) * 10) / 10, label: 'Отклики: ' + notes.map((note) => note.author).join(', '),
          momentTitle: moment.title, notes
        });
        stats.reflections += group.length;
      }
    }
  });

  place({
    id: 'finale:' + source.chapter.id, kind: 'finale', duration: FINALE_SECONDS, transition: 'page', label: 'Финал',
    bookTitle: source.bookTitle, chapterLabel: label, chapterTitle: source.chapter.title,
    narrators: unique(filmNarrators.filter((name) => name !== 'Без указания автора'))
  });

  return { format: options.format, scenes, cues, quietSpans: mergeSpans(quietSpans), duration: cursor, stats };
}

export function mergeSpans(spans: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  sorted.forEach((span) => {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end + 1.5) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  });
  return merged;
}

/** Index of the scene playing at `time` (the last scene that has started). */
export function sceneIndexAt(timeline: Pick<FilmTimeline, 'scenes'>, time: number): number {
  const { scenes } = timeline;
  let low = 0;
  let high = scenes.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (scenes[middle].start <= time) low = middle;
    else high = middle - 1;
  }
  return low;
}

export interface MusicPoint { time: number; level: number }

/** Background music level over time: fades in, steps back under voices, fades out. */
export function musicEnvelope(timeline: Pick<FilmTimeline, 'quietSpans' | 'duration'>, base = 1, ducked = 0.3): MusicPoint[] {
  const points: MusicPoint[] = [{ time: 0, level: 0 }, { time: Math.min(2.5, timeline.duration / 3), level: base }];
  timeline.quietSpans.forEach(({ start, end }) => {
    points.push({ time: Math.max(0, start - 0.6), level: base }, { time: start, level: ducked });
    points.push({ time: end, level: ducked }, { time: end + 1, level: base });
  });
  const fadeStart = Math.max(0, timeline.duration - 3.5);
  const kept = points.filter((point) => point.time < fadeStart).sort((a, b) => a.time - b.time);
  kept.push({ time: fadeStart, level: levelAt(kept, fadeStart) }, { time: timeline.duration, level: 0 });
  return kept;
}

export function levelAt(points: MusicPoint[], time: number): number {
  if (!points.length) return 0;
  if (time <= points[0].time) return points[0].level;
  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    if (time <= next.time) {
      const previous = points[index - 1];
      const span = next.time - previous.time;
      return span <= 0 ? next.level : previous.level + (next.level - previous.level) * ((time - previous.time) / span);
    }
  }
  return points[points.length - 1].level;
}
