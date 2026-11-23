import type { Chapter, MediaAsset, Moment, Person, Perspective, Reflection } from '../../data/types';

export { chronologicalMoments } from '../../data/library';
import { formatDate, truncate } from '../format';
import { chapterLabel, paginateText, readingSeconds } from './text';
import { mediaCaption, perspectiveAssets } from '../../data/mediaRefs';
import type { MusicStyle } from './music';
import { stripStoryMarkup } from '../storyMarkup';

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
  /** A built-in style, or the chapter's own music file. */
  musicStyle: MusicStyle | 'custom';
  /** The chapter's own music starts again when it ends; otherwise the rest of the film is quiet. */
  musicLoop: boolean;
  format: FilmFormat;
}

export const DEFAULT_FILM_OPTIONS: FilmOptions = {
  includeText: true,
  includeVoices: true,
  includeNarration: true,
  includeVideos: true,
  includeReflections: true,
  music: true,
  musicStyle: 'warm',
  musicLoop: true,
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
  /** The photo beside the words when this page opens. */
  photoId?: string;
  /**
   * The story's photos, shown in turn over the whole story, apart from its pages:
   * each for an equal share of the story's time, crossfading wherever a page turns.
   */
  photoIds?: string[];
  /** Seconds of the story before this page, and the story's whole length: where the photos are. */
  photoOffset?: number;
  photoSpan?: number;
  /** The story the photos belong to: the same photo looks the same on every page. */
  photoKey?: string;
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
  notes: { text: string; author: string; appearAt: number; voiced?: boolean }[];
  /** The reflections behind the notes, in the same order. */
  reflectionIds?: string[];
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
  source.moments.forEach(({ moment, perspectives, reflections }) => {
    reflections.forEach((reflection) => {
      const voice = reflection.mediaAssetId ? source.assets.get(reflection.mediaAssetId) : undefined;
      if (isAttachedMedia(voice) && voice.type === 'audio') audio.set(voice.id, voice);
    });
    perspectives.forEach((perspective) => {
      perspectiveAssets(perspective, source.assets).forEach((asset) => {
        if (!isAttachedMedia(asset)) return;
        if (asset.type === 'photo') photos.set(asset.id, asset);
        if (asset.type === 'audio' && (perspective.type === 'audio' || asset.id !== perspective.mediaAssetId)) audio.set(asset.id, asset);
        if (asset.type === 'video' && (perspective.type === 'video' || asset.id !== perspective.mediaAssetId)) videos.set(asset.id, asset);
      });
    });
    [moment.narrationMediaAssetId, ...Object.values(moment.narrations ?? {})].forEach((id) => {
      const narration = id ? source.assets.get(id) : undefined;
      if (isAttachedMedia(narration) && narration.type === 'audio') audio.set(narration.id, narration);
    });
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
    // A story's own file (older stories) keeps the scene id it always had; attached files add their id.
    const sceneId = (perspective: Perspective, asset: MediaAsset) => asset.id === perspective.mediaAssetId ? perspective.id : perspective.id + ':' + asset.id;
    // An older story shows its one file only as its own type; a story with attachments shows all of them.
    const filesOf = (perspective: Perspective, type: MediaAsset['type']) => perspectiveAssets(perspective, source.assets)
      .filter((asset) => asset.type === type && (asset.id !== perspective.mediaAssetId || perspective.type === type || type === 'photo'));
    const photoIds = unique(perspectives.flatMap((item) => filesOf(item, 'photo')).filter((asset) => availability.photos.has(asset.id)).map((asset) => asset.id));
    // The photos that go with a story: its own, then those of the same author's other views; without any, the moment's.
    const photosFor = (perspective: Perspective) => {
      const shown = (item: Perspective) => filesOf(item, 'photo').filter((asset) => availability.photos.has(asset.id)).map((asset) => asset.id);
      const mine = unique([...shown(perspective),
        ...perspectives.filter((item) => item.id !== perspective.id && perspective.authorId && item.authorId === perspective.authorId).flatMap(shown)]);
      return mine.length ? mine : photoIds;
    };
    // The photos run over the whole story apart from its pages: once the pages have their final lengths, each page
    // learns where in the story it starts, so a photo goes on unchanged when a page turns.
    const timePhotos = (drafts: Draft[]) => {
      const stories = new Map<string, Draft[]>();
      drafts.forEach((draft) => {
        if (draft.kind !== 'text' || !draft.photoKey) return;
        stories.set(draft.photoKey, [...(stories.get(draft.photoKey) ?? []), draft]);
      });
      stories.forEach((pages) => {
        const span = pages.reduce((sum, page) => sum + page.duration, 0);
        let offset = 0;
        pages.forEach((page) => {
          if (page.kind !== 'text') return;
          page.photoOffset = Math.round(offset * 100) / 100;
          page.photoSpan = Math.round(span * 100) / 100;
          const ids = page.photoIds ?? [];
          page.photoId = ids.length ? ids[Math.min(ids.length - 1, Math.floor(offset / (span / ids.length)))] : undefined;
          offset += page.duration;
        });
      });
    };
    const narration = options.includeNarration && moment.narrationMediaAssetId
      ? availability.durations.get(moment.narrationMediaAssetId) : undefined;

    // Views with a voice-over of their own get their own stretch of the film after the moment.
    const viewNarration = (perspective: Perspective) => {
      const assetId = options.includeNarration ? moment.narrations?.[perspective.id] : undefined;
      const seconds = assetId ? availability.durations.get(assetId) : undefined;
      return assetId && seconds !== undefined ? { assetId, seconds } : undefined;
    };
    const narratedViews = perspectives.filter((item) => item.id !== moment.primaryPerspectiveId && viewNarration(item));

    const photos: Draft[] = [];
    const texts: Draft[] = [];
    const seenPhotos = new Set<string>();
    // A story told in words and aloud: its voice plays while its pages are on screen, not after them.
    const pairs: { firstScene: string; voices: { assetId: string; seconds: number }[] }[] = [];
    const paired = new Set<string>();
    // Recordings shown as scenes of their own: their sound starts with the scene.
    const alone: { sceneId: string; assetId: string; seconds: number }[] = [];
    perspectives.forEach((perspective) => {
      if (narratedViews.includes(perspective)) return;
      const told = perspective.type === 'text' || perspective.type === 'audio';
      if (told && options.includeText && perspective.content.trim()) {
        const pages = paginateText(stripStoryMarkup(perspective.content), TEXT_PAGE_CHARS);
        const author = personName(source, perspective.authorId);
        const pool = photosFor(perspective);
        const own = pages.map((text, index): Draft => ({
          id: `text:${perspective.id}:${index}`, kind: 'text', momentId: moment.id, transition: 'fade',
          duration: readingSeconds(text), label: 'Рассказ: ' + author + (pages.length > 1 ? ` (${index + 1}/${pages.length})` : ''),
          text, author, page: index + 1, pages: pages.length, photoIds: pool, photoKey: 'text:' + perspective.id
        }));
        // With a voice-over for the whole moment, a story's own voice keeps its separate scene.
        const voices = options.includeVoices && narration === undefined
          ? filesOf(perspective, 'audio').flatMap((asset) => {
            const seconds = availability.durations.get(asset.id);
            return seconds === undefined ? [] : [{ assetId: asset.id, seconds }];
          }) : [];
        if (voices.length && own.length) {
          const needed = voices.reduce((sum, voice) => sum + voice.seconds + VOICE_PADDING, VOICE_PADDING);
          const span = own.reduce((sum, item) => sum + item.duration, 0);
          if (span < needed) own.forEach((item) => { item.duration = Math.round(item.duration * (needed / span) * 100) / 100; });
          pairs.push({ firstScene: own[0].id, voices });
          voices.forEach((voice) => paired.add(voice.assetId));
        }
        texts.push(...own);
        stats.texts += 1;
        filmNarrators.push(author);
      }
      // A recording without its words on screen is a scene of its own, in the story's place: before the photos.
      if (options.includeVoices && narration === undefined) filesOf(perspective, 'audio').forEach((asset) => {
        const seconds = availability.durations.get(asset.id);
        if (seconds === undefined || paired.has(asset.id)) return;
        const person = perspective.authorId ? source.people.get(perspective.authorId) : undefined;
        const author = personName(source, perspective.authorId);
        texts.push({
          id: 'voice:' + sceneId(perspective, asset), kind: 'voice', momentId: moment.id, transition: 'fade',
          duration: seconds + VOICE_PADDING * 2, assetId: asset.id, audioOffset: VOICE_PADDING, label: 'Голос: ' + author,
          author, initials: person?.initials ?? '♪', color: person?.avatarColor ?? '#9b5038',
          caption: perspective.caption || (perspective.type === 'audio' ? perspective.content : '') || 'Голосовая запись', photoIds: photosFor(perspective)
        });
        alone.push({ sceneId: 'voice:' + sceneId(perspective, asset), assetId: asset.id, seconds });
        filmNarrators.push(author);
      });
      filesOf(perspective, 'photo').forEach((asset) => {
        if ((perspective.type !== 'photo' && asset.id === perspective.mediaAssetId) || !photoIds.includes(asset.id) || seenPhotos.has(asset.id)) return;
        seenPhotos.add(asset.id);
        const author = personName(source, perspective.authorId);
        const caption = mediaCaption(asset, perspective.content) || (asset.id === perspective.mediaAssetId || perspective.type === 'photo' ? perspective.caption || perspective.content || '' : perspective.caption || '');
        photos.push({
          id: 'photo:' + sceneId(perspective, asset), kind: 'photo', momentId: moment.id, transition: 'fade', duration: PHOTO_SECONDS,
          label: 'Фото: ' + truncate(caption || asset.alt || 'без подписи', 40),
          assetId: asset.id, caption, author
        });
        stats.photos += 1;
        filmNarrators.push(author);
      });
    });
    // The stories come first (in words or aloud), their photos follow: the voice-over reads over both.
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
    timePhotos(group);
    const placed = group.map(place);
    alone.forEach(({ sceneId: id, assetId, seconds }) => {
      const scene = placed.find((item) => item.id === id);
      if (!scene) return;
      cues.push({ assetId, kind: 'voice', start: scene.start + VOICE_PADDING, duration: seconds });
      quietSpans.push({ start: scene.start + VOICE_PADDING, end: scene.start + VOICE_PADDING + seconds });
      stats.voices += 1;
    });
    pairs.forEach(({ firstScene, voices }) => {
      let at = (placed.find((scene) => scene.id === firstScene)?.start ?? placed[0].start) + VOICE_PADDING;
      voices.forEach((voice) => {
        cues.push({ assetId: voice.assetId, kind: 'voice', start: at, duration: voice.seconds });
        quietSpans.push({ start: at, end: at + voice.seconds });
        stats.voices += 1;
        at += voice.seconds + VOICE_PADDING;
      });
    });
    if (narration !== undefined) {
      const start = placed[0].start + NARRATION_DELAY;
      cues.push({ assetId: moment.narrationMediaAssetId!, kind: 'narration', start, duration: narration });
      quietSpans.push({ start, end: start + narration });
      stats.narrations += 1;
    }

    narratedViews.forEach((perspective) => {
      const voiceOver = viewNarration(perspective)!;
      const author = personName(source, perspective.authorId);
      const drafts: Draft[] = [];
      const told = perspective.type === 'text' || perspective.type === 'audio';
      if (told && options.includeText && perspective.content.trim()) {
        const pages = paginateText(stripStoryMarkup(perspective.content), TEXT_PAGE_CHARS);
        const pool = photosFor(perspective);
        pages.forEach((text, index) => drafts.push({
          id: `text:${perspective.id}:${index}`, kind: 'text', momentId: moment.id, transition: 'fade',
          duration: readingSeconds(text), label: 'Взгляд: ' + author + (pages.length > 1 ? ` (${index + 1}/${pages.length})` : ''),
          text, author, page: index + 1, pages: pages.length, photoIds: pool, photoKey: 'text:' + perspective.id
        }));
        stats.texts += 1;
      }
      filesOf(perspective, 'photo').forEach((asset) => {
        if (!availability.photos.has(asset.id) || seenPhotos.has(asset.id)) return;
        seenPhotos.add(asset.id);
        const caption = mediaCaption(asset, perspective.content) || (asset.id === perspective.mediaAssetId || perspective.type === 'photo' ? perspective.caption || perspective.content || '' : perspective.caption || '');
        drafts.push({ id: 'photo:' + sceneId(perspective, asset), kind: 'photo', momentId: moment.id, transition: 'fade', duration: PHOTO_SECONDS,
          label: 'Фото: ' + truncate(caption || 'без подписи', 40), assetId: asset.id, caption, author });
        stats.photos += 1;
      });
      if (!drafts.length) {
        // Nothing to show of its own: the view is heard over the moment's photos, like a voice.
        const person = perspective.authorId ? source.people.get(perspective.authorId) : undefined;
        drafts.push({ id: 'voice:' + perspective.id + ':narration', kind: 'voice', momentId: moment.id, transition: 'fade', duration: 1,
          assetId: voiceOver.assetId, audioOffset: NARRATION_DELAY, label: 'Озвучка: ' + author, author,
          initials: person?.initials ?? '♪', color: person?.avatarColor ?? '#9b5038', caption: stripStoryMarkup(perspective.caption || perspective.content || ''), photoIds: photosFor(perspective) });
      }
      const needed = voiceOver.seconds + NARRATION_DELAY + 0.8;
      const span = drafts.reduce((sum, item) => sum + item.duration, 0);
      if (span < needed) drafts.forEach((item) => { item.duration = Math.round(item.duration * (needed / span) * 100) / 100; });
      timePhotos(drafts);
      const first = drafts.map(place)[0];
      const start = first.start + NARRATION_DELAY;
      cues.push({ assetId: voiceOver.assetId, kind: 'narration', start, duration: voiceOver.seconds });
      quietSpans.push({ start, end: start + voiceOver.seconds });
      stats.narrations += 1;
      filmNarrators.push(author);
      // Read aloud by someone, the view's own recording stays silent.
      filesOf(perspective, 'audio').forEach((asset) => paired.add(asset.id));
    });


    if (options.includeVideos) perspectives.forEach((perspective) => filesOf(perspective, 'video').forEach((asset) => {
      const seconds = availability.durations.get(asset.id);
      if (seconds === undefined) return;
      const author = personName(source, perspective.authorId);
      const length = Math.min(seconds, MAX_VIDEO_SECONDS);
      const scene = place({
        id: 'video:' + sceneId(perspective, asset), kind: 'video', momentId: moment.id, transition: 'fade',
        duration: length + 0.8, assetId: asset.id, videoOffset: 0.4, label: 'Видео: ' + author, author,
        caption: perspective.caption || perspective.content || ''
      });
      quietSpans.push({ start: scene.start + 0.4, end: scene.start + 0.4 + length });
      stats.videos += 1;
      filmNarrators.push(author);
    }));

    if (options.includeReflections && reflections.length) {
      for (let index = 0; index < reflections.length; index += 3) {
        const group = reflections.slice(index, index + 3);
        let at = 1.2;
        // A reflection told aloud is heard when its note appears; the note stays until the voice ends.
        const voices: { at: number; assetId: string; seconds: number; kind: 'voice' | 'narration' }[] = [];
        const notes = group.map((reflection) => {
          // A voice-over of the reflection is read instead of its own recording.
          const narrationId = options.includeNarration ? moment.narrations?.[reflection.id] : undefined;
          const narrated = narrationId ? availability.durations.get(narrationId) : undefined;
          const ownSeconds = options.includeVoices && reflection.mediaAssetId ? availability.durations.get(reflection.mediaAssetId) : undefined;
          const heard = narrated !== undefined ? { assetId: narrationId!, seconds: narrated, kind: 'narration' as const }
            : ownSeconds !== undefined ? { assetId: reflection.mediaAssetId!, seconds: ownSeconds, kind: 'voice' as const } : undefined;
          const seconds = heard?.seconds;
          const text = truncate(reflection.text, 220) || (seconds !== undefined ? 'Отклик голосом' : '');
          const note = { text, author: personName(source, reflection.authorId), appearAt: at, voiced: seconds !== undefined };
          if (heard) voices.push({ at: at + 0.3, ...heard });
          at += Math.max(readingSeconds(text, { min: 2.6, max: 7 }), seconds !== undefined ? seconds + 0.9 : 0);
          return note;
        });
        const scene = place({
          id: `reflections:${moment.id}:${index}`, kind: 'reflections', momentId: moment.id, transition: 'fade',
          duration: Math.round((at + 1.4) * 10) / 10, label: 'Отклики: ' + notes.map((note) => note.author).join(', '),
          momentTitle: moment.title, notes, reflectionIds: group.map((reflection) => reflection.id)
        });
        voices.forEach((voice) => {
          cues.push({ assetId: voice.assetId, kind: voice.kind, start: scene.start + voice.at, duration: voice.seconds });
          quietSpans.push({ start: scene.start + voice.at, end: scene.start + voice.at + voice.seconds });
          if (voice.kind === 'narration') stats.narrations += 1;
          else stats.voices += 1;
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

/**
 * How long each part of the film lasts without voice-overs: the moment (title,
 * stories and photos), each view and each reflection's note. A voice-over that
 * is longer stretches its part to fit; a shorter one leaves the rest without it.
 */
export function narrationSpans(timeline: Pick<FilmTimeline, 'scenes'>): Map<string, number> {
  const spans = new Map<string, number>();
  const add = (key: string, seconds: number) => spans.set(key, Math.round(((spans.get(key) ?? 0) + seconds) * 10) / 10);
  timeline.scenes.forEach((scene) => {
    if (!scene.momentId) return;
    if (scene.kind === 'moment' || scene.kind === 'text' || scene.kind === 'photo') add(scene.momentId, scene.duration);
    // A view's own pages, photos and recording, by the view's id at the start of the scene id.
    const view = /^(?:text|photo|voice|video):([^:]+)/.exec(scene.id)?.[1];
    if (view && scene.kind !== 'moment') add(view, scene.duration);
    if (scene.kind === 'reflections') {
      const ids = scene.reflectionIds ?? [];
      scene.notes.forEach((note, index) => {
        const next = scene.notes[index + 1]?.appearAt ?? scene.duration - 1.4;
        if (ids[index]) add(ids[index], next - note.appearAt);
      });
    }
  });
  return spans;
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
