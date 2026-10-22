import { createId } from '../lib/id';
import { isValidDate } from './validation';
import type {
  AppSnapshot,
  MediaAsset,
  Memory,
  MemoryDraft,
  Moment,
  NewMemoryInput,
  Perspective,
  Reflection
} from './types';

export type MemoryDraftInput = Omit<MemoryDraft, 'id' | 'createdAt' | 'status'>;

export function createMemoryDraft(
  input: MemoryDraftInput,
  id = createId('draft'),
  createdAt = new Date().toISOString()
): MemoryDraft {
  return {
    ...input,
    tags: [...input.tags],
    photoUrl: input.photoUrl ?? '',
    photoAlt: input.photoAlt ?? '',
    id,
    createdAt,
    status: 'draft'
  };
}

export function saveDraftToSnapshot(snapshot: AppSnapshot, draft: MemoryDraft): AppSnapshot {
  if (!snapshot.questions.some((question) => question.id === draft.questionId && question.personId === draft.personId)) {
    throw new Error('Вопрос не принадлежит выбранному рассказчику.');
  }
  return {
    ...snapshot,
    drafts: [
      ...snapshot.drafts.filter(
        (item) => !(item.personId === draft.personId && item.questionId === draft.questionId)
      ),
      draft
    ],
    questions: snapshot.questions.map((question) =>
      question.id === draft.questionId && question.status !== 'answered'
        ? { ...question, status: 'draft' }
        : question
    )
  };
}

export interface PublishedMemoryResult {
  snapshot: AppSnapshot;
  memory: Memory;
}

export function publishMemoryToSnapshot(snapshot: AppSnapshot, input: NewMemoryInput): PublishedMemoryResult {
  const person = snapshot.people.find((item) => item.id === input.personId);
  const question = snapshot.questions.find((item) => item.id === input.questionId);

  if (!person || !question || question.personId !== person.id) {
    throw new Error('Не найден рассказчик или вопрос');
  }
  if (!input.transcript.trim()) throw new Error('Добавьте текст рассказа перед сохранением.');
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0) throw new Error('Продолжительность рассказа указана неверно.');

  const existing = snapshot.memories.find(
    (item) => item.personId === person.id && item.questionId === question.id
  );
  const photo =
    input.photoUrl !== undefined
      ? { url: input.photoUrl, alt: input.photoAlt ?? (input.photoUrl ? 'Семейная фотография' : '') }
      : { url: existing?.photoUrl ?? '', alt: existing?.photoAlt ?? '' };

  const memory: Memory = {
    id: existing?.id ?? createId('memory'),
    personId: person.id,
    questionId: question.id,
    title: existing?.title ?? `${person.name}: ${question.category.toLowerCase()}`,
    questionText: question.text,
    recordedAt: existing?.recordedAt ?? new Date().toISOString(),
    durationSeconds: input.durationSeconds,
    transcript: input.transcript,
    tags: [...input.tags],
    photoUrl: photo.url,
    photoAlt: photo.alt,
    source: existing?.source ?? 'app',
    favorite: existing?.favorite ?? false
  };

  const published = addMemoryToSnapshot(snapshot, memory);
  return { memory, snapshot: input.audioMediaAssetId ? attachMemoryAudio(published, memory, input.audioMediaAssetId) : published };
}

/** Link a recorded answer to the interview's moment as the narrator's audio perspective. */
export function attachMemoryAudio(snapshot: AppSnapshot, memory: Memory, mediaAssetId: string, createdAt = new Date().toISOString()): AppSnapshot {
  const moment = memoryMoment(snapshot, memory);
  const asset = snapshot.mediaAssets.find((item) => item.id === mediaAssetId);
  if (!moment || asset?.type !== 'audio' || snapshot.perspectives.some((item) => item.mediaAssetId === mediaAssetId)) return snapshot;
  const perspective: Perspective = {
    id: createId('perspective'), momentId: moment.id, authorId: memory.personId, type: 'audio',
    content: '', caption: 'Голосовая запись ответа', mediaAssetId, createdAt, isPrimary: false
  };
  return { ...snapshot, perspectives: [...snapshot.perspectives, perspective] };
}

