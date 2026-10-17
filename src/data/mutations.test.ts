import { afterEach, describe, expect, it, vi } from 'vitest';
import { addPerspectiveToSnapshot, createMemoryDraft, ensureMemoryMoments, publishMemoryToSnapshot,
  removeUnusedMediaAsset, saveDraftToSnapshot, setMomentNarrationInSnapshot, toggleMemoryFavorite, toggleMomentFavorite,
  updateMomentInSnapshot } from './mutations';
import { loadSnapshot, persistSnapshot } from './repository';
import { seedSnapshot } from './seed';

afterEach(() => vi.unstubAllGlobals());

describe('draft and publish mutations', () => {
  it('keeps tags and photo metadata across save, reload, publish, and another reload', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    } });
    const draftInput = {
      personId: 'person_dmitry',
      questionId: 'question_home',
      transcript: 'Дом стоял у реки, а веранда пахла свежей древесиной.',
      durationSeconds: 88,
      tags: ['дом', 'детство'],
      photoUrl: '/photos/childhood-house.jpg',
      photoAlt: 'Дом из детских воспоминаний'
    };
    const draft = createMemoryDraft(draftInput, 'draft_house', '2026-10-02T12:00:00.000Z');
    const original = structuredClone(seedSnapshot);
    const saved = saveDraftToSnapshot(original, draft);

    expect(saved.drafts).toContainEqual(draft);
    expect(saved.questions.find((question) => question.id === draft.questionId)?.status).toBe('draft');

    persistSnapshot(saved);
    const reopened = loadSnapshot();
    const published = publishMemoryToSnapshot(reopened, reopened.drafts[0]);

    expect(published.memory).toMatchObject({
      transcript: draftInput.transcript,
      tags: draftInput.tags,
      photoUrl: draftInput.photoUrl,
      photoAlt: draftInput.photoAlt
    });
    expect(published.snapshot.drafts).toHaveLength(0);
    expect(published.snapshot.questions.find((question) => question.id === draft.questionId)?.status).toBe('answered');
    expect(published.snapshot.people.find((person) => person.id === draft.personId)?.answeredCount).toBe(1);
    persistSnapshot(published.snapshot);
    expect(loadSnapshot().memories.find((memory) => memory.id === published.memory.id)).toEqual(published.memory);
    expect(original).toEqual(seedSnapshot);
  });

  it('replaces a saved draft and retains unrelated drafts', () => {
    const first = createMemoryDraft(seedSnapshot.memories[0]);
    const other = createMemoryDraft(seedSnapshot.memories[1]);
    const saved = saveDraftToSnapshot(saveDraftToSnapshot(structuredClone(seedSnapshot), first), other);
    const replacement = createMemoryDraft({ ...first, tags: ['updated'], photoUrl: '', photoAlt: '' });
    const updated = saveDraftToSnapshot(saved, replacement);
    expect(updated.drafts).toEqual([other, replacement]);
    expect(updated.questions.find((question) => question.id === first.questionId)?.status).toBe('answered');
  });

  it('preserves published identity and metadata when editing via a draft, without double-counting', () => {
    const original = structuredClone(seedSnapshot);
    const memory = original.memories[0];
    const draft = createMemoryDraft({ ...memory, transcript: 'Corrected text' });
    const saved = saveDraftToSnapshot(original, draft);
    const published = publishMemoryToSnapshot(saved, draft);
    expect(published.memory).toEqual({ ...memory, transcript: 'Corrected text' });
    expect(published.snapshot.memories).toHaveLength(original.memories.length);
    expect(published.snapshot.people.find((person) => person.id === memory.personId)?.answeredCount)
      .toBe(original.people.find((person) => person.id === memory.personId)?.answeredCount);
    expect(published.snapshot.drafts).toEqual([]);
  });

  it('distinguishes an omitted photo from an explicitly removed photo', () => {
    const snapshot = structuredClone(seedSnapshot);
    const memory = snapshot.memories[0];
    const input = {
      personId: memory.personId,
      questionId: memory.questionId,
      transcript: 'Edited text',
      durationSeconds: memory.durationSeconds,
      tags: []
    };
    expect(publishMemoryToSnapshot(snapshot, input).memory).toMatchObject({
      tags: [], photoUrl: memory.photoUrl, photoAlt: memory.photoAlt
    });
    expect(publishMemoryToSnapshot(snapshot, { ...input, photoUrl: '' }).memory).toMatchObject({
      tags: [], photoUrl: '', photoAlt: ''
    });
  });

  it('copies input tags so later edits do not silently mutate a saved draft or published memory', () => {
    const input = structuredClone(seedSnapshot.memories[0]);
    const draft = createMemoryDraft(input);
    const { memory } = publishMemoryToSnapshot(structuredClone(seedSnapshot), input);
    input.tags.push('unsaved edit');
    expect(draft.tags).not.toContain('unsaved edit');
    expect(memory.tags).not.toContain('unsaved edit');
  });

  it('publishes an interview to the book, then edits its text and photo without duplicating it on reload', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    } });
    const input = { personId: 'person_dmitry', questionId: 'question_home', transcript: 'Дом у реки.',
      durationSeconds: 12, tags: ['дом'], photoUrl: '/photos/house.jpg', photoAlt: 'Дом' };
    persistSnapshot(ensureMemoryMoments(structuredClone(seedSnapshot)));
    const published = publishMemoryToSnapshot(loadSnapshot(), input);
    const firstMoment = published.snapshot.moments.find((item) => item.sourceMemoryId === published.memory.id)!;
    expect(firstMoment.occurredAt).toBeUndefined();
    expect(published.snapshot.perspectives.find((item) => item.id === firstMoment.primaryPerspectiveId))
      .toMatchObject({ content: input.transcript, sourceMemoryId: published.memory.id, authorId: input.personId });
    const withDate = updateMomentInSnapshot(published.snapshot, firstMoment.id, { occurredAt: '1955-08-10' });
    persistSnapshot(withDate);
    const edited = publishMemoryToSnapshot(loadSnapshot(), { ...input, transcript: 'Дом стоял у леса.', photoUrl: '/photos/forest.jpg' });
    const editedMoment = edited.snapshot.moments.find((item) => item.sourceMemoryId === published.memory.id)!;
    expect(editedMoment).toMatchObject({ id: firstMoment.id, primaryPerspectiveId: firstMoment.primaryPerspectiveId,
      createdAt: firstMoment.createdAt, occurredAt: '1955-08-10', summary: 'Дом стоял у леса.' });
    const photo = edited.snapshot.perspectives.find((item) => item.sourceMemoryId === published.memory.id && item.type === 'photo')!;
    expect(edited.snapshot.mediaAssets.find((item) => item.id === photo.mediaAssetId)?.url).toBe('/photos/forest.jpg');
    persistSnapshot(edited.snapshot);
    const reopened = loadSnapshot();
    expect(reopened).toEqual(edited.snapshot);
    expect(reopened.moments.filter((item) => item.sourceMemoryId === published.memory.id)).toHaveLength(1);
    expect(reopened.perspectives.filter((item) => item.sourceMemoryId === published.memory.id && item.type === 'text')).toHaveLength(1);
    expect(reopened.people.find((item) => item.id === input.personId)?.answeredCount).toBe(1);
  });

  it('keeps editorial metadata, foreign perspectives and reflections while editing or removing an interview photo', () => {
    const original = ensureMemoryMoments(structuredClone(seedSnapshot));
    const memory = original.memories[0];
    const summer = original.moments.find((item) => item.id === 'moment_summer')!;
    const foreignPhoto = original.perspectives.find((item) => item.id === 'perspective_summer_photo')!;
    const foreignText = { id: 'another_story', momentId: summer.id, authorId: 'person_olga',
      type: 'text' as const, content: 'А я помню иначе.', createdAt: '2026-10-01T12:00:00Z', isPrimary: true };
    const withForeign = addPerspectiveToSnapshot(original, foreignText);
    const edited = publishMemoryToSnapshot(withForeign, { ...memory, transcript: 'Уточнённый рассказ.', photoUrl: '/photos/new.jpg' });
    const removed = publishMemoryToSnapshot(edited.snapshot, { ...edited.memory, photoUrl: '', photoAlt: '' }).snapshot;
    expect(removed.moments.find((item) => item.id === summer.id)).toMatchObject({
      title: summer.title, summary: summer.summary, occurredAt: summer.occurredAt, primaryPerspectiveId: foreignText.id
    });
    expect(removed.perspectives.find((item) => item.id === foreignPhoto.id)).toEqual(foreignPhoto);
    expect(removed.perspectives.find((item) => item.id === foreignText.id)).toEqual(foreignText);
    expect(removed.perspectives.find((item) => item.id === 'perspective_summer_text')).toMatchObject({ content: 'Уточнённый рассказ.', isPrimary: false });
    expect(removed.perspectives.filter((item) => item.sourceMemoryId === memory.id && item.type === 'photo')).toEqual([]);
    expect(removed.reflections).toEqual(original.reflections);
    expect(removed.mediaAssets.find((item) => item.id === foreignPhoto.mediaAssetId))
      .toEqual(original.mediaAssets.find((item) => item.id === foreignPhoto.mediaAssetId));
  });

  it('synchronizes favorites from both the interview and the book', () => {
    const original = ensureMemoryMoments(structuredClone(seedSnapshot));
    const fromMemory = toggleMemoryFavorite(original, 'memory_summer');
    expect(fromMemory.memories.find((item) => item.id === 'memory_summer')?.favorite).toBe(false);
    expect(fromMemory.moments.find((item) => item.id === 'moment_summer')?.favorite).toBe(false);
    const fromMoment = toggleMomentFavorite(fromMemory, 'moment_summer');
    expect(fromMoment.memories.find((item) => item.id === 'memory_summer')?.favorite).toBe(true);
    expect(fromMoment.moments.find((item) => item.id === 'moment_summer')?.favorite).toBe(true);
    expect(ensureMemoryMoments(fromMoment)).toEqual(fromMoment);
  });

  it('rejects a question belonging to another relative and preserves the input snapshot', () => {
    const original = structuredClone(seedSnapshot);
    expect(() => publishMemoryToSnapshot(original, { ...original.memories[0], personId: 'person_dmitry' })).toThrow('рассказчик');
    expect(original).toEqual(seedSnapshot);
  });

  it('validates event dates and chapter membership, and allows removing a date', () => {
    const snapshot = ensureMemoryMoments(structuredClone(seedSnapshot));
    expect(() => updateMomentInSnapshot(snapshot, 'moment_summer', { occurredAt: '2025-02-29' })).toThrow('календарную');
    expect(() => updateMomentInSnapshot(snapshot, 'moment_summer', { chapterId: 'missing' })).toThrow('Глава');
    const valid = updateMomentInSnapshot(snapshot, 'moment_summer', { occurredAt: '2024-02-29', summary: 'Новая аннотация' });
    expect(valid.moments.find((item) => item.id === 'moment_summer')?.occurredAt).toBe('2024-02-29');
    const cleared = updateMomentInSnapshot(valid, 'moment_summer', { occurredAt: '' });
    expect(ensureMemoryMoments(cleared).moments.find((item) => item.id === 'moment_summer')).toMatchObject({
      occurredAt: undefined, summary: 'Новая аннотация'
    });
  });

  it('detaches an edited interview photo when relatives or the cover share the original asset', () => {
    const snapshot = ensureMemoryMoments(structuredClone(seedSnapshot));
    const memory = snapshot.memories.find((item) => item.id === 'memory_school')!;
    const ownPhoto = snapshot.perspectives.find((item) => item.sourceMemoryId === memory.id && item.type === 'photo')!;
    const sharedAsset = snapshot.mediaAssets.find((item) => item.id === ownPhoto.mediaAssetId)!;
    snapshot.perspectives.push({ ...ownPhoto, id: 'relative_photo', sourceMemoryId: undefined, authorId: 'person_anna', momentId: 'moment_summer' });
    snapshot.books[0].coverMediaAssetId = sharedAsset.id;
    const updated = publishMemoryToSnapshot(snapshot, { ...memory, photoUrl: '/photos/corrected.jpg' }).snapshot;
    const updatedOwn = updated.perspectives.find((item) => item.id === ownPhoto.id)!;
    expect(updatedOwn.mediaAssetId).not.toBe(sharedAsset.id);
    expect(updated.mediaAssets.find((item) => item.id === sharedAsset.id)).toEqual(sharedAsset);
    expect(updated.perspectives.find((item) => item.id === 'relative_photo')?.mediaAssetId).toBe(sharedAsset.id);
    expect(ensureMemoryMoments(updated)).toEqual(updated);
  });

  it('does not overwrite a relative perspective that happens to use a legacy interview identifier', () => {
    const snapshot = ensureMemoryMoments(structuredClone(seedSnapshot));
    const memory = snapshot.memories.find((item) => item.id === 'memory_school')!;
    const moment = snapshot.moments.find((item) => item.sourceMemoryId === memory.id)!;
    const ownText = snapshot.perspectives.find((item) => item.sourceMemoryId === memory.id && item.type === 'text')!;
    const relativeText = { ...ownText, authorId: 'person_anna', sourceMemoryId: undefined, content: 'Рассказ родственника.' };
    snapshot.perspectives = snapshot.perspectives.map((item) => item.id === ownText.id ? relativeText : item);
    const updated = publishMemoryToSnapshot(snapshot, { ...memory, transcript: 'Исправленный текст интервью.' }).snapshot;
    expect(updated.perspectives.find((item) => item.id === relativeText.id)).toEqual(relativeText);
    expect(updated.perspectives.find((item) => item.sourceMemoryId === memory.id && item.type === 'text')).toMatchObject({
      content: 'Исправленный текст интервью.', authorId: memory.personId, momentId: moment.id
    });
    expect(new Set(updated.perspectives.map((item) => item.id)).size).toBe(updated.perspectives.length);
    expect(ensureMemoryMoments(updated)).toEqual(updated);
  });
});

