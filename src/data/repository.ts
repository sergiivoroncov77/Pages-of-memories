import { storedMediaUrl } from '../lib/mediaStore';
import { STORAGE_KEY, writeStorage } from '../lib/storage';
import { seedSnapshot } from './seed';
import { ensureMemoryMoments } from './mutations';
import { isValidDate } from './validation';
import type {
  AppSettings,
  AppSnapshot,
  Book,
  Chapter,
  FamilyProject,
  MediaAsset,
  Memory,
  MemoryDraft,
  Moment,
  Person,
  Perspective,
  Question,
  Reflection
} from './types';

function cloneSeed(): AppSnapshot {
  return ensureMemoryMoments(structuredClone(seedSnapshot));
}

type RecordValue = Record<string, unknown>;

const PERSON_STATUSES = ['active', 'invited', 'paused'] as const;
const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
const QUESTION_STATUSES = ['next', 'planned', 'answered', 'draft'] as const;
const MEMORY_SOURCES = ['app', 'link', 'import'] as const;
const DRAFT_STATUSES = ['draft', 'ready'] as const;
const PERSPECTIVE_TYPES = ['text', 'audio', 'photo', 'video'] as const;
const MEDIA_ASSET_TYPES = ['audio', 'photo', 'video', 'document'] as const;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, fallback?: string): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  return fallback && fallback.trim() ? fallback : null;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function dateValue(value: unknown, fallback?: string): string {
  return isValidDate(value) ? value : isValidDate(fallback) ? fallback : seedSnapshot.project.createdAt;
}

function numberValue(value: unknown, fallback: number, minimum = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : fallback;
}

function optionalNumber(value: unknown, fallback?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [...fallback];
}

function enumValue<T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && options.includes(value) ? (value as T[number]) : fallback;
}

function normalizeProject(value: unknown, fallback: FamilyProject): FamilyProject {
  const record = isRecord(value) ? value : {};
  return {
    id: requiredString(record.id, fallback.id) ?? fallback.id,
    title: stringValue(record.title, fallback.title),
    subtitle: stringValue(record.subtitle, fallback.subtitle),
    createdAt: dateValue(record.createdAt, fallback.createdAt),
    inviteCode: stringValue(record.inviteCode, fallback.inviteCode)
  };
}

function normalizePerson(value: unknown, fallback?: Person): Person | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const projectId = requiredString(value.projectId, fallback?.projectId);
  const name = requiredString(value.name, fallback?.name);
  const relation = requiredString(value.relation, fallback?.relation);
  const initials = requiredString(value.initials, fallback?.initials);
  const avatarColor = requiredString(value.avatarColor, fallback?.avatarColor);
  const bio = requiredString(value.bio, fallback?.bio);
  const lastActiveAt = dateValue(value.lastActiveAt, fallback?.lastActiveAt);

  if (!id || !projectId || !name || !relation || !initials || !avatarColor || !bio || !lastActiveAt) return null;

  return {
    id,
    projectId,
    name,
    relation,
    birthYear: optionalNumber(value.birthYear, fallback?.birthYear),
    initials,
    avatarColor,
    bio,
    answeredCount: numberValue(value.answeredCount, fallback?.answeredCount ?? 0),
    totalQuestions: numberValue(value.totalQuestions, fallback?.totalQuestions ?? 0),
    lastActiveAt,
    status: enumValue(value.status, PERSON_STATUSES, fallback?.status ?? 'active')
  };
}

function normalizeQuestion(value: unknown, fallback?: Question): Question | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const personId = requiredString(value.personId, fallback?.personId);
  const text = requiredString(value.text, fallback?.text);
  const hint = requiredString(value.hint, fallback?.hint);
  const category = requiredString(value.category, fallback?.category);

  if (!id || !personId || !text || !hint || !category) return null;

  return {
    id,
    personId,
    text,
    hint,
    prompts: stringArray(value.prompts, fallback?.prompts ?? []),
    category,
    status: enumValue(value.status, QUESTION_STATUSES, fallback?.status ?? 'planned'),
    order: numberValue(value.order, fallback?.order ?? 0)
  };
}

