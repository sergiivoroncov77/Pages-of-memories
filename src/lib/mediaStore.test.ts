import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachMemoryAudio, ensureMemoryMoments, publishMemoryToSnapshot, removeUnusedMediaAsset } from '../data/mutations';
import { loadSnapshotResult, parseSnapshotImport, persistSnapshot } from '../data/repository';
import { seedSnapshot } from '../data/seed';
import type { AppSnapshot, MediaAsset } from '../data/types';
import { buildBookHtml } from './bookExport';
import {
  applyMediaMigration,
  baseMimeType,
  blobToDataUrl,
  createMemoryMediaStore,
  dataUrlToBlob,
  inlineStoredMedia,
  migrateSnapshotMedia,
  moveInlineMediaToStore,
  pruneMediaStore,
  storedMediaUrl,
  type MediaBlobStore
} from './mediaStore';
import { estimateStorageBytes, MAX_STORAGE_BYTES, STORAGE_KEY } from './storage';

const AUDIO_BYTES = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0xff, 0x10, 0x80]);
const AUDIO_DATA_URL = 'data:audio/webm;base64,GkXfowD/EIA=';
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

function createLocalStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: createLocalStorage() });
});

afterEach(() => vi.unstubAllGlobals());

function seed(): AppSnapshot {
  return ensureMemoryMoments(structuredClone(seedSnapshot));
}

/** A seed snapshot with a narrator's photo and recording attached to the first moment. */
function snapshotWithMedia(photoUrl = PNG_DATA_URL, audioUrl = AUDIO_DATA_URL): AppSnapshot {
  const snapshot = seed();
  const moment = snapshot.moments[0];
  const authorId = snapshot.people[0].id;
  const assets: MediaAsset[] = [
    { id: 'media_photo', type: 'photo', url: photoUrl, mimeType: 'image/png', fileName: 'porch.png', createdAt: '2026-10-01T10:00:00.000Z' },
    { id: 'media_voice', type: 'audio', url: audioUrl, mimeType: 'audio/webm', fileName: 'voice.webm', durationSeconds: 42, createdAt: '2026-10-01T10:00:00.000Z' }
  ];
  return {
    ...snapshot,
    mediaAssets: [...snapshot.mediaAssets, ...assets],
    perspectives: [
      ...snapshot.perspectives,
      { id: 'perspective_photo', momentId: moment.id, authorId, type: 'photo', content: 'Крыльцо', mediaAssetId: 'media_photo', createdAt: '2026-10-01T10:00:00.000Z', isPrimary: false },
      { id: 'perspective_voice', momentId: moment.id, authorId, type: 'audio', content: '', caption: 'Голосовая запись ответа', mediaAssetId: 'media_voice', createdAt: '2026-10-01T10:00:00.000Z', isPrimary: false }
    ]
  };
}

function withDraft(snapshot: AppSnapshot, audioMediaAssetId: string): AppSnapshot {
  const question = snapshot.questions.find((item) => !snapshot.memories.some((memory) => memory.questionId === item.id))!;
  return {
    ...snapshot,
    drafts: [{
      id: 'draft_voice', personId: question.personId, questionId: question.id, transcript: '', durationSeconds: 42, tags: [],
      photoUrl: '', photoAlt: '', audioMediaAssetId, createdAt: '2026-10-01T10:00:00.000Z', status: 'draft'
    }]
  };
}

async function bytes(blob: Blob | undefined) {
  return blob ? [...new Uint8Array(await blob.arrayBuffer())] : undefined;
}

describe('data URL conversion', () => {
  it('round-trips binary media through base64 without codec parameters', async () => {
    const blob = dataUrlToBlob('data:audio/webm;codecs=opus;base64,GkXfowD/EIA=');
    expect(blob?.type).toBe('audio/webm');
    expect(await bytes(blob!)).toEqual([...AUDIO_BYTES]);
    expect(await blobToDataUrl(new Blob([AUDIO_BYTES], { type: 'audio/webm;codecs=opus' }))).toBe(AUDIO_DATA_URL);
  });

  it('handles media larger than one String.fromCharCode chunk', async () => {
    const large = new Uint8Array(100_000).map((_, index) => index % 251);
    const url = await blobToDataUrl(new Blob([large]), 'audio/mp4');
    expect(url.startsWith('data:audio/mp4;base64,')).toBe(true);
    expect(await bytes(dataUrlToBlob(url)!)).toEqual([...large]);
  });

  it('rejects anything that is not a base64 data URL', () => {
    expect(dataUrlToBlob('/demo/photo-porch.svg')).toBeNull();
    expect(dataUrlToBlob('data:text/plain,hello')).toBeNull();
    expect(baseMimeType(' Audio/MP4; codecs="mp4a.40.2"')).toBe('audio/mp4');
  });
});

