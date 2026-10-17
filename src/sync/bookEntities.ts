import { deleteChapterFromSnapshot, deleteMomentsFromSnapshot } from '../data/library';
import { entityFields, isSafeBackupMediaUrl, normalizeSnapshotValue, validateFields } from '../data/repository';
import type { AppSnapshot, Book, Chapter, MediaAsset, Moment, Person, Perspective, Reflection } from '../data/types';
import { isStoredMedia, storedMediaUrl } from '../lib/mediaStore';

/*
 * A book in the family storage is a flat set of records keyed "type:id".
 * Every device sends the records that changed since its last sync and applies
 * what others changed. Device-only details (interview links, local
 * statistics, where a file lives on this phone) never leave the device.
 */

export type EntityType = 'book' | 'chapter' | 'moment' | 'perspective' | 'reflection' | 'media' | 'person' | 'file';
export type EntityData = Record<string, unknown>;
export type EntityMap = Map<string, EntityData>;

/** A media file uploaded to the book folder on Google Drive. */
export interface CloudFile {
  fileId: string;
  size?: number;
}

export interface CloudChange {
  key: string;
  data?: EntityData;
  deleted?: true;
}

export interface RemoteEntity {
  key: string;
  rev: number;
  data?: EntityData;
  deleted?: boolean;
}

export const entityKey = (type: EntityType, id: string) => `${type}:${id}`;

export function splitEntityKey(key: string): { type: EntityType; id: string } | null {
  const index = key.indexOf(':');
  const type = key.slice(0, index) as EntityType;
  const id = key.slice(index + 1);
  const known: EntityType[] = ['book', 'chapter', 'moment', 'perspective', 'reflection', 'media', 'person', 'file'];
  return index > 0 && id && known.includes(type) ? { type, id } : null;
}

/** Fields of a person that describe them; counters and status stay per device. */
const PERSON_FIELDS = ['id', 'name', 'relation', 'birthYear', 'initials', 'avatarColor', 'bio'] as const;

function withoutUndefined(value: Record<string, unknown>): EntityData {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function omit<T extends object>(value: T, fields: readonly string[]): EntityData {
  return withoutUndefined(Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key))));
}

/** Media of a book: covers, voice-overs and story attachments. */
export function mediaIdsOfBook(snapshot: AppSnapshot, bookId: string): Set<string> {
  const book = snapshot.books.find((item) => item.id === bookId);
  const moments = snapshot.moments.filter((moment) => moment.bookId === bookId);
  const momentIds = new Set(moments.map((moment) => moment.id));
  return new Set([
    book?.coverMediaAssetId,
    ...moments.map((moment) => moment.narrationMediaAssetId),
    ...snapshot.perspectives.filter((item) => momentIds.has(item.momentId)).map((item) => item.mediaAssetId)
  ].filter((id): id is string => Boolean(id)));
}

/** Files recorded on a phone travel as uploads; their address is the same `idb:` key everywhere. */
function portableMediaUrl(asset: MediaAsset): string {
  return isStoredMedia(asset) || asset.url.startsWith('data:') ? storedMediaUrl(asset.id) : asset.url;
}

/** Whether this device holds bytes that should be uploaded for the asset. */
export function hasLocalBytes(asset: MediaAsset): boolean {
  return isStoredMedia(asset) || asset.url.startsWith('data:');
}

export interface BookScope {
  /** Uploaded files by media id. */
  files: Record<string, CloudFile>;
  /** People that belong to the book even without a story yet (invited, pulled). */
  people: string[];
}

export function collectBookEntities(snapshot: AppSnapshot, bookId: string, scope: BookScope): EntityMap {
  const entities: EntityMap = new Map();
  const book = snapshot.books.find((item) => item.id === bookId);
  if (!book) return entities;
  entities.set(entityKey('book', book.id), omit(book, ['projectId']));
  snapshot.chapters.filter((chapter) => chapter.bookId === bookId)
    .forEach((chapter) => entities.set(entityKey('chapter', chapter.id), omit(chapter, [])));
  const moments = snapshot.moments.filter((moment) => moment.bookId === bookId);
  const momentIds = new Set(moments.map((moment) => moment.id));
  moments.forEach((moment) => entities.set(entityKey('moment', moment.id), omit({ ...moment, tags: [...moment.tags] }, ['sourceMemoryId'])));
  const perspectives = snapshot.perspectives.filter((item) => momentIds.has(item.momentId));
  // isPrimary follows the moment's primaryPerspectiveId on every device.
  perspectives.forEach((item) => entities.set(entityKey('perspective', item.id), omit(item, ['sourceMemoryId', 'isPrimary'])));
  const reflections = snapshot.reflections.filter((item) => momentIds.has(item.momentId));
  reflections.forEach((item) => entities.set(entityKey('reflection', item.id), omit(item, [])));
  const mediaIds = mediaIdsOfBook(snapshot, bookId);
  snapshot.mediaAssets.filter((asset) => mediaIds.has(asset.id)).forEach((asset) => {
    entities.set(entityKey('media', asset.id), withoutUndefined({ ...asset, url: portableMediaUrl(asset) }));
    const file = scope.files[asset.id];
    if (file) entities.set(entityKey('file', asset.id), withoutUndefined({ fileId: file.fileId, size: file.size }));
  });
  const peopleIds = new Set([...scope.people, ...[...perspectives, ...reflections].map((item) => item.authorId)]
    .filter((id): id is string => Boolean(id)));
  snapshot.people.filter((person) => peopleIds.has(person.id)).forEach((person) => {
    entities.set(entityKey('person', person.id), withoutUndefined(Object.fromEntries(PERSON_FIELDS.map((field) => [field, person[field]]))));
  });
  return entities;
}