function normalizeMemory(value: unknown, fallback?: Memory): Memory | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const personId = requiredString(value.personId, fallback?.personId);
  const questionId = requiredString(value.questionId, fallback?.questionId);
  const title = requiredString(value.title, fallback?.title);
  const questionText = requiredString(value.questionText, fallback?.questionText);
  const recordedAt = dateValue(value.recordedAt, fallback?.recordedAt);

  if (!id || !personId || !questionId || !title || !questionText || !recordedAt) return null;

  return {
    id,
    personId,
    questionId,
    title,
    questionText,
    recordedAt,
    durationSeconds: numberValue(value.durationSeconds, fallback?.durationSeconds ?? 0),
    transcript: stringValue(value.transcript, fallback?.transcript ?? ''),
    tags: stringArray(value.tags, fallback?.tags ?? []),
    photoUrl: stringValue(value.photoUrl, fallback?.photoUrl ?? ''),
    photoAlt: stringValue(value.photoAlt, fallback?.photoAlt ?? ''),
    source: enumValue(value.source, MEMORY_SOURCES, fallback?.source ?? 'app'),
    favorite: typeof value.favorite === 'boolean' ? value.favorite : fallback?.favorite ?? false
  };
}

function normalizeDraft(value: unknown, fallback?: MemoryDraft): MemoryDraft | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const personId = requiredString(value.personId, fallback?.personId);
  const questionId = requiredString(value.questionId, fallback?.questionId);
  const createdAt = dateValue(value.createdAt, fallback?.createdAt);

  if (!id || !personId || !questionId || !createdAt) return null;

  return {
    id,
    personId,
    questionId,
    transcript: stringValue(value.transcript, fallback?.transcript ?? ''),
    durationSeconds: numberValue(value.durationSeconds, fallback?.durationSeconds ?? 0),
    tags: stringArray(value.tags, fallback?.tags ?? []),
    photoUrl: stringValue(value.photoUrl, fallback?.photoUrl ?? ''),
    photoAlt: stringValue(value.photoAlt, fallback?.photoAlt ?? ''),
    audioMediaAssetId: optionalString(value.audioMediaAssetId, fallback?.audioMediaAssetId),
    createdAt,
    status: enumValue(value.status, DRAFT_STATUSES, fallback?.status ?? 'draft')
  };
}

function optionalString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === 'string') return value;
  return fallback;
}

function normalizeBook(value: unknown, fallback?: Book): Book | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const projectId = requiredString(value.projectId, fallback?.projectId);
  const title = requiredString(value.title, fallback?.title);
  const createdAt = dateValue(value.createdAt, fallback?.createdAt);
  const updatedAt = dateValue(value.updatedAt, fallback?.updatedAt ?? createdAt);

  if (!id || !projectId || !title || !createdAt || !updatedAt) return null;

  return {
    id,
    projectId,
    title,
    subtitle: stringValue(value.subtitle, fallback?.subtitle ?? ''),
    description: stringValue(value.description, fallback?.description ?? ''),
    createdAt,
    updatedAt,
    coverMediaAssetId: optionalString(value.coverMediaAssetId, fallback?.coverMediaAssetId)
  };
}

function normalizeChapter(value: unknown, fallback?: Chapter): Chapter | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const bookId = requiredString(value.bookId, fallback?.bookId);
  const title = requiredString(value.title, fallback?.title);
  const createdAt = dateValue(value.createdAt, fallback?.createdAt);
  const updatedAt = dateValue(value.updatedAt, fallback?.updatedAt ?? createdAt);

  if (!id || !bookId || !title || !createdAt || !updatedAt) return null;

  return {
    id,
    bookId,
    title,
    description: stringValue(value.description, fallback?.description ?? ''),
    order: numberValue(value.order, fallback?.order ?? 0),
    createdAt,
    updatedAt
  };
}