describe('moment narration', () => {
  const narration = { id: 'media_narration', type: 'audio' as const, url: 'idb:media_narration', mimeType: 'audio/webm', createdAt: '2026-10-10T10:00:00.000Z' };

  it('attaches an audio voice-over, keeps it in use and detaches it again', () => {
    const base = { ...structuredClone(seedSnapshot), mediaAssets: [...seedSnapshot.mediaAssets, narration] };
    const attached = setMomentNarrationInSnapshot(base, 'moment_summer', narration.id);
    expect(attached.moments.find((item) => item.id === 'moment_summer')?.narrationMediaAssetId).toBe(narration.id);
    expect(removeUnusedMediaAsset(attached, narration.id)).toBe(attached);

    const detached = setMomentNarrationInSnapshot(attached, 'moment_summer', undefined);
    expect(detached.moments.find((item) => item.id === 'moment_summer')?.narrationMediaAssetId).toBeUndefined();
    expect(removeUnusedMediaAsset(detached, narration.id).mediaAssets.some((asset) => asset.id === narration.id)).toBe(false);
  });

  it('rejects a voice-over that is not an audio asset', () => {
    expect(() => setMomentNarrationInSnapshot(structuredClone(seedSnapshot), 'moment_summer', 'asset_porch')).toThrow();
  });
});