/** Order-independent JSON, so the same record always gives the same fingerprint. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Two 32-bit FNV-1a passes: a cheap fingerprint to notice local edits. */
export function entityHash(data: EntityData): string {
  const text = stableJson(data);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x5bd1e995);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** People and the book itself are never deleted through sync: they leave explicitly. */
const DELETABLE: EntityType[] = ['chapter', 'moment', 'perspective', 'reflection', 'media', 'file'];

export function diffEntities(local: EntityMap, fingerprints: Record<string, string>): CloudChange[] {
  const changes: CloudChange[] = [];
  local.forEach((data, key) => {
    if (fingerprints[key] !== entityHash(data)) changes.push({ key, data });
  });
  Object.keys(fingerprints).forEach((key) => {
    const parsed = splitEntityKey(key);
    if (!local.has(key) && parsed && DELETABLE.includes(parsed.type)) changes.push({ key, deleted: true });
  });
  return changes;
}

export interface ApplyResult {
  snapshot: AppSnapshot;
  /** Remote file records: a value to store, or null when the file was removed. */
  files: Record<string, CloudFile | null>;
  /** People that arrived with the book. */
  people: string[];
  /** Media ids whose device files are no longer needed. */
  removedMediaIds: string[];
  /** Records that failed validation and were ignored. */
  rejected: string[];
}

const FILE_ID = /^[A-Za-z0-9_-]{4,200}$/;

function valid(record: unknown, schema: keyof typeof entityFields, label: string): boolean {
  try {
    validateFields(record, entityFields[schema], label);
    return true;
  } catch {
    return false;
  }
}

function upsert<T extends { id: string }>(items: T[], item: T, merge?: (local: T) => T): T[] {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...items, item];
  const next = [...items];
  next[index] = merge ? merge(items[index]) : item;
  return next;
}

/**
 * Apply records another device changed. Upserts come first, then deletions;
 * moment and chapter deletions also remove linked interview answers so they
 * are not rebuilt on this device.
 */