export function addMemoryToSnapshot(snapshot: AppSnapshot, memory: Memory): AppSnapshot {
  if (!snapshot.people.some((person) => person.id === memory.personId)
    || !snapshot.questions.some((question) => question.id === memory.questionId && question.personId === memory.personId)) {
    throw new Error('Вопрос не принадлежит выбранному рассказчику.');
  }
  const existing = snapshot.memories.some((item) => item.id === memory.id);
  const previousMemory = snapshot.memories.find((item) => item.id === memory.id);
  const updated: AppSnapshot = {
    ...snapshot,
    memories: existing
      ? snapshot.memories.map((item) => (item.id === memory.id ? memory : item))
      : [memory, ...snapshot.memories],
    drafts: snapshot.drafts.filter(
      (draft) => !(draft.personId === memory.personId && draft.questionId === memory.questionId)
    ),
    questions: snapshot.questions.map((item) =>
      item.id === memory.questionId ? { ...item, status: 'answered' } : item
    ),
    people: snapshot.people.map((item) =>
      item.id === memory.personId
        ? {
            ...item,
            answeredCount: existing ? item.answeredCount : item.answeredCount + 1,
            lastActiveAt: memory.recordedAt,
            status: 'active'
          }
        : item
    )
  };
  return syncMemoryToBook(updated, memory, previousMemory);
}

const DEMO_MEMORY_MOMENTS: Record<string, string> = {
  memory_summer: 'moment_summer',
  memory_baikal: 'moment_baikal',
  memory_mother: 'moment_table'
};

function unusedId(preferred: string, items: { id: string }[]): string {
  return items.some((item) => item.id === preferred) ? createId(preferred) : preferred;
}

function memoryMoment(snapshot: AppSnapshot, memory: Memory): Moment | undefined {
  return snapshot.moments.find((moment) => moment.sourceMemoryId === memory.id)
    ?? snapshot.moments.find((moment) => !moment.sourceMemoryId && moment.id === `moment_${memory.id}`)
    ?? (snapshot.project.id === 'project_family_demo'
      ? snapshot.moments.find((moment) => !moment.sourceMemoryId && moment.id === DEMO_MEMORY_MOMENTS[memory.id])
      : undefined);
}