function normalizeMoment(value: unknown, fallback?: Moment): Moment | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const bookId = requiredString(value.bookId, fallback?.bookId);
  const chapterId = requiredString(value.chapterId, fallback?.chapterId);
  const title = requiredString(value.title, fallback?.title);
  const createdAt = dateValue(value.createdAt, fallback?.createdAt);
  const updatedAt = dateValue(value.updatedAt, fallback?.updatedAt ?? createdAt);

  if (!id || !bookId || !chapterId || !title || !createdAt || !updatedAt) return null;

  return {
    id,
    bookId,
    chapterId,
    sourceMemoryId: optionalString(value.sourceMemoryId),
    title,
    summary: stringValue(value.summary, fallback?.summary ?? ''),
    occurredAt: isValidDate(value.occurredAt) ? value.occurredAt : undefined,
    tags: stringArray(value.tags, fallback?.tags ?? []),
    primaryPerspectiveId: optionalString(value.primaryPerspectiveId, fallback?.primaryPerspectiveId),
    createdAt,
    updatedAt,
    favorite: typeof value.favorite === 'boolean' ? value.favorite : fallback?.favorite ?? false
  };
}

function normalizePerspective(value: unknown, fallback?: Perspective): Perspective | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const momentId = requiredString(value.momentId, fallback?.momentId);
  const createdAt = dateValue(value.createdAt, fallback?.createdAt);
  if (!id || !momentId || !createdAt) return null;

  return {
    id,
    momentId,
    sourceMemoryId: optionalString(value.sourceMemoryId),
    authorId: optionalString(value.authorId, fallback?.authorId),
    type: enumValue(value.type, PERSPECTIVE_TYPES, fallback?.type ?? 'text'),
    content: stringValue(value.content, fallback?.content ?? ''),
    mediaAssetId: optionalString(value.mediaAssetId, fallback?.mediaAssetId),
    caption: optionalString(value.caption, fallback?.caption),
    createdAt,
    isPrimary: typeof value.isPrimary === 'boolean' ? value.isPrimary : fallback?.isPrimary ?? false
  };
}

function normalizeReflection(value: unknown, fallback?: Reflection): Reflection | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const momentId = requiredString(value.momentId, fallback?.momentId);
  const text = requiredString(value.text, fallback?.text);
  const createdAt = dateValue(value.createdAt, fallback?.createdAt);
  if (!id || !momentId || !text || !createdAt) return null;

  return {
    id,
    momentId,
    authorId: optionalString(value.authorId, fallback?.authorId),
    text,
    createdAt
  };
}

function normalizeMediaAsset(value: unknown, fallback?: MediaAsset): MediaAsset | null {
  if (!isRecord(value)) return null;

  const id = requiredString(value.id, fallback?.id);
  const url = requiredString(value.url, fallback?.url);
  const mimeType = requiredString(value.mimeType, fallback?.mimeType);
  const createdAt = dateValue(value.createdAt, fallback?.createdAt);
  if (!id || !url || !mimeType || !createdAt) return null;

  return {
    id,
    type: enumValue(value.type, MEDIA_ASSET_TYPES, fallback?.type ?? 'document'),
    url,
    mimeType,
    fileName: optionalString(value.fileName, fallback?.fileName),
    alt: optionalString(value.alt, fallback?.alt),
    sizeBytes: optionalNumber(value.sizeBytes, fallback?.sizeBytes),
    durationSeconds: optionalNumber(value.durationSeconds, fallback?.durationSeconds),
    width: optionalNumber(value.width, fallback?.width),
    height: optionalNumber(value.height, fallback?.height),
    createdAt
  };
}

