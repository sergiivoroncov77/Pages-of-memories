import type { AppSnapshot, MediaAsset, Perspective, Reflection } from './types';

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

/** Every media id something in the snapshot still uses: stories, reflections, voice-overs, covers and draft answers. */
export function referencedMediaIds(snapshot: Pick<AppSnapshot, 'perspectives' | 'reflections' | 'moments' | 'books' | 'drafts'>): Set<string> {
  return new Set([
    ...storyMediaIds(snapshot.perspectives, snapshot.reflections),
    ...snapshot.moments.map((item) => item.narrationMediaAssetId),
    ...snapshot.books.map((item) => item.coverMediaAssetId),
    ...snapshot.drafts.map((item) => item.audioMediaAssetId)
  ].filter((id): id is string => Boolean(id)));
}