/** Reconcile only the interview-owned text/photo; keep editorial dates and relatives' contributions. */
function syncMemoryToBook(snapshot: AppSnapshot, memory: Memory, previousMemory?: Memory): AppSnapshot {
  const existingMoment = memoryMoment(snapshot, memory);
  const books = [...snapshot.books];
  // New interview answers land in the book the family is working on right now.
  let book = books.find((item) => item.id === existingMoment?.bookId)
    ?? books.find((item) => item.id === snapshot.settings.activeBookId)
    ?? books.find((item) => item.projectId === snapshot.project.id);
  if (!book) {
    book = {
      id: `book_${snapshot.project.id}`, projectId: snapshot.project.id,
      title: snapshot.project.title, subtitle: snapshot.project.subtitle,
      description: 'Книга, собранная из сохранённых семейных воспоминаний.',
      createdAt: snapshot.project.createdAt, updatedAt: memory.recordedAt
    };
    books.push(book);
  }

  const chapters = [...snapshot.chapters];
  let chapter = chapters.find((item) => item.id === existingMoment?.chapterId && item.bookId === book.id)
    ?? chapters.find((item) => item.bookId === book.id && item.id === `chapter_${book.id}_interviews`);
  if (!chapter) {
    chapter = {
      id: `chapter_${book.id}_interviews`, bookId: book.id, title: 'Рассказы близких',
      description: 'Истории, сохранённые во время семейных интервью.',
      order: Math.max(0, ...chapters.filter((item) => item.bookId === book.id).map((item) => item.order)) + 1,
      createdAt: memory.recordedAt, updatedAt: memory.recordedAt
    };
    chapters.push(chapter);
  }

  const momentId = existingMoment?.id ?? unusedId(`moment_${memory.id}`, snapshot.moments);
  const existingText = snapshot.perspectives.find((item) =>
    item.momentId === momentId && item.type === 'text' && item.sourceMemoryId === memory.id && item.authorId === memory.personId)
    ?? snapshot.perspectives.find((item) => item.momentId === momentId && item.type === 'text'
      && item.id === `perspective_${memory.id}_text` && item.authorId === memory.personId)
    ?? (!existingMoment?.sourceMemoryId ? snapshot.perspectives.find((item) =>
      item.id === existingMoment?.primaryPerspectiveId && item.momentId === momentId
      && item.type === 'text' && item.authorId === memory.personId) : undefined);
  const textId = existingText?.id ?? unusedId(`perspective_${memory.id}_text`, snapshot.perspectives);
  const primaryId = existingMoment?.primaryPerspectiveId ?? textId;
  const text: Perspective = {
    ...existingText, id: textId, momentId, sourceMemoryId: memory.id,
    authorId: memory.personId, type: 'text', content: memory.transcript,
    createdAt: existingText?.createdAt ?? memory.recordedAt, isPrimary: primaryId === textId
  };
  let perspectives = existingText ? snapshot.perspectives.map((item) => item.id === textId ? text : item)
    : [text, ...snapshot.perspectives];
  let mediaAssets = [...snapshot.mediaAssets];
  const ownedPhoto = perspectives.find((item) => item.momentId === momentId && item.type === 'photo'
    && item.authorId === memory.personId
    && (item.sourceMemoryId === memory.id || item.id === `perspective_${memory.id}_photo`));
  const existingSamePhoto = perspectives.some((item) => item.momentId === momentId && item.type === 'photo'
    && mediaAssets.some((asset) => asset.id === item.mediaAssetId && asset.url === memory.photoUrl));

  if (memory.photoUrl && (ownedPhoto || !existingSamePhoto)) {
    const photoId = ownedPhoto?.id ?? unusedId(`perspective_${memory.id}_photo`, perspectives);
    // Detach a changed photo if a relative or the book cover also uses that file.
    let assetId = ownedPhoto?.mediaAssetId ?? `media_${memory.id}_photo`;
    const previousAsset = mediaAssets.find((asset) => asset.id === assetId);
    const shared = perspectives.some((item) => item.id !== photoId && item.mediaAssetId === assetId)
      || books.some((item) => item.coverMediaAssetId === assetId);
    if (shared && (previousAsset?.url !== memory.photoUrl || previousAsset.alt !== memory.photoAlt)) {
      assetId = createId(`media_${memory.id}_photo`);
    }
    const asset: MediaAsset = {
      ...(previousAsset?.url === memory.photoUrl ? previousAsset : {}),
      id: assetId, type: 'photo', url: memory.photoUrl,
      mimeType: /^data:(image\/[a-z0-9.+-]+);/i.exec(memory.photoUrl)?.[1]
        ?? (previousAsset?.url === memory.photoUrl ? previousAsset.mimeType : 'image/*'), alt: memory.photoAlt,
      createdAt: previousAsset?.createdAt ?? memory.recordedAt
    };
    mediaAssets = mediaAssets.some((item) => item.id === assetId)
      ? mediaAssets.map((item) => item.id === assetId ? asset : item) : [...mediaAssets, asset];
    const photo: Perspective = {
      ...ownedPhoto, id: photoId, momentId, sourceMemoryId: memory.id, authorId: memory.personId,
      type: 'photo', content: memory.photoAlt, mediaAssetId: assetId,
      createdAt: ownedPhoto?.createdAt ?? memory.recordedAt, isPrimary: primaryId === photoId
    };
    perspectives = ownedPhoto ? perspectives.map((item) => item.id === photoId ? photo : item) : [photo, ...perspectives];
  } else if (!memory.photoUrl && ownedPhoto) {
    perspectives = perspectives.filter((item) => item.id !== ownedPhoto.id);
    const assetId = ownedPhoto.mediaAssetId;
    if (assetId && !perspectives.some((item) => item.mediaAssetId === assetId)
      && !books.some((item) => item.coverMediaAssetId === assetId)) {
      mediaAssets = mediaAssets.filter((item) => item.id !== assetId);
    }
  }

  const favorite = existingMoment && !existingMoment.sourceMemoryId
    ? existingMoment.favorite || memory.favorite : memory.favorite;
  const moment: Moment = {
    ...existingMoment,
    id: momentId, sourceMemoryId: memory.id, bookId: book.id, chapterId: chapter.id,
    title: existingMoment?.title ?? memory.title,
    summary: !existingMoment || (previousMemory && existingMoment.summary === previousMemory.transcript.slice(0, 180))
      ? memory.transcript.slice(0, 180) : existingMoment.summary,
    // recordedAt is an interview timestamp, not the date of the remembered event.
    occurredAt: existingMoment?.occurredAt,
    tags: previousMemory || !existingMoment ? [...memory.tags] : [...existingMoment.tags],
    primaryPerspectiveId: perspectives.some((item) => item.id === primaryId && item.momentId === momentId)
      ? primaryId : textId,
    createdAt: existingMoment?.createdAt ?? memory.recordedAt,
    updatedAt: previousMemory ? new Date().toISOString() : existingMoment?.updatedAt ?? memory.recordedAt,
    favorite
  };
  perspectives = perspectives.map((item) => item.momentId === momentId
    ? { ...item, isPrimary: item.id === moment.primaryPerspectiveId } : item);
  return {
    ...snapshot, books, chapters, mediaAssets, perspectives,
    memories: snapshot.memories.map((item) => item.id === memory.id ? { ...item, favorite } : item),
    moments: existingMoment ? snapshot.moments.map((item) => item.id === momentId ? moment : item)
      : [moment, ...snapshot.moments]
  };
}

