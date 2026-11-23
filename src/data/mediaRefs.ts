import type { AppSnapshot, MediaAsset, Moment, Perspective, Reflection } from './types';

/**
 * Every file a story uses: its own recording or photo (older stories keep one
 * in `mediaAssetId`) and the files attached next to its words.
 */
export function perspectiveMediaIds(perspective: Pick<Perspective, 'mediaAssetId' | 'attachmentIds'>): string[] {
  return [...new Set([perspective.mediaAssetId, ...(perspective.attachmentIds ?? [])].filter((id): id is string => Boolean(id)))];
}

/** The voice of a reflection, when it was told aloud. */
export function reflectionMediaIds(reflection: Pick<Reflection, 'mediaAssetId'>): string[] {
  return reflection.mediaAssetId ? [reflection.mediaAssetId] : [];
}

/** Files of a story in the order they are shown, skipping files that are not on this device or in the book. */
export function perspectiveAssets(perspective: Pick<Perspective, 'mediaAssetId' | 'attachmentIds'>,
  assets: ReadonlyMap<string, MediaAsset> | readonly MediaAsset[]): MediaAsset[] {
  const find = (id: string) => Array.isArray(assets) ? (assets as readonly MediaAsset[]).find((asset) => asset.id === id)
    : (assets as ReadonlyMap<string, MediaAsset>).get(id);
  return perspectiveMediaIds(perspective).map(find).filter((asset): asset is MediaAsset => Boolean(asset));
}

/** Every media id that stories and reflections in the given list reference. */
export function storyMediaIds(perspectives: readonly Perspective[], reflections: readonly Reflection[] = []): string[] {
  return [...perspectives.flatMap(perspectiveMediaIds), ...reflections.flatMap(reflectionMediaIds)];
}

/** The voice-overs of a moment: its own and those of its views and reflections. */
export function momentMediaIds(moment: Pick<Moment, 'narrationMediaAssetId' | 'narrations'>): string[] {
  return [moment.narrationMediaAssetId, ...Object.values(moment.narrations ?? {})].filter((id): id is string => Boolean(id));
}

/** Every media id something in the snapshot still uses: stories, reflections, voice-overs, covers and draft answers. */
export function referencedMediaIds(snapshot: Pick<AppSnapshot, 'perspectives' | 'reflections' | 'moments' | 'books' | 'drafts'>): Set<string> {
  return new Set([
    ...storyMediaIds(snapshot.perspectives, snapshot.reflections),
    ...snapshot.moments.flatMap(momentMediaIds),
    ...snapshot.books.map((item) => item.coverMediaAssetId),
    ...snapshot.drafts.map((item) => item.audioMediaAssetId)
  ].filter((id): id is string => Boolean(id)));
}

/** Names the app gave files by itself before they had captions: a recording's title, a file name. */
const AUTOMATIC_NAME = /^(Голос: |Озвучка |Отклик голосом|Ответ на вопрос «)|\.(jpe?g|png|webp|gif|avif|heic|mp3|m4a|aac|ogg|oga|opus|wav|weba|webm|mp4|m4v|mov)$/i;

/** The longest caption: a line or two under a photo. */
export const MAX_CAPTION_CHARS = 300;

const plain = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The words written under a file: «тётя Нина и тётя Лена, 1978». A name the
 * app gave the file by itself is no caption, nor the story's own words, which
 * older versions kept with a recording.
 */
export function mediaCaption(asset: Pick<MediaAsset, 'alt' | 'fileName'> | undefined, story = ''): string {
  const text = asset?.alt?.trim() ?? '';
  if (!text || text.length > MAX_CAPTION_CHARS || text === asset?.fileName || AUTOMATIC_NAME.test(text)) return '';
  const words = plain(story);
  return words && words.startsWith(plain(text).slice(0, 60)) && plain(text).length >= 12 ? '' : text;
}

/** The snapshot with new captions for these files; an empty one removes the caption. */
export function captionMediaAssets<T extends Pick<AppSnapshot, 'mediaAssets'>>(snapshot: T, captions: Readonly<Record<string, string>>): T {
  const ids = Object.keys(captions);
  if (!ids.length) return snapshot;
  return { ...snapshot, mediaAssets: snapshot.mediaAssets.map((asset) => {
    if (!(asset.id in captions)) return asset;
    const alt = captions[asset.id].trim().slice(0, MAX_CAPTION_CHARS) || undefined;
    if ((alt ?? '') === mediaCaption(asset)) return asset;
    return { ...asset, alt };
  }) };
}
