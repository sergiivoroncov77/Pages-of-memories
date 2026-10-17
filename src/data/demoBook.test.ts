import { describe, expect, it } from 'vitest';
import { addDemo, DEMO_BOOK_ID, demoDependents, dropUnusedDemo, hasDemo, removeDemo } from './demoBook';
import { createBookInSnapshot, createPersonInSnapshot, emptySnapshot } from './library';
import { addReflectionToSnapshot, createReflection, ensureMemoryMoments } from './mutations';
import { normalizeSnapshotValue } from './repository';
import { seedSnapshot } from './seed';

const familyArchive = () => {
  const empty = emptySnapshot(seedSnapshot.settings, 'Семья Ивановых');
  const withBook = createBookInSnapshot(empty, { title: 'Наша книга' }, 'Детство').snapshot;
  return createPersonInSnapshot(withBook, { name: 'Бабушка Галя', relation: 'Бабушка' });
};

describe('demo book', () => {
  it('is added next to the family’s own book and taken away without touching it', () => {
    const { snapshot: own, person } = familyArchive();
    const withDemo = addDemo(own);
    expect(hasDemo(withDemo)).toBe(true);
    expect(withDemo.settings).toMatchObject({ demoBook: true, activeBookId: DEMO_BOOK_ID });
    expect(withDemo.books).toHaveLength(2);
    // Demo people and the demo book belong to this family archive.
    expect(withDemo.people.every((item) => item.projectId === own.project.id)).toBe(true);
    expect(withDemo.books.every((item) => item.projectId === own.project.id)).toBe(true);
    expect(demoDependents(withDemo)).toBe(0);

    const { snapshot: back } = removeDemo(withDemo);
    expect(hasDemo(back)).toBe(false);
    expect(back.settings.demoBook).toBeUndefined();
    expect(back.books.map((item) => item.title)).toEqual(['Наша книга']);
    expect(back.people.map((item) => item.id)).toEqual([person.id]);
    expect(back.chapters.map((item) => item.title)).toEqual(['Детство']);
    expect(back.mediaAssets).toHaveLength(0);
    expect(back.questions.every((item) => item.personId === person.id)).toBe(true);
  });

  it('leaves an older archive on start unless something of the family’s own is inside, it is shared or turned on', () => {
    const older = normalizeSnapshotValue(ensureMemoryMoments(structuredClone(seedSnapshot)));
    expect(hasDemo(dropUnusedDemo(older, new Set()))).toBe(false);
    expect(dropUnusedDemo(older, new Set([DEMO_BOOK_ID]))).toBe(older);
    const turnedOn = { ...older, settings: { ...older.settings, demoBook: true } };
    expect(dropUnusedDemo(turnedOn, new Set())).toBe(turnedOn);

    const comment = createReflection({ momentId: older.moments[0].id, text: 'Помню этот день!' });
    const withComment = addReflectionToSnapshot(older, comment);
    expect(demoDependents(withComment)).toBe(1);
    expect(dropUnusedDemo(withComment, new Set())).toBe(withComment);
    // Turned off by hand, the demo goes with what was added inside it.
    expect(removeDemo(withComment).snapshot.reflections.some((item) => item.id === comment.id)).toBe(false);
  });
});