/** Idempotent upgrade for snapshots saved before interviews were connected to the book. */
export function ensureMemoryMoments(snapshot: AppSnapshot): AppSnapshot {
  return snapshot.memories.reduce((current, memory) => syncMemoryToBook(current, memory), snapshot);
}

export interface NewMomentInput {
  bookId: string;
  chapterId: string;
  title: string;
  summary?: string;
  occurredAt?: string;
  tags?: string[];
  primaryPerspectiveId?: string;
  favorite?: boolean;
}

export function createMoment(
  input: NewMomentInput,
  id = createId('moment'),
  createdAt = new Date().toISOString()
): Moment {
  return {
    id,
    bookId: input.bookId,
    chapterId: input.chapterId,
    title: input.title,
    summary: input.summary ?? '',
    occurredAt: input.occurredAt,
    tags: [...(input.tags ?? [])],
    primaryPerspectiveId: input.primaryPerspectiveId,
    createdAt,
    updatedAt: createdAt,
    favorite: input.favorite ?? false
  };
}

export function addMomentToSnapshot(snapshot: AppSnapshot, moment: Moment): AppSnapshot {
  if (!moment.title.trim()) throw new Error('Добавьте название момента.');
  if (!snapshot.books.some((book) => book.id === moment.bookId)
    || !snapshot.chapters.some((chapter) => chapter.id === moment.chapterId && chapter.bookId === moment.bookId)) {
    throw new Error('Выберите главу из этой книги.');
  }
  if (moment.occurredAt && !isValidDate(moment.occurredAt)) throw new Error('Укажите существующую календарную дату.');
  if (moment.primaryPerspectiveId && !snapshot.perspectives.some((perspective) =>
    perspective.id === moment.primaryPerspectiveId && perspective.momentId === moment.id)) {
    throw new Error('Основной рассказ должен принадлежать этому моменту.');
  }
  const moments = snapshot.moments.some((item) => item.id === moment.id)
    ? snapshot.moments.map((item) => (item.id === moment.id ? { ...moment, tags: [...moment.tags] } : item))
    : [{ ...moment, tags: [...moment.tags] }, ...snapshot.moments];

  return { ...snapshot, moments };
}

export interface NewPerspectiveInput {
  momentId: string;
  type: Perspective['type'];
  content: string;
  authorId?: string;
  mediaAssetId?: string;
  caption?: string;
  isPrimary?: boolean;
}

export function createPerspective(
  input: NewPerspectiveInput,
  id = createId('perspective'),
  createdAt = new Date().toISOString()
): Perspective {
  return {
    id,
    momentId: input.momentId,
    authorId: input.authorId,
    type: input.type,
    content: input.content,
    mediaAssetId: input.mediaAssetId,
    caption: input.caption,
    createdAt,
    isPrimary: input.isPrimary ?? false
  };
}

export function addPerspectiveToSnapshot(snapshot: AppSnapshot, perspective: Perspective): AppSnapshot {
  if (!snapshot.moments.some((moment) => moment.id === perspective.momentId)
    || (perspective.authorId && !snapshot.people.some((person) => person.id === perspective.authorId))
    || (perspective.mediaAssetId && !snapshot.mediaAssets.some((asset) => asset.id === perspective.mediaAssetId))) {
    throw new Error('Не найден момент, автор или прикреплённый файл.');
  }
  const updated = snapshot.perspectives.some((item) => item.id === perspective.id)
    ? snapshot.perspectives.map((item) => (item.id === perspective.id ? { ...perspective } : item))
    : [{ ...perspective }, ...snapshot.perspectives];
  const perspectives = updated.map((item) => perspective.isPrimary && item.momentId === perspective.momentId
    ? { ...item, isPrimary: item.id === perspective.id } : item);
  const moments = snapshot.moments.map((moment) => {
    if (moment.id !== perspective.momentId) return moment.primaryPerspectiveId === perspective.id
      ? { ...moment, primaryPerspectiveId: undefined } : moment;
    if (perspective.isPrimary) return { ...moment, primaryPerspectiveId: perspective.id };
    if (moment.primaryPerspectiveId === perspective.id) return { ...moment, primaryPerspectiveId: undefined };
    return moment;
  });

  return { ...snapshot, perspectives, moments };
}