describe('migration of inline media', () => {
  it('moves data URLs into the blob store and keeps only references in the snapshot', async () => {
    const store = createMemoryMediaStore();
    const { snapshot, failed } = await migrateSnapshotMedia(snapshotWithMedia(), store);
    expect(failed).toEqual([]);
    const voice = snapshot.mediaAssets.find((asset) => asset.id === 'media_voice')!;
    expect(voice).toMatchObject({ url: storedMediaUrl('media_voice'), mimeType: 'audio/webm', durationSeconds: 42, sizeBytes: AUDIO_BYTES.length });
    expect(await bytes(store.blobs.get('media_voice'))).toEqual([...AUDIO_BYTES]);
    expect(snapshot.mediaAssets.some((asset) => asset.url.startsWith('data:'))).toBe(false);
    // Bundled demo media stays where it is.
    expect(snapshot.mediaAssets.filter((asset) => asset.url.startsWith('/demo/')).length)
      .toBe(seed().mediaAssets.filter((asset) => asset.url.startsWith('/demo/')).length);
  });

  it('keeps the snapshot under the localStorage limit once large media is moved out', async () => {
    const big = await blobToDataUrl(new Blob([new Uint8Array(3 * 1024 * 1024)]), 'audio/webm');
    const inline = snapshotWithMedia(PNG_DATA_URL, big);
    expect(persistSnapshot(inline)).toMatchObject({ ok: false, error: { kind: 'quota' } });
    const { snapshot } = await migrateSnapshotMedia(inline, createMemoryMediaStore());
    expect(estimateStorageBytes(JSON.stringify(snapshot))).toBeLessThan(MAX_STORAGE_BYTES);
    expect(persistSnapshot(snapshot)).toEqual({ ok: true });
  });

  it('migrates a stored legacy snapshot that the repository loads cleanly afterwards', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotWithMedia()));
    const loaded = loadSnapshotResult();
    expect(loaded.warning).toBeUndefined();
    const store = createMemoryMediaStore();
    const { snapshot } = await migrateSnapshotMedia(loaded.snapshot, store);
    expect(persistSnapshot(snapshot)).toEqual({ ok: true });

    const reloaded = loadSnapshotResult();
    expect(reloaded.warning).toBeUndefined();
    expect(reloaded.snapshot.mediaAssets.find((asset) => asset.id === 'media_voice')?.url).toBe('idb:media_voice');
    expect(reloaded.snapshot.perspectives.find((item) => item.id === 'perspective_voice')?.mediaAssetId).toBe('media_voice');
  });

  it('does not overwrite an asset that changed while blobs were being written', async () => {
    const original = snapshotWithMedia();
    const { migrated } = await moveInlineMediaToStore(original.mediaAssets, createMemoryMediaStore());
    const changed = { ...original, mediaAssets: original.mediaAssets.map((asset) => asset.id === 'media_photo' ? { ...asset, url: 'data:image/png;base64,AAAA' } : asset) };
    const result = applyMediaMigration(changed, original.mediaAssets, migrated);
    expect(result.mediaAssets.find((asset) => asset.id === 'media_photo')?.url).toBe('data:image/png;base64,AAAA');
    expect(result.mediaAssets.find((asset) => asset.id === 'media_voice')?.url).toBe('idb:media_voice');
  });

  it('leaves media inline when the blob store refuses a write', async () => {
    const full: MediaBlobStore = {
      ...createMemoryMediaStore(),
      put: async () => { throw new DOMException('Full', 'QuotaExceededError'); }
    };
    const original = snapshotWithMedia();
    const { snapshot, failed } = await migrateSnapshotMedia(original, full);
    expect(failed.sort()).toEqual(['media_photo', 'media_voice']);
    expect(snapshot).toBe(original);
  });
});

describe('device media references', () => {
  it('accepts an idb reference only for the asset that owns it', () => {
    const own = { ...snapshotWithMedia(), mediaAssets: snapshotWithMedia().mediaAssets.map((asset) => asset.id === 'media_voice' ? { ...asset, url: 'idb:media_voice' } : asset) };
    expect(() => parseSnapshotImport(JSON.stringify(own))).not.toThrow();
    const foreign = { ...own, mediaAssets: own.mediaAssets.map((asset) => asset.id === 'media_voice' ? { ...asset, url: 'idb:media_photo' } : asset) };
    expect(() => parseSnapshotImport(JSON.stringify(foreign))).toThrow('неподдерживаемый файл');
  });

  it('keeps a draft recording reference only when it points at an audio asset', () => {
    const valid = withDraft(snapshotWithMedia(), 'media_voice');
    expect(parseSnapshotImport(JSON.stringify(valid)).drafts[0].audioMediaAssetId).toBe('media_voice');
    const invalid = withDraft(snapshotWithMedia(), 'media_photo');
    expect(() => parseSnapshotImport(JSON.stringify(invalid))).toThrow('черновика с аудиозаписью');
  });
});