function normalizeSettings(value: unknown, fallback: AppSettings): AppSettings {
  const record = isRecord(value) ? value : {};
  return {
    cloudBackup: typeof record.cloudBackup === 'boolean' ? record.cloudBackup : fallback.cloudBackup,
    allowTranscriptSharing:
      typeof record.allowTranscriptSharing === 'boolean'
        ? record.allowTranscriptSharing
        : fallback.allowTranscriptSharing,
    weeklyReminder: typeof record.weeklyReminder === 'boolean' ? record.weeklyReminder : fallback.weeklyReminder,
    highContrast: typeof record.highContrast === 'boolean' ? record.highContrast : fallback.highContrast,
    theme: typeof record.theme === 'string' && (THEME_PREFERENCES as readonly string[]).includes(record.theme)
      ? (record.theme as AppSettings['theme'])
      : fallback.theme
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const ids = new Set<string>();
  return items.filter((item) => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
}

function normalizeList<T extends { id: string }>(
  value: unknown,
  fallback: T[],
  normalize: (item: unknown, fallback?: T) => T | null
): T[] {
  if (!Array.isArray(value)) return structuredClone(fallback);
  const fallbackById = new Map(fallback.map((item) => [item.id, item]));
  return uniqueById(
    value
      .map((item) => {
        const fallbackItem = isRecord(item) && typeof item.id === 'string' ? fallbackById.get(item.id) : undefined;
        return normalize(item, fallbackItem);
      })
      .filter((item): item is T => item !== null)
  );
}

interface ModernCollections {
  books: Book[];
  chapters: Chapter[];
  moments: Moment[];
  perspectives: Perspective[];
  reflections: Reflection[];
  mediaAssets: MediaAsset[];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || 'chapter';
}

/**
 * Legacy snapshots only know about one Memory per Question. Turn those records
 * into a small, lossless book representation while keeping the legacy arrays.
 */
function migrateLegacyCollections(project: FamilyProject, memories: Memory[]): ModernCollections {
  const bookId = `book_${project.id}`;
  const now = memories[0]?.recordedAt ?? project.createdAt;
  const books: Book[] = [
    {
      id: bookId,
      projectId: project.id,
      title: project.title,
      subtitle: project.subtitle,
      description: 'Книга, собранная из сохранённых семейных воспоминаний.',
      createdAt: project.createdAt,
      updatedAt: now
    }
  ];

  const categories = new Map<string, Chapter>();
  memories.forEach((memory) => {
    const category = memory.tags[0] || 'Воспоминания';
    if (!categories.has(category)) {
      const chapterId = `chapter_${project.id}_${slug(category)}_${categories.size + 1}`;
      categories.set(category, {
        id: chapterId,
        bookId,
        title: category,
        description: 'Перенесено из сохранённых воспоминаний.',
        order: categories.size + 1,
        createdAt: memory.recordedAt,
        updatedAt: memory.recordedAt
      });
    }
  });

  if (categories.size === 0) {
    categories.set('Воспоминания', {
      id: `chapter_${project.id}_memories`,
      bookId,
      title: 'Воспоминания',
      description: 'Новые семейные истории.',
      order: 1,
      createdAt: project.createdAt,
      updatedAt: project.createdAt
    });
  }

  const chapters = [...categories.values()];
  const perspectives: Perspective[] = [];
  const mediaAssets: MediaAsset[] = [];
  const moments: Moment[] = memories.map((memory) => {
    const chapter = categories.get(memory.tags[0] || 'Воспоминания') ?? chapters[0];
    const perspectiveId = `perspective_${memory.id}_text`;
    perspectives.push({
      id: perspectiveId,
      sourceMemoryId: memory.id,
      momentId: `moment_${memory.id}`,
      authorId: memory.personId,
      type: 'text',
      content: memory.transcript,
      createdAt: memory.recordedAt,
      isPrimary: true
    });

    let photoAssetId: string | undefined;
    if (memory.photoUrl) {
      photoAssetId = `media_${memory.id}_photo`;
      mediaAssets.push({
        id: photoAssetId,
        type: 'photo',
        url: memory.photoUrl,
        mimeType: 'image/*',
        alt: memory.photoAlt,
        createdAt: memory.recordedAt
      });
      perspectives.push({
        id: `perspective_${memory.id}_photo`,
        sourceMemoryId: memory.id,
        momentId: `moment_${memory.id}`,
        authorId: memory.personId,
        type: 'photo',
        content: memory.photoAlt,
        mediaAssetId: photoAssetId,
        createdAt: memory.recordedAt,
        isPrimary: false
      });
    }

    return {
      id: `moment_${memory.id}`,
      sourceMemoryId: memory.id,
      bookId,
      chapterId: chapter.id,
      title: memory.title,
      summary: memory.transcript.slice(0, 180),
      tags: [...memory.tags],
      primaryPerspectiveId: perspectiveId,
      createdAt: memory.recordedAt,
      updatedAt: memory.recordedAt,
      favorite: memory.favorite
    };
  });

  return { books, chapters, moments, perspectives, reflections: [], mediaAssets };
}

function normalizeSnapshot(value: unknown): AppSnapshot | null {
  if (!isRecord(value) || value.version !== 1) return null;

  const seed = cloneSeed();
  const project = normalizeProject(value.project, seed.project);
  const people = normalizeList(value.people, seed.people, normalizePerson).filter(
    (person) => person.projectId === project.id
  );
  const peopleIds = new Set(people.map((person) => person.id));
  const questions = normalizeList(value.questions, seed.questions, normalizeQuestion).filter((question) =>
    peopleIds.has(question.personId)
  );
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const memories = normalizeList(value.memories, seed.memories, normalizeMemory).filter(
    (memory) => questionsById.get(memory.questionId)?.personId === memory.personId
  );
  const drafts = normalizeList(value.drafts, seed.drafts, normalizeDraft).filter(
    (draft) => questionsById.get(draft.questionId)?.personId === draft.personId
  );
  const migrated = migrateLegacyCollections(project, memories);
  const books = normalizeList(value.books, migrated.books, normalizeBook).filter(
    (book) => book.projectId === project.id
  );
  const bookIds = new Set(books.map((book) => book.id));
  const chapters = normalizeList(value.chapters, migrated.chapters, normalizeChapter).filter((chapter) =>
    bookIds.has(chapter.bookId)
  );
  const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const moments = normalizeList(value.moments, migrated.moments, normalizeMoment).filter(
    (moment) => bookIds.has(moment.bookId) && chaptersById.get(moment.chapterId)?.bookId === moment.bookId
  );
  const momentIds = new Set(moments.map((moment) => moment.id));
  const perspectives = normalizeList(value.perspectives, migrated.perspectives, normalizePerspective).filter(
    (perspective) => momentIds.has(perspective.momentId)
  );
  const perspectivesById = new Map(perspectives.map((perspective) => [perspective.id, perspective]));
  const mediaAssets = normalizeList(value.mediaAssets, migrated.mediaAssets, normalizeMediaAsset);
  const mediaAssetIds = new Set(mediaAssets.map((asset) => asset.id));
  const reflections = normalizeList(value.reflections, migrated.reflections, normalizeReflection).filter((reflection) =>
    momentIds.has(reflection.momentId)
  );
  const normalizedBooks = books.map((book) => ({
    ...book,
    coverMediaAssetId:
      book.coverMediaAssetId && mediaAssetIds.has(book.coverMediaAssetId) ? book.coverMediaAssetId : undefined
  }));

  const memoryIds = new Set(memories.map((memory) => memory.id));
  const linkedMemoryIds = new Set<string>();
  const normalizedMoments = moments.map((moment) => {
    const sourceMemoryId = moment.sourceMemoryId && memoryIds.has(moment.sourceMemoryId)
      && !linkedMemoryIds.has(moment.sourceMemoryId) ? moment.sourceMemoryId : undefined;
    if (sourceMemoryId) linkedMemoryIds.add(sourceMemoryId);
    const legacyMemory = !moment.sourceMemoryId ? memories.find((memory) => `moment_${memory.id}` === moment.id) : undefined;
    return {
      ...moment,
      sourceMemoryId,
      occurredAt: legacyMemory?.recordedAt === moment.occurredAt ? undefined : moment.occurredAt,
      primaryPerspectiveId:
        moment.primaryPerspectiveId && perspectivesById.get(moment.primaryPerspectiveId)?.momentId === moment.id
          ? moment.primaryPerspectiveId
          : perspectives.find((perspective) => perspective.momentId === moment.id && perspective.isPrimary)?.id
    };
  });
  const normalizedMomentsById = new Map(normalizedMoments.map((moment) => [moment.id, moment]));
  const normalizedPerspectives = perspectives.map((perspective) => ({
    ...perspective,
    authorId: perspective.authorId && peopleIds.has(perspective.authorId) ? perspective.authorId : undefined,
    sourceMemoryId: perspective.sourceMemoryId
      && normalizedMomentsById.get(perspective.momentId)?.sourceMemoryId === perspective.sourceMemoryId
      && memories.some((memory) => memory.id === perspective.sourceMemoryId && memory.personId === perspective.authorId)
      ? perspective.sourceMemoryId : undefined,
    isPrimary: normalizedMomentsById.get(perspective.momentId)?.primaryPerspectiveId === perspective.id,
    mediaAssetId: perspective.mediaAssetId && mediaAssetIds.has(perspective.mediaAssetId)
      ? perspective.mediaAssetId
      : undefined
  }));

  return ensureMemoryMoments({
    version: 1,
    project,
    people,
    questions,
    memories,
    drafts: drafts.map((draft) => ({ ...draft,
      audioMediaAssetId: draft.audioMediaAssetId && mediaAssets.some((asset) => asset.id === draft.audioMediaAssetId && asset.type === 'audio')
        ? draft.audioMediaAssetId : undefined
    })),
    books: normalizedBooks,
    chapters,
    moments: normalizedMoments,
    perspectives: normalizedPerspectives,
    reflections: reflections.map((reflection) => ({ ...reflection,
      authorId: reflection.authorId && peopleIds.has(reflection.authorId) ? reflection.authorId : undefined
    })),
    mediaAssets,
    settings: normalizeSettings(value.settings, seed.settings)
  });
}

type FieldRule = 'id' | 'text' | 'date' | 'number' | 'boolean' | 'strings' | readonly string[];
type FieldSchema = Record<string, FieldRule | { optional: FieldRule }>;
const optional = (rule: FieldRule) => ({ optional: rule });
const entityFields: Record<string, FieldSchema> = {
  people: { id: 'id', projectId: 'id', name: 'id', relation: 'id', birthYear: optional('number'), initials: 'id',
    avatarColor: 'id', bio: 'id', answeredCount: 'number', totalQuestions: 'number', lastActiveAt: 'date', status: PERSON_STATUSES },
  questions: { id: 'id', personId: 'id', text: 'id', hint: 'id', prompts: 'strings', category: 'id', status: QUESTION_STATUSES, order: 'number' },
  memories: { id: 'id', personId: 'id', questionId: 'id', title: 'id', questionText: 'id', recordedAt: 'date',
    durationSeconds: 'number', transcript: 'text', tags: 'strings', photoUrl: 'text', photoAlt: 'text', source: MEMORY_SOURCES, favorite: 'boolean' },
  drafts: { id: 'id', personId: 'id', questionId: 'id', transcript: 'text', durationSeconds: 'number', tags: optional('strings'),
    photoUrl: optional('text'), photoAlt: optional('text'), audioMediaAssetId: optional('id'), createdAt: 'date', status: DRAFT_STATUSES },
  books: { id: 'id', projectId: 'id', title: 'id', subtitle: 'text', description: 'text', createdAt: 'date', updatedAt: 'date', coverMediaAssetId: optional('id') },
  chapters: { id: 'id', bookId: 'id', title: 'id', description: 'text', order: 'number', createdAt: 'date', updatedAt: 'date' },
  moments: { id: 'id', sourceMemoryId: optional('id'), bookId: 'id', chapterId: 'id', title: 'id', summary: 'text',
    occurredAt: optional('date'), tags: 'strings', primaryPerspectiveId: optional('id'), createdAt: 'date', updatedAt: 'date', favorite: 'boolean' },
  perspectives: { id: 'id', sourceMemoryId: optional('id'), momentId: 'id', authorId: optional('id'), type: PERSPECTIVE_TYPES,
    content: 'text', mediaAssetId: optional('id'), caption: optional('text'), createdAt: 'date', isPrimary: 'boolean' },
  reflections: { id: 'id', momentId: 'id', authorId: optional('id'), text: 'id', createdAt: 'date' },
  mediaAssets: { id: 'id', type: MEDIA_ASSET_TYPES, url: 'id', mimeType: 'id', fileName: optional('text'), alt: optional('text'),
    sizeBytes: optional('number'), durationSeconds: optional('number'), width: optional('number'), height: optional('number'), createdAt: 'date' }
};

function validateFields(record: unknown, schema: FieldSchema, label: string): asserts record is RecordValue {
  if (!isRecord(record)) throw new Error(`Резервная копия повреждена: ${label} должен быть объектом.`);
  for (const [field, definition] of Object.entries(schema)) {
    const optionalField = typeof definition === 'object' && !Array.isArray(definition) && 'optional' in definition;
    if (optionalField && record[field] === undefined) continue;
    const rule = optionalField ? definition.optional : definition;
    const value = record[field];
    const valid = Array.isArray(rule) ? typeof value === 'string' && rule.includes(value)
      : rule === 'id' ? typeof value === 'string' && value.trim().length > 0
      : rule === 'text' ? typeof value === 'string'
      : rule === 'date' ? isValidDate(value)
      : rule === 'number' ? typeof value === 'number' && Number.isFinite(value) && value >= 0
      : rule === 'boolean' ? typeof value === 'boolean'
      : rule === 'strings' ? Array.isArray(value) && value.every((item) => typeof item === 'string') : false;
    if (!valid) throw new Error(`Резервная копия повреждена: проверьте поле ${label}.${field}.`);
  }
}

function isSafeBackupMediaUrl(url: unknown, type: unknown, assetId?: unknown): boolean {
  if (typeof url !== 'string') return false;
  // Device-local blob reference; only valid for the asset that owns it.
  if (typeof assetId === 'string' && url === storedMediaUrl(assetId)) return type === 'photo' || type === 'audio' || type === 'video';
  if (type === 'photo' && /^\/demo\/photo-(porch|kitchen|walk)\.svg$/.test(url)) return true;
  if (type === 'audio' && /^\/demo\/(summer|baikal)-memory\.mp3$/.test(url)) return true;
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (!match) return false;
  const allowed: Record<string, string[]> = {
    photo: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'],
    audio: ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm'],
    video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
  };
  return typeof type === 'string' && !!allowed[type]?.includes(match[1]);
}

/** Strict import never silently replaces missing user collections with demo data. */
export function parseSnapshotImport(json: string): AppSnapshot {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error('Не удалось прочитать JSON. Выберите резервную копию семейной книги.'); }
  if (!isRecord(value) || value.version !== 1) throw new Error('Формат резервной копии не поддерживается: нужна версия 1.');
  validateFields(value.project, { id: 'id', title: 'id', subtitle: 'text', createdAt: 'date', inviteCode: 'text' }, 'project');
  const projectId = value.project.id;
  validateFields(value.settings, { cloudBackup: 'boolean', allowTranscriptSharing: 'boolean', weeklyReminder: 'boolean', highContrast: 'boolean', theme: optional(THEME_PREFERENCES) }, 'settings');
  const modernKeys = ['books', 'chapters', 'moments', 'perspectives', 'reflections', 'mediaAssets'];
  const hasModern = modernKeys.some((key) => key in value);
  const collections: Record<string, RecordValue[]> = {};
  for (const [name, schema] of Object.entries(entityFields)) {
    if (!hasModern && modernKeys.includes(name)) { collections[name] = []; continue; }
    const items = value[name];
    if (!Array.isArray(items)) throw new Error(`Резервная копия неполная: отсутствует список ${name}.`);
    const ids = new Set<string>();
    collections[name] = items.map((item, index) => {
      validateFields(item, schema, `${name}[${index + 1}]`);
      const id = item.id as string;
      if (ids.has(id)) throw new Error(`Резервная копия повреждена: повторяется идентификатор ${name}/${id}.`);
      ids.add(id);
      return item;
    });
  }
  const byId = (name: string) => new Map(collections[name].map((item) => [item.id, item]));
  const people = byId('people');
  const questions = byId('questions');
  const memories = byId('memories');
  const books = byId('books');
  const chapters = byId('chapters');
  const moments = byId('moments');
  const perspectives = byId('perspectives');
  const assets = byId('mediaAssets');
  const reference = (valid: boolean, label: string) => {
    if (!valid) throw new Error(`Резервная копия повреждена: нарушена связь ${label}.`);
  };
  collections.people.forEach((item) => reference(item.projectId === projectId, 'рассказчика с семьёй'));
  collections.questions.forEach((item) => reference(people.has(item.personId), 'вопроса с рассказчиком'));
  [...collections.memories, ...collections.drafts].forEach((item) =>
    reference(questions.get(item.questionId)?.personId === item.personId && people.has(item.personId), 'ответа с вопросом и рассказчиком'));
  collections.books.forEach((item) => {
    reference(item.projectId === projectId, 'книги с семьёй');
    if (item.coverMediaAssetId !== undefined) reference(assets.get(item.coverMediaAssetId)?.type === 'photo', 'обложки с фотографией');
  });
  collections.drafts.forEach((item) => {
    if (item.audioMediaAssetId !== undefined) reference(assets.get(item.audioMediaAssetId)?.type === 'audio', 'черновика с аудиозаписью');
  });
  collections.chapters.forEach((item) => reference(books.has(item.bookId), 'главы с книгой'));
  const linkedMemoryIds = new Set<unknown>();
  collections.moments.forEach((item) => {
    reference(books.has(item.bookId) && chapters.get(item.chapterId)?.bookId === item.bookId, 'момента с главой и книгой');
    if (item.sourceMemoryId !== undefined) {
      reference(memories.has(item.sourceMemoryId) && !linkedMemoryIds.has(item.sourceMemoryId), 'момента с интервью');
      linkedMemoryIds.add(item.sourceMemoryId);
    }
    if (item.primaryPerspectiveId !== undefined) reference(perspectives.get(item.primaryPerspectiveId)?.momentId === item.id, 'основного рассказа с моментом');
  });
  [...collections.perspectives, ...collections.reflections].forEach((item) => {
    reference(moments.has(item.momentId), 'рассказа или отклика с моментом');
    if (item.authorId !== undefined) reference(people.has(item.authorId), 'рассказа или отклика с автором');
  });
  const ownedPerspectives = new Set<string>();
  collections.perspectives.forEach((item) => {
    if (item.mediaAssetId !== undefined) reference(assets.has(item.mediaAssetId)
      && (item.type === 'text' || item.type === assets.get(item.mediaAssetId)?.type), 'материала с файлом');
    if (item.sourceMemoryId !== undefined) reference(memories.has(item.sourceMemoryId)
      && moments.get(item.momentId)?.sourceMemoryId === item.sourceMemoryId
      && memories.get(item.sourceMemoryId)?.personId === item.authorId
      && (item.type === 'text' || item.type === 'photo'), 'рассказа с исходным интервью');
    if (item.sourceMemoryId !== undefined) {
      const key = JSON.stringify([item.sourceMemoryId, item.type]);
      reference(!ownedPerspectives.has(key), 'дублирующего материала с интервью');
      ownedPerspectives.add(key);
    }
  });
  [...collections.memories, ...collections.drafts].forEach((item) => {
    if (item.photoUrl && !isSafeBackupMediaUrl(item.photoUrl, 'photo')) {
      throw new Error('В резервной копии есть неподдерживаемая фотография или внешняя ссылка. Нужен встроенный JPG, PNG, WebP, GIF или AVIF.');
    }
  });
  collections.mediaAssets.forEach((item) => {
    if (!isSafeBackupMediaUrl(item.url, item.type, item.id)) {
      throw new Error('В резервной копии есть неподдерживаемый файл или внешняя ссылка. Восстановление отменено.');
    }
  });
  const normalized = normalizeSnapshot(value);
  if (!normalized) throw new Error('Не удалось восстановить семейную книгу.');
  return normalized;
}

export interface SnapshotLoadResult {
  snapshot: AppSnapshot;
  warning?: string;
  rawBackup?: string;
}

export function loadSnapshotResult(): SnapshotLoadResult {
  let raw: string | null;
  try { raw = window.localStorage.getItem(STORAGE_KEY); } catch {
    return { snapshot: cloneSeed(), warning: 'Не удалось прочитать хранилище браузера. Проверьте доступ перед сохранением изменений.' };
  }
  if (raw === null) return { snapshot: cloneSeed() };
  let stored: unknown;
  try { stored = JSON.parse(raw); } catch {
    return { snapshot: cloneSeed(), warning: 'Сохранённая книга повреждена. Скачайте исходные данные перед новым сохранением.', rawBackup: raw };
  }
  const snapshot = normalizeSnapshot(stored);
  if (!snapshot) return { snapshot: cloneSeed(), warning: 'Версия или формат сохранённой книги не поддерживается. Скачайте исходные данные перед новым сохранением.', rawBackup: raw };
  try { parseSnapshotImport(raw); } catch {
    return { snapshot, warning: 'В сохранённых данных найдены повреждённые поля или неподдерживаемые материалы. Скачайте исходную копию перед новым сохранением.', rawBackup: raw };
  }
  return { snapshot };
}

export function loadSnapshot(): AppSnapshot {
  return loadSnapshotResult().snapshot;
}

export function persistSnapshot(snapshot: AppSnapshot) {
  return writeStorage(STORAGE_KEY, snapshot);
}

export function resetSnapshot(): AppSnapshot {
  return cloneSeed();
}