export interface NewReflectionInput {
  momentId: string;
  text: string;
  authorId?: string;
}

export function createReflection(
  input: NewReflectionInput,
  id = createId('reflection'),
  createdAt = new Date().toISOString()
): Reflection {
  return {
    id,
    momentId: input.momentId,
    authorId: input.authorId,
    text: input.text,
    createdAt
  };
}

export function addReflectionToSnapshot(snapshot: AppSnapshot, reflection: Reflection): AppSnapshot {
  if (!reflection.text.trim()) throw new Error('Добавьте текст отклика.');
  if (!snapshot.moments.some((moment) => moment.id === reflection.momentId)
    || (reflection.authorId && !snapshot.people.some((person) => person.id === reflection.authorId))) {
    throw new Error('Не найден момент или автор отклика.');
  }
  const reflections = snapshot.reflections.some((item) => item.id === reflection.id)
    ? snapshot.reflections.map((item) => (item.id === reflection.id ? { ...reflection } : item))
    : [{ ...reflection }, ...snapshot.reflections];

  return { ...snapshot, reflections };
}

export interface PerspectiveEdit {
  content?: string;
  caption?: string;
  /** Undefined signs the story without a name. */
  authorId?: string;
  /** A story told in words can be told aloud instead, and back. */
  type?: 'text' | 'audio';
  /** The recording of a voice story; a story in words has none. */
  mediaAssetId?: string;
}

/** New words for a story (and, for a file, its caption); its file and moment stay. */
export function updatePerspectiveInSnapshot(snapshot: AppSnapshot, perspectiveId: string, patch: PerspectiveEdit): AppSnapshot {
  const perspective = snapshot.perspectives.find((item) => item.id === perspectiveId);
  if (!perspective) return snapshot;
  const content = patch.content === undefined ? perspective.content : patch.content.trim();
  const type = patch.type ?? perspective.type;
  const mediaAssetId = 'mediaAssetId' in patch ? patch.mediaAssetId : perspective.mediaAssetId;
  if (patch.type && perspective.type !== 'text' && perspective.type !== 'audio') throw new Error('Фото и видео остаются материалами.');
  if (type === 'text' && !content) throw new Error('Напишите хотя бы несколько слов о том, что помните.');
  if (type === 'text' && mediaAssetId) throw new Error('У рассказа текстом не бывает записи.');
  if (type === 'audio' && (type !== perspective.type || mediaAssetId !== perspective.mediaAssetId)
    && snapshot.mediaAssets.find((asset) => asset.id === mediaAssetId)?.type !== 'audio') {
    throw new Error('Запишите голос или выберите аудиофайл.');
  }
  if ('authorId' in patch && patch.authorId && !snapshot.people.some((person) => person.id === patch.authorId)) {
    throw new Error('Не найден автор рассказа.');
  }
  const caption = patch.caption === undefined ? perspective.caption : patch.caption.trim() || undefined;
  const next: Perspective = { ...perspective, type, mediaAssetId, content, caption, authorId: 'authorId' in patch ? patch.authorId : perspective.authorId };
  return { ...snapshot, perspectives: snapshot.perspectives.map((item) => (item.id === perspectiveId ? next : item)) };
}

export function updateReflectionInSnapshot(snapshot: AppSnapshot, reflectionId: string, patch: { text?: string; authorId?: string }): AppSnapshot {
  const reflection = snapshot.reflections.find((item) => item.id === reflectionId);
  if (!reflection) return snapshot;
  const text = patch.text === undefined ? reflection.text : patch.text.trim();
  if (!text) throw new Error('Добавьте текст отклика.');
  if ('authorId' in patch && patch.authorId && !snapshot.people.some((person) => person.id === patch.authorId)) {
    throw new Error('Не найден автор отклика.');
  }
  const next: Reflection = { ...reflection, text, authorId: 'authorId' in patch ? patch.authorId : reflection.authorId };
  return { ...snapshot, reflections: snapshot.reflections.map((item) => (item.id === reflectionId ? next : item)) };
}

export type NewMediaAssetInput = Omit<MediaAsset, 'id' | 'createdAt'>;

export function createMediaAsset(
  input: NewMediaAssetInput,
  id = createId('media'),
  createdAt = new Date().toISOString()
): MediaAsset {
  return {
    ...input,
    id,
    createdAt
  };
}

