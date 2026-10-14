import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedSnapshot } from './seed';
import { loadSnapshot, loadSnapshotResult, parseSnapshotImport, persistSnapshot } from './repository';
import { ensureMemoryMoments, publishMemoryToSnapshot } from './mutations';
import { STORAGE_KEY } from '../lib/storage';

function createLocalStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear()
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: createLocalStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('snapshot repository', () => {
  it('falls back to a safe seed snapshot when stored JSON is malformed', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not valid json');

    expect(loadSnapshot()).toEqual(ensureMemoryMoments(structuredClone(seedSnapshot)));
  });

  it.each([null, [], false, 42, 'snapshot', {}, { version: 2 }])(
    'falls back for an invalid or unsupported snapshot: %j',
    (value) => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      expect(loadSnapshot()).toEqual(ensureMemoryMoments(structuredClone(seedSnapshot)));
    }
  );

  it('falls back when storage is missing or access is denied, without sharing mutable seed data', () => {
    expect(loadSnapshot()).toEqual(ensureMemoryMoments(structuredClone(seedSnapshot)));
    vi.stubGlobal('window', {
      get localStorage() { throw new Error('Storage access denied'); }
    });
    const loaded = loadSnapshot();
    loaded.memories[0].tags.push('changed');
    loaded.people[0].name = 'Changed';
    expect(loadSnapshot()).toEqual(ensureMemoryMoments(structuredClone(seedSnapshot)));
    expect(seedSnapshot.memories[0].tags).not.toContain('changed');
  });

  it('repairs malformed fields and discards unusable records and broken references', () => {
    const stored = {
      ...structuredClone(seedSnapshot),
      people: [null, { id: 'incomplete' }, ...seedSnapshot.people],
      questions: [...seedSnapshot.questions, { ...seedSnapshot.questions[0], id: 'orphan', personId: 'missing' }],
      memories: [
        { ...seedSnapshot.memories[0], tags: ['kept', null, 5], durationSeconds: -10, favorite: 'yes' },
        { ...seedSnapshot.memories[1], questionId: 'missing' },
        { ...seedSnapshot.memories[2], personId: 'person_anna' },
        null
      ],
      drafts: [false, { id: 'broken' }],
      settings: { cloudBackup: 'yes', weeklyReminder: false }
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const loaded = loadSnapshot();
    expect(loaded.people).toEqual(seedSnapshot.people);
    expect(loaded.questions).toEqual(seedSnapshot.questions);
    expect(loaded.memories).toEqual([{ ...seedSnapshot.memories[0], tags: ['kept'] }]);
    expect(loaded.drafts).toEqual([]);
    expect(loaded.settings).toEqual({ ...seedSnapshot.settings, weeklyReminder: false });
  });

  it('defaults missing legacy draft metadata to empty values', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seedSnapshot,
      drafts: [{
        id: 'legacy', personId: 'person_dmitry', questionId: 'question_home',
        transcript: 'Legacy answer', durationSeconds: 15, createdAt: '2026-10-02T12:00:00.000Z', status: 'draft'
      }]
    }));
    expect(loadSnapshot().drafts[0]).toMatchObject({
      transcript: 'Legacy answer', tags: [], photoUrl: '', photoAlt: ''
    });
  });

  it('normalizes a valid snapshot without dropping memory and draft data', () => {
    const stored = structuredClone(seedSnapshot);
    stored.project.title = 'Семейная книга';
    stored.memories[0].tags = ['лето', 'важное'];
    stored.memories[0].photoUrl = '/photos/summer.jpg';
    stored.memories[0].photoAlt = 'Летняя фотография';
    stored.drafts = [
      {
        id: 'draft_saved',
        personId: 'person_dmitry',
        questionId: 'question_home',
        transcript: 'Дом у реки и большая веранда.',
        durationSeconds: 42,
        tags: ['дом', 'детство'],
        photoUrl: '/photos/house.jpg',
        photoAlt: 'Дом из детских воспоминаний',
        createdAt: '2026-10-02T12:00:00.000Z',
        status: 'ready'
      }
    ];

    persistSnapshot(stored);

    const loaded = loadSnapshot();

    expect(loaded).toEqual(ensureMemoryMoments(stored));

    expect(loaded.project.title).toBe('Семейная книга');
    expect(loaded.memories[0]).toMatchObject({
      tags: ['лето', 'важное'],
      photoUrl: '/photos/summer.jpg',
      photoAlt: 'Летняя фотография'
    });
    expect(loaded.drafts).toEqual(stored.drafts);
  });

  it('connects the existing demo moments and adds the missing interview without duplicating on reload', () => {
    persistSnapshot(structuredClone(seedSnapshot));
    const loaded = loadSnapshot();
    expect(loaded.moments).toHaveLength(4);
    expect(loaded.moments.find((moment) => moment.id === 'moment_summer')).toMatchObject({ sourceMemoryId: 'memory_summer', occurredAt: '1950-07-15' });
    expect(loaded.moments.find((moment) => moment.id === 'moment_table')).toMatchObject({ sourceMemoryId: 'memory_mother', occurredAt: '1980-05-01' });
    expect(loaded.moments.find((moment) => moment.sourceMemoryId === 'memory_school')?.occurredAt).toBeUndefined();
    expect(loaded.perspectives.find((perspective) => perspective.id === 'perspective_summer_text')?.content)
      .toBe(seedSnapshot.memories[0].transcript);
    expect(loaded.reflections).toEqual(seedSnapshot.reflections);
    persistSnapshot(loaded);
    expect(loadSnapshot()).toEqual(loaded);
  });

  it('migrates legacy-only snapshots losslessly and never treats an interview date as an event date', () => {
    const legacy = JSON.parse(JSON.stringify(seedSnapshot));
    for (const key of ['books', 'chapters', 'moments', 'perspectives', 'reflections', 'mediaAssets']) delete legacy[key];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const migrated = loadSnapshot();
    expect(migrated.memories).toEqual(seedSnapshot.memories);
    expect(migrated.moments).toHaveLength(legacy.memories.length);
    expect(migrated.moments.every((moment) => moment.sourceMemoryId && !moment.occurredAt)).toBe(true);
    persistSnapshot(migrated);
    expect(loadSnapshot()).toEqual(migrated);
    expect(parseSnapshotImport(JSON.stringify(legacy))).toEqual(migrated);
  });

  it('clears the fabricated event date from the previous legacy migration and retains a corrected date', () => {
    const legacy = JSON.parse(JSON.stringify(seedSnapshot));
    for (const key of ['books', 'chapters', 'moments', 'perspectives', 'reflections', 'mediaAssets']) delete legacy[key];
    const migrated = parseSnapshotImport(JSON.stringify(legacy));
    migrated.moments.forEach((moment) => {
      const memory = migrated.memories.find((item) => item.id === moment.sourceMemoryId)!;
      moment.occurredAt = memory.recordedAt;
      delete moment.sourceMemoryId;
    });
    migrated.moments[0].occurredAt = '1948-07-10';
    persistSnapshot(migrated);
    const loaded = loadSnapshot();
    expect(loaded.moments[0].occurredAt).toBe('1948-07-10');
    expect(loaded.moments.slice(1).every((moment) => !moment.occurredAt)).toBe(true);
  });

  it('repairs cross-book chapters, cross-moment primary links, missing authors, and invalid calendar dates', () => {
    const snapshot = ensureMemoryMoments(structuredClone(seedSnapshot));
    snapshot.books.push({ ...snapshot.books[0], id: 'other_book' });
    snapshot.chapters.push({ ...snapshot.chapters[0], id: 'other_chapter', bookId: 'other_book' });
    snapshot.moments.push({ ...snapshot.moments[0], id: 'invalid_chapter_moment', sourceMemoryId: undefined, chapterId: 'other_chapter' });
    const summer = snapshot.moments.find((moment) => moment.id === 'moment_summer')!;
    summer.primaryPerspectiveId = 'perspective_baikal_text';
    summer.occurredAt = '2025-02-29';
    summer.updatedAt = 'not-a-date';
    snapshot.reflections[0].authorId = 'missing_person';
    persistSnapshot(snapshot);
    const loaded = loadSnapshot();
    expect(loaded.moments.some((moment) => moment.id === 'invalid_chapter_moment')).toBe(false);
    const repaired = loaded.moments.find((moment) => moment.id === 'moment_summer')!;
    expect(repaired.primaryPerspectiveId).toBe('perspective_summer_text');
    expect(repaired.occurredAt).toBeUndefined();
    expect(Number.isFinite(Date.parse(repaired.updatedAt))).toBe(true);
    expect(loaded.reflections[0]).toMatchObject({ text: snapshot.reflections[0].text, authorId: undefined });
  });

  it('imports a complete backup without dropping new interviews or adding duplicate moments', () => {
    const { snapshot, memory } = publishMemoryToSnapshot(loadSnapshot(), {
      personId: 'person_dmitry', questionId: 'question_home', transcript: 'Дом с верандой.',
      durationSeconds: 12, tags: ['дом']
    });
    const imported = parseSnapshotImport(JSON.stringify(snapshot));
    expect(imported).toEqual(snapshot);
    expect(imported.moments.filter((moment) => moment.sourceMemoryId === memory.id)).toHaveLength(1);
  });

  it('rejects incomplete or damaged imports instead of silently injecting demo data', () => {
    expect(() => parseSnapshotImport('{broken')).toThrow('JSON');
    expect(() => parseSnapshotImport(JSON.stringify({ version: 1 }))).toThrow('project');
    const invalid = JSON.parse(JSON.stringify(seedSnapshot));
    delete invalid.memories;
    expect(() => parseSnapshotImport(JSON.stringify(invalid))).toThrow('memories');
    invalid.memories = seedSnapshot.memories;
    invalid.moments[0].primaryPerspectiveId = 'perspective_baikal_text';
    expect(() => parseSnapshotImport(JSON.stringify(invalid))).toThrow('основного рассказа');
    invalid.moments[0].primaryPerspectiveId = 'perspective_summer_text';
    invalid.moments[0].occurredAt = '2026-02-30';
    expect(() => parseSnapshotImport(JSON.stringify(invalid))).toThrow('occurredAt');
    invalid.moments[0].occurredAt = '2024-02-29';
    invalid.people.push(invalid.people[0]);
    expect(() => parseSnapshotImport(JSON.stringify(invalid))).toThrow('повторяется');
  });

  it('returns persistence failures so callers can keep changes and offer a backup', () => {
    vi.stubGlobal('window', { localStorage: { setItem() { throw new DOMException('Full', 'QuotaExceededError'); } } });
    expect(persistSnapshot(structuredClone(seedSnapshot))).toMatchObject({ ok: false, error: { kind: 'quota' } });
  });

  it.each(['https://outside.example/photo.jpg', 'javascript:alert(1)', 'data:text/html;base64,SGVsbG8=',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='])('rejects unsafe imported photograph URL %s', (url) => {
    const snapshot = structuredClone(seedSnapshot);
    snapshot.memories[0].photoUrl = url;
    expect(() => parseSnapshotImport(JSON.stringify(snapshot))).toThrow('фотография');
  });

  it('keeps a saved theme, defaults older snapshots to the system theme and rejects unknown themes on import', () => {
    const stored = structuredClone(seedSnapshot);
    stored.settings.theme = 'dark';
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    expect(loadSnapshot().settings.theme).toBe('dark');

    const legacy = JSON.parse(JSON.stringify(seedSnapshot));
    delete legacy.settings.theme;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    expect(loadSnapshot().settings.theme).toBe('system');
    expect(parseSnapshotImport(JSON.stringify(legacy)).settings.theme).toBe('system');

    legacy.settings.theme = 'sepia';
    expect(() => parseSnapshotImport(JSON.stringify(legacy))).toThrow('settings.theme');
  });

  it('accepts embedded raster media and preserves the original malformed storage for recovery', () => {
    const snapshot = structuredClone(seedSnapshot);
    snapshot.memories[0].photoUrl = 'data:image/png;base64,aGVsbG8=';
    expect(parseSnapshotImport(JSON.stringify(snapshot)).memories[0].photoUrl).toBe(snapshot.memories[0].photoUrl);
    const raw = '{invalid snapshot';
    window.localStorage.setItem(STORAGE_KEY, raw);
    expect(loadSnapshotResult()).toMatchObject({ rawBackup: raw, warning: expect.stringContaining('повреждена') });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });
});