export function applyRemoteEntities(snapshot: AppSnapshot, bookId: string, entities: readonly RemoteEntity[], now = new Date().toISOString()): ApplyResult {
  const projectId = snapshot.project.id;
  const files: Record<string, CloudFile | null> = {};
  const people: string[] = [];
  const rejected: string[] = [];
  const removedMoments: string[] = [];
  const removedChapters: string[] = [];
  const removedPerspectives = new Set<string>();
  const removedReflections = new Set<string>();
  const removedMedia = new Set<string>();
  let next: AppSnapshot = { ...snapshot };
  const order: EntityType[] = ['person', 'media', 'book', 'chapter', 'moment', 'perspective', 'reflection', 'file'];
  const sorted = [...entities].sort((a, b) => order.indexOf(splitEntityKey(a.key)?.type ?? 'file') - order.indexOf(splitEntityKey(b.key)?.type ?? 'file'));

  for (const entity of sorted) {
    const parsed = splitEntityKey(entity.key);
    if (!parsed) { rejected.push(entity.key); continue; }
    const { type, id } = parsed;
    if (entity.deleted) {
      if (type === 'moment') removedMoments.push(id);
      else if (type === 'chapter') removedChapters.push(id);
      else if (type === 'perspective') removedPerspectives.add(id);
      else if (type === 'reflection') removedReflections.add(id);
      else if (type === 'media') removedMedia.add(id);
      else if (type === 'file') files[id] = null;
      continue;
    }
    const data = entity.data ?? {};
    if (data.id !== undefined && data.id !== id && type !== 'file') { rejected.push(entity.key); continue; }
    switch (type) {
      case 'book': {
        const book = { ...data, projectId } as unknown as Book;
        if (id !== bookId || !valid(book, 'books', 'book')) { rejected.push(entity.key); break; }
        next = { ...next, books: upsert(next.books, book, (local) => ({ ...book, projectId: local.projectId })) };
        break;
      }
      case 'chapter': {
        const chapter = data as unknown as Chapter;
        if (chapter.bookId !== bookId || !valid(chapter, 'chapters', 'chapter')) { rejected.push(entity.key); break; }
        next = { ...next, chapters: upsert(next.chapters, chapter) };
        break;
      }
      case 'moment': {
        const moment = data as unknown as Moment;
        if (moment.bookId !== bookId || !valid(moment, 'moments', 'moment')) { rejected.push(entity.key); break; }
        next = { ...next, moments: upsert(next.moments, { ...moment, tags: [...moment.tags] }, (local) => ({ ...moment, tags: [...moment.tags], sourceMemoryId: local.sourceMemoryId })) };
        break;
      }
      case 'perspective': {
        const perspective = { ...data, isPrimary: false } as unknown as Perspective;
        if (!valid(perspective, 'perspectives', 'perspective')) { rejected.push(entity.key); break; }
        next = { ...next, perspectives: upsert(next.perspectives, perspective, (local) => ({ ...perspective, sourceMemoryId: local.sourceMemoryId })) };
        break;
      }
      case 'reflection': {
        const reflection = data as unknown as Reflection;
        if (!valid(reflection, 'reflections', 'reflection')) { rejected.push(entity.key); break; }
        next = { ...next, reflections: upsert(next.reflections, reflection) };
        break;
      }
      case 'media': {
        const asset = data as unknown as MediaAsset;
        // Only files kept by the app itself: no external links or inline scripts.
        if (!valid(asset, 'mediaAssets', 'media') || asset.url.startsWith('data:') || !isSafeBackupMediaUrl(asset.url, asset.type, asset.id)) {
          rejected.push(entity.key);
          break;
        }
        // The device that recorded a file keeps its own reference to the bytes.
        next = { ...next, mediaAssets: upsert(next.mediaAssets, asset, (local) => ({ ...asset, url: local.url })) };
        break;
      }
      case 'person': {
        const identity = Object.fromEntries(PERSON_FIELDS.map((field) => [field, data[field]]));
        const fresh = withoutUndefined({ answeredCount: 0, totalQuestions: 0, lastActiveAt: now, status: 'active', ...identity, projectId }) as unknown as Person;
        if (!valid(fresh, 'people', 'person')) { rejected.push(entity.key); break; }
        next = { ...next, people: upsert(next.people, fresh, (local) => ({ ...local, ...withoutUndefined(identity), birthYear: identity.birthYear as number | undefined })) };
        people.push(id);
        break;
      }
      case 'file': {
        if (typeof data.fileId !== 'string' || !FILE_ID.test(data.fileId)) { rejected.push(entity.key); break; }
        files[id] = withoutUndefined({ fileId: data.fileId, size: typeof data.size === 'number' ? data.size : undefined }) as unknown as CloudFile;
        break;
      }
    }
  }

  const removedMediaIds: string[] = [];
  if (removedMoments.length) {
    const result = deleteMomentsFromSnapshot(next, removedMoments);
    next = result.snapshot;
    removedMediaIds.push(...result.removedMediaIds);
  }
  removedChapters.forEach((chapterId) => {
    const result = deleteChapterFromSnapshot(next, chapterId);
    next = result.snapshot;
    removedMediaIds.push(...result.removedMediaIds);
  });
  if (removedPerspectives.size || removedReflections.size) {
    next = {
      ...next,
      perspectives: next.perspectives.filter((item) => !removedPerspectives.has(item.id)),
      reflections: next.reflections.filter((item) => !removedReflections.has(item.id))
    };
  }
  if (removedMedia.size) {
    const used = new Set([
      ...next.perspectives.map((item) => item.mediaAssetId),
      ...next.moments.map((item) => item.narrationMediaAssetId),
      ...next.books.map((item) => item.coverMediaAssetId),
      ...next.drafts.map((item) => item.audioMediaAssetId)
    ]);
    const gone = [...removedMedia].filter((assetId) => !used.has(assetId));
    next = { ...next, mediaAssets: next.mediaAssets.filter((asset) => !gone.includes(asset.id)) };
    removedMediaIds.push(...gone);
  }
  const normalized = normalizeSnapshotValue(next);
  const kept = new Set(normalized.mediaAssets.map((asset) => asset.id));
  return { snapshot: normalized, files, people, removedMediaIds: [...new Set(removedMediaIds)].filter((assetId) => !kept.has(assetId)), rejected };
}