export function addMediaAssetToSnapshot(snapshot: AppSnapshot, asset: MediaAsset): AppSnapshot {
  const mediaAssets = snapshot.mediaAssets.some((item) => item.id === asset.id)
    ? snapshot.mediaAssets.map((item) => (item.id === asset.id ? { ...asset } : item))
    : [{ ...asset }, ...snapshot.mediaAssets];

  return { ...snapshot, mediaAssets };
}

/** Drop an asset nothing in the book uses (e.g. a re-recorded draft answer). */
export function removeUnusedMediaAsset(snapshot: AppSnapshot, assetId: string): AppSnapshot {
  if (snapshot.perspectives.some((item) => item.mediaAssetId === assetId)
    || snapshot.moments.some((moment) => moment.narrationMediaAssetId === assetId)
    || snapshot.books.some((book) => book.coverMediaAssetId === assetId)) return snapshot;
  return {
    ...snapshot,
    mediaAssets: snapshot.mediaAssets.filter((asset) => asset.id !== assetId),
    drafts: snapshot.drafts.map((draft) => draft.audioMediaAssetId === assetId ? { ...draft, audioMediaAssetId: undefined } : draft)
  };
}

/** Attach (or with `undefined`, detach) the film voice-over of a moment. The previous asset is left for the caller to discard. */
export function setMomentNarrationInSnapshot(snapshot: AppSnapshot, momentId: string, assetId: string | undefined): AppSnapshot {
  if (!snapshot.moments.some((item) => item.id === momentId)) return snapshot;
  if (assetId !== undefined && snapshot.mediaAssets.find((asset) => asset.id === assetId)?.type !== 'audio') {
    throw new Error('Озвучка должна быть аудиозаписью.');
  }
  return {
    ...snapshot,
    moments: snapshot.moments.map((item) => item.id === momentId
      ? { ...item, narrationMediaAssetId: assetId, updatedAt: new Date().toISOString() } : item)
  };
}

export function setMomentFavorite(snapshot: AppSnapshot, momentId: string, favorite: boolean): AppSnapshot {
  const moment = snapshot.moments.find((item) => item.id === momentId);
  const memory = snapshot.memories.find((item) => item.id === moment?.sourceMemoryId
    || memoryMoment(snapshot, item)?.id === momentId);
  return {
    ...snapshot,
    moments: snapshot.moments.map((item) => (item.id === momentId ? { ...item, favorite } : item)),
    memories: snapshot.memories.map((item) => item.id === memory?.id ? { ...item, favorite } : item)
  };
}

export function toggleMomentFavorite(snapshot: AppSnapshot, momentId: string): AppSnapshot {
  const moment = snapshot.moments.find((item) => item.id === momentId);
  return moment ? setMomentFavorite(snapshot, momentId, !moment.favorite) : snapshot;
}

export function toggleMemoryFavorite(snapshot: AppSnapshot, memoryId: string): AppSnapshot {
  const memory = snapshot.memories.find((item) => item.id === memoryId);
  if (!memory) return snapshot;
  const synced = ensureMemoryMoments(snapshot);
  const moment = memoryMoment(synced, memory);
  return moment ? setMomentFavorite(synced, moment.id, !memory.favorite) : snapshot;
}

export function updateMomentInSnapshot(
  snapshot: AppSnapshot,
  momentId: string,
  patch: Partial<Pick<Moment, 'title' | 'summary' | 'occurredAt' | 'chapterId'>>
): AppSnapshot {
  const moment = snapshot.moments.find((item) => item.id === momentId);
  if (!moment) return snapshot;
  if (patch.title !== undefined && !patch.title.trim()) throw new Error('Добавьте название момента.');
  if (patch.chapterId !== undefined && !snapshot.chapters.some((chapter) => chapter.id === patch.chapterId && chapter.bookId === moment.bookId)) {
    throw new Error('Глава должна принадлежать этой книге.');
  }
  if (patch.occurredAt && !isValidDate(patch.occurredAt)) throw new Error('Укажите существующую календарную дату.');
  return {
    ...snapshot,
    moments: snapshot.moments.map((item) => item.id === momentId
      ? { ...item, ...patch, title: patch.title?.trim() ?? item.title, summary: patch.summary ?? item.summary,
        chapterId: patch.chapterId ?? item.chapterId, occurredAt: patch.occurredAt === '' ? undefined
        : 'occurredAt' in patch ? patch.occurredAt : item.occurredAt, updatedAt: new Date().toISOString() } : item)
  };
}