describe('exports embed device media', () => {
  it('round-trips recordings through a JSON backup and back into the blob store', async () => {
    const deviceA = createMemoryMediaStore();
    const local = (await migrateSnapshotMedia(snapshotWithMedia(), deviceA)).snapshot;

    const { assets, missing } = await inlineStoredMedia(local.mediaAssets, deviceA);
    expect(missing).toEqual([]);
    const backup = JSON.stringify({ ...local, mediaAssets: assets });
    expect(backup).toContain(AUDIO_DATA_URL);

    const deviceB = createMemoryMediaStore();
    const restored = (await migrateSnapshotMedia(parseSnapshotImport(backup), deviceB)).snapshot;
    expect(restored.mediaAssets.find((asset) => asset.id === 'media_voice')?.url).toBe('idb:media_voice');
    expect(await bytes(deviceB.blobs.get('media_voice'))).toEqual([...AUDIO_BYTES]);
  });

  it('reports missing blobs instead of exporting broken data URLs', async () => {
    const local = (await migrateSnapshotMedia(snapshotWithMedia(), createMemoryMediaStore())).snapshot;
    const { assets, missing } = await inlineStoredMedia(local.mediaAssets, createMemoryMediaStore());
    expect(missing.sort()).toEqual(['media_photo', 'media_voice']);
    expect(assets.find((asset) => asset.id === 'media_voice')?.url).toBe('idb:media_voice');
  });

  it('puts a recorded answer into the HTML book', async () => {
    const store = createMemoryMediaStore();
    const local = (await migrateSnapshotMedia(snapshotWithMedia(), store)).snapshot;
    const moment = local.moments[0];
    const input = {
      title: 'Наша книга', dedication: '', chapters: local.chapters, moments: [moment], perspectives: local.perspectives,
      reflections: [], people: local.people, withMedia: true, withReflections: false
    };
    expect(buildBookHtml({ ...input, mediaAssets: local.mediaAssets })).not.toContain(AUDIO_DATA_URL);
    const { assets } = await inlineStoredMedia(local.mediaAssets, store);
    const html = buildBookHtml({ ...input, mediaAssets: assets });
    expect(html).toContain(`<audio controls preload="none" aria-label="Аудиозапись" src="${AUDIO_DATA_URL}"></audio>`);
  });
});

describe('recorded answers in the book', () => {
  it('links a recording to the interview moment once, as the narrator\'s audio perspective', () => {
    const base = snapshotWithMedia(PNG_DATA_URL, 'idb:media_voice');
    const unlinked = { ...base, perspectives: base.perspectives.filter((item) => item.id !== 'perspective_voice') };
    const question = unlinked.questions.find((item) => item.status !== 'answered' && !unlinked.memories.some((memory) => memory.questionId === item.id))!;
    const { memory, snapshot } = publishMemoryToSnapshot(unlinked, {
      personId: question.personId, questionId: question.id, transcript: 'Рассказ', durationSeconds: 42, tags: [], audioMediaAssetId: 'media_voice'
    });
    const moment = snapshot.moments.find((item) => item.sourceMemoryId === memory.id)!;
    const audio = snapshot.perspectives.filter((item) => item.mediaAssetId === 'media_voice');
    expect(audio).toHaveLength(1);
    expect(audio[0]).toMatchObject({ momentId: moment.id, authorId: question.personId, type: 'audio', isPrimary: false });
    expect(attachMemoryAudio(snapshot, memory, 'media_voice')).toBe(snapshot);
    expect(() => parseSnapshotImport(JSON.stringify(snapshot))).not.toThrow();
  });

  it('only discards recordings nothing in the book uses', () => {
    const snapshot = snapshotWithMedia(PNG_DATA_URL, 'idb:media_voice');
    expect(removeUnusedMediaAsset(snapshot, 'media_voice')).toBe(snapshot);
    const draftOnly = withDraft({ ...snapshot, perspectives: snapshot.perspectives.filter((item) => item.id !== 'perspective_voice') }, 'media_voice');
    const cleaned = removeUnusedMediaAsset(draftOnly, 'media_voice');
    expect(cleaned.mediaAssets.some((asset) => asset.id === 'media_voice')).toBe(false);
    expect(cleaned.drafts[0].audioMediaAssetId).toBeUndefined();
  });

  it('prunes blobs that no asset references any more', async () => {
    const store = createMemoryMediaStore({ media_voice: new Blob([AUDIO_BYTES]), media_orphan: new Blob([AUDIO_BYTES]) });
    await pruneMediaStore(snapshotWithMedia(PNG_DATA_URL, 'idb:media_voice'), store);
    expect([...store.blobs.keys()]).toEqual(['media_voice']);
  });
});
