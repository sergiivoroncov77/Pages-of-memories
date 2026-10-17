import { describe, expect, it } from 'vitest';
import { createBookInSnapshot, createPersonInSnapshot, deleteBookFromSnapshot, deleteMomentsFromSnapshot, emptySnapshot, newSelfPerson, updatePersonInSnapshot } from '../data/library';
import {
  addMediaAssetToSnapshot,
  addMomentToSnapshot,
  addPerspectiveToSnapshot,
  addReflectionToSnapshot,
  createMediaAsset,
  createMoment,
  createPerspective,
  createReflection,
  ensureMemoryMoments,
  updateMomentInSnapshot
} from '../data/mutations';
import { normalizeSnapshotValue } from '../data/repository';
import { seedSnapshot } from '../data/seed';
import type { AppSnapshot } from '../data/types';
import { createMemoryMediaStore, storedMediaUrl } from '../lib/mediaStore';
import { loadFamilyServer, type FamilyServer } from '../../server/google-apps-script/dev/fakeGoogle.mjs';
import { createDriveTransfer, type FetchLike } from './cloudApi';
import { createCloudStateStore, freshBookState } from './cloudState';
import { deletionBlocker } from './permissions';
import { createSyncEngine } from './syncEngine';

const SERVER_URL = 'https://script.google.com/macros/s/AKfycbTestDeployment1234567890/exec';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

interface Hooks { beforeSyncReply?: () => void; offline?: boolean }

function fakeFetch(server: FamilyServer, hooks: Hooks): FetchLike {
  return async (input, init) => {
    if (hooks.offline) throw new TypeError('Failed to fetch');
    if (input === SERVER_URL) {
      const request = JSON.parse(String(init?.body));
      const reply = server.post(request);
      if (request.action === 'sync') hooks.beforeSyncReply?.();
      return new Response(JSON.stringify(reply), { status: 200 });
    }
    if (input.startsWith('https://www.googleapis.com/')) {
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const body = init?.body instanceof Blob ? new Uint8Array(await init.body.arrayBuffer()) : typeof init?.body === 'string' ? init.body : undefined;
      const reply = server.fake.drive.handle({ method: init?.method ?? 'GET', url: input, headers, body });
      return new Response(reply.body.length ? reply.body : null, { status: reply.status, headers: reply.headers });
    }
    throw new TypeError('Failed to fetch');
  };
}

function device(server: FamilyServer, initial: AppSnapshot) {
  let snapshot = initial;
  const hooks: Hooks = {};
  const blobs = createMemoryMediaStore();
  const store = createCloudStateStore(memoryStorage());
  const stored: string[] = [];
  const fetchImpl = fakeFetch(server, hooks);
  const engine = createSyncEngine({
    store, blobs, fetch: fetchImpl, media: createDriveTransfer(fetchImpl),
    getSnapshot: () => snapshot,
    commit: (update) => { snapshot = update(snapshot); return true; },
    onMediaStored: (id) => stored.push(id)
  });
  return {
    engine, blobs, store, hooks, stored,
    get snapshot() { return snapshot; },
    edit(update: (current: AppSnapshot) => AppSnapshot) { snapshot = normalizeSnapshotValue(update(snapshot)); }
  };
}

/** The demo family and its book, as an older version opened them. */
const demoSnapshot = () => normalizeSnapshotValue(ensureMemoryMoments(structuredClone(seedSnapshot)));

/** The owner's phone: one book with a chapter, a moment, a story with a photo, and Mama in the family. */
function ownerSnapshot() {
  let snapshot = emptySnapshot(seedSnapshot.settings, 'Семья Ивановых');
  const created = createBookInSnapshot(snapshot, { title: 'Книга бабушки Веры' }, 'Детство');
  snapshot = created.snapshot;
  const chapter = snapshot.chapters.find((item) => item.bookId === created.book.id)!;
  const mama = createPersonInSnapshot(snapshot, { name: 'Мама', relation: 'мама' });
  snapshot = mama.snapshot;
  const moment = createMoment({ bookId: created.book.id, chapterId: chapter.id, title: 'Сенокос', summary: 'Июль в деревне' });
  snapshot = addMomentToSnapshot(snapshot, moment);
  const photo = createMediaAsset({ type: 'photo', url: storedMediaUrl('media_photo1'), mimeType: 'image/jpeg', alt: 'Стог', sizeBytes: 3 }, 'media_photo1');
  snapshot = addMediaAssetToSnapshot(snapshot, photo);
  snapshot = addPerspectiveToSnapshot(snapshot, createPerspective({ momentId: moment.id, type: 'photo', content: 'Стог сена', mediaAssetId: photo.id, isPrimary: true }));
  return { snapshot: normalizeSnapshotValue(snapshot), bookId: created.book.id, momentId: moment.id, chapterId: chapter.id, mamaId: mama.person.id };
}

async function ownerAndMama() {
  const server = loadFamilyServer();
  const setup = ownerSnapshot();
  const owner = device(server, setup.snapshot);
  await owner.blobs.put('media_photo1', new Blob([new Uint8Array([7, 7, 7])], { type: 'image/jpeg' }));
  await owner.engine.connectOwner(SERVER_URL, 'Сергей');
  await owner.engine.publishBook(setup.bookId);
  const mama = device(server, emptySnapshot(seedSnapshot.settings, 'Мамин телефон'));
  const { code } = await owner.engine.createInvite(setup.bookId, { id: setup.mamaId, name: 'Мама' });
  const preview = await mama.engine.previewInvite(SERVER_URL, code);
  const joined = await mama.engine.acceptInvite(SERVER_URL, code, { name: preview.personName });
  return { server, owner, mama, setup, preview, joined, code };
}

describe('cloud sync engine', () => {
  it('publishes a book with its photo into the owner Drive', async () => {
    const { server, owner, setup } = await ownerAndMama();
    const state = owner.store.get().books[setup.bookId];
    expect(state.rev).toBeGreaterThan(0);
    expect(state.canManage).toBe(true);
    const uploaded = server.fake.drive.files.get(state.files.media_photo1.fileId)!;
    expect([...uploaded.content]).toEqual([7, 7, 7]);
    expect(uploaded.name).toBe('photo-media_photo1.jpg');
    expect(owner.engine.hasLocalChanges(setup.bookId)).toBe(false);
  });

  it('gives an invited relative the whole book, the photo and who she is', async () => {
    const { mama, setup, preview, joined } = await ownerAndMama();
    expect(preview).toMatchObject({ bookTitle: 'Книга бабушки Веры', inviterName: 'Сергей', personName: 'Мама' });
    expect(joined.book).toMatchObject({ id: setup.bookId, canManage: false });
    const snapshot = mama.snapshot;
    expect(snapshot.books.map((book) => book.title)).toContain('Книга бабушки Веры');
    expect(snapshot.books.find((book) => book.id === setup.bookId)!.projectId).toBe(snapshot.project.id);
    expect(snapshot.chapters.find((chapter) => chapter.id === setup.chapterId)?.title).toBe('Детство');
    expect(snapshot.moments.find((moment) => moment.id === setup.momentId)?.title).toBe('Сенокос');
    expect(snapshot.people.find((person) => person.id === setup.mamaId)?.name).toBe('Мама');
    expect(mama.store.get().books[setup.bookId].personId).toBe(setup.mamaId);
    const photo = snapshot.mediaAssets.find((asset) => asset.id === 'media_photo1')!;
    expect(photo.url).toBe('idb:media_photo1');
    expect([...new Uint8Array(await (await mama.blobs.get('media_photo1'))!.arrayBuffer())]).toEqual([7, 7, 7]);
    expect(mama.stored).toEqual(['media_photo1']);
    expect(mama.engine.hasLocalChanges(setup.bookId)).toBe(false);
  });

  it('brings a relative’s new moment, comment and voice back to the owner', async () => {
    const { owner, mama, setup } = await ownerAndMama();
    const moment = createMoment({ bookId: setup.bookId, chapterId: setup.chapterId, title: 'Как мы ездили на Байкал' });
    const voice = createMediaAsset({ type: 'audio', url: storedMediaUrl('media_voice'), mimeType: 'audio/webm;codecs=opus', sizeBytes: 2 }, 'media_voice');
    await mama.blobs.put('media_voice', new Blob([new Uint8Array([1, 2])], { type: 'audio/webm' }));
    mama.edit((snapshot) => addPerspectiveToSnapshot(addMediaAssetToSnapshot(addMomentToSnapshot(snapshot, moment), voice),
      createPerspective({ momentId: moment.id, type: 'audio', content: 'Голосом', mediaAssetId: voice.id, authorId: setup.mamaId, isPrimary: true })));
    mama.edit((snapshot) => addReflectionToSnapshot(snapshot, createReflection({ momentId: setup.momentId, text: 'Я помню этот стог!', authorId: setup.mamaId })));
    expect(mama.engine.hasLocalChanges(setup.bookId)).toBe(true);
    const sent = await mama.engine.syncBook(setup.bookId);
    expect(sent).toMatchObject({ status: 'synced', uploaded: 1 });

    const result = await owner.engine.syncAll();
    expect(result.failed).toEqual([]);
    const snapshot = owner.snapshot;
    expect(snapshot.moments.find((item) => item.id === moment.id)?.title).toBe('Как мы ездили на Байкал');
    const story = snapshot.perspectives.find((item) => item.momentId === moment.id)!;
    expect(story).toMatchObject({ type: 'audio', authorId: setup.mamaId, isPrimary: true });
    expect(snapshot.reflections.find((item) => item.momentId === setup.momentId)?.text).toBe('Я помню этот стог!');
    expect([...new Uint8Array(await (await owner.blobs.get('media_voice'))!.arrayBuffer())]).toEqual([1, 2]);
    expect(owner.engine.hasLocalChanges(setup.bookId)).toBe(false);
  });

  it('passes edits and deletions both ways and trashes deleted files on Drive', async () => {
    const { server, owner, mama, setup } = await ownerAndMama();
    owner.edit((snapshot) => updateMomentInSnapshot(snapshot, setup.momentId, { title: 'Сенокос, 1962' }));
    await owner.engine.syncBook(setup.bookId);
    await mama.engine.syncBook(setup.bookId);
    expect(mama.snapshot.moments.find((item) => item.id === setup.momentId)?.title).toBe('Сенокос, 1962');

    // The creator deletes the moment: it goes for everyone, with its photo.
    const fileId = owner.store.get().books[setup.bookId].files.media_photo1.fileId;
    expect(await mama.blobs.get('media_photo1')).toBeDefined();
    owner.edit((snapshot) => deleteMomentsFromSnapshot(snapshot, [setup.momentId]).snapshot);
    await owner.engine.syncBook(setup.bookId);
    await mama.engine.syncBook(setup.bookId);
    expect(mama.snapshot.moments.some((item) => item.id === setup.momentId)).toBe(false);
    expect(mama.snapshot.mediaAssets.some((item) => item.id === 'media_photo1')).toBe(false);
    expect(await mama.blobs.get('media_photo1')).toBeUndefined();
    expect(server.fake.drive.files.get(fileId)?.trashed).toBe(true);
  });

  it('lets a relative delete only what she added and brings back the rest', async () => {
    const { owner, mama, setup } = await ownerAndMama();
    const memberId = mama.store.get().connection!.memberId;
    const mamaBook = () => mama.store.get().books[setup.bookId];
    expect(deletionBlocker(mama.snapshot, mamaBook(), memberId, { type: 'moment', id: setup.momentId })).toContain('Сергей');
    expect(deletionBlocker(owner.snapshot, owner.store.get().books[setup.bookId], owner.store.get().connection!.memberId, { type: 'moment', id: setup.momentId })).toBeNull();

    // Deleting the owner's moment anyway (an old app, a race): the storage refuses and it comes back with its photo.
    mama.edit((snapshot) => deleteMomentsFromSnapshot(snapshot, [setup.momentId]).snapshot);
    await mama.blobs.delete('media_photo1');
    const refused = await mama.engine.syncBook(setup.bookId);
    expect(refused.denied).toBeGreaterThan(0);
    expect(mama.snapshot.moments.find((item) => item.id === setup.momentId)?.title).toBe('Сенокос');
    expect(mama.snapshot.mediaAssets.some((item) => item.id === 'media_photo1')).toBe(true);
    expect(await mama.blobs.get('media_photo1')).toBeDefined();
    expect(mama.engine.hasLocalChanges(setup.bookId)).toBe(false);
    await owner.engine.syncBook(setup.bookId);
    expect(owner.snapshot.moments.some((item) => item.id === setup.momentId)).toBe(true);

    // Her own moment, with her story and the owner's comment on it.
    const own = createMoment({ bookId: setup.bookId, chapterId: setup.chapterId, title: 'Мамин момент', summary: '' });
    mama.edit((snapshot) => addPerspectiveToSnapshot(addMomentToSnapshot(snapshot, own), createPerspective({ momentId: own.id, type: 'text', content: 'Моё', authorId: setup.mamaId, isPrimary: true })));
    await mama.engine.syncBook(setup.bookId);
    expect(deletionBlocker(mama.snapshot, mamaBook(), memberId, { type: 'moment', id: own.id })).toBeNull();
    await owner.engine.syncBook(setup.bookId);
    owner.edit((snapshot) => addReflectionToSnapshot(snapshot, createReflection({ momentId: own.id, text: 'Здорово!' })));
    await owner.engine.syncBook(setup.bookId);
    await mama.engine.syncBook(setup.bookId);
    expect(deletionBlocker(mama.snapshot, mamaBook(), memberId, { type: 'moment', id: own.id })).toContain('других участников');
    expect(deletionBlocker(mama.snapshot, mamaBook(), memberId, { type: 'chapter', id: setup.chapterId })).toContain('добавили не вы');

    // Without the comment, her moment is hers to delete — for everyone.
    owner.edit((snapshot) => ({ ...snapshot, reflections: snapshot.reflections.filter((item) => item.momentId !== own.id) }));
    await owner.engine.syncBook(setup.bookId);
    await mama.engine.syncBook(setup.bookId);
    mama.edit((snapshot) => deleteMomentsFromSnapshot(snapshot, [own.id]).snapshot);
    expect((await mama.engine.syncBook(setup.bookId)).denied).toBe(0);
    await owner.engine.syncBook(setup.bookId);
    expect(owner.snapshot.moments.some((item) => item.id === own.id)).toBe(false);
  });

  it('lets the creator remove a book from one phone only and bring it back later', async () => {
    const { owner, mama, setup } = await ownerAndMama();
    await owner.engine.removeBook(setup.bookId, 'local');
    owner.edit((snapshot) => deleteBookFromSnapshot(snapshot, setup.bookId).snapshot);
    await owner.engine.syncAll();
    expect(owner.snapshot.books.some((book) => book.id === setup.bookId)).toBe(false);
    expect(owner.store.get().books[setup.bookId]).toMatchObject({ detached: true });
    expect(owner.engine.hasLocalChanges(setup.bookId)).toBe(false);
    // Nothing changed for Mama.
    await mama.engine.syncAll();
    expect(mama.snapshot.moments.some((item) => item.id === setup.momentId)).toBe(true);

    await owner.engine.attachBook(setup.bookId);
    expect(owner.snapshot.moments.find((item) => item.id === setup.momentId)?.title).toBe('Сенокос');
    expect(await owner.blobs.get('media_photo1')).toBeDefined();
  });

  it('makes a relative who deletes the book leave it until invited again', async () => {
    const { server, owner, mama, setup, code: firstCode } = await ownerAndMama();
    const ownerToken = owner.store.get().connection!.token;
    const memberNames = () => (server.post({ action: 'members', token: ownerToken, bookId: setup.bookId }).members as { name: string }[]).map((item) => item.name);
    expect(memberNames()).toContain('Мама');
    expect(await mama.engine.removeBook(setup.bookId, 'leave')).toEqual({ pending: false });
    mama.edit((snapshot) => deleteBookFromSnapshot(snapshot, setup.bookId).snapshot);
    expect(memberNames()).not.toContain('Мама');
    expect(mama.store.get().books[setup.bookId]).toBeUndefined();
    await owner.engine.syncAll();
    expect(owner.snapshot.moments.some((item) => item.id === setup.momentId)).toBe(true);
    // The old link no longer works; a new invitation brings the book back.
    await expect(mama.engine.acceptInvite(SERVER_URL, firstCode, { name: 'Мама' })).rejects.toMatchObject({ code: 'invite_not_found' });
    const { code } = await owner.engine.createInvite(setup.bookId);
    await mama.engine.acceptInvite(SERVER_URL, code, { name: 'Мама' });
    expect(mama.snapshot.moments.some((item) => item.id === setup.momentId)).toBe(true);
    expect(memberNames()).toContain('Мама');

    // Offline: the book leaves the phone at once, and the storage hears it on the next sync.
    mama.hooks.offline = true;
    expect(await mama.engine.removeBook(setup.bookId, 'leave')).toEqual({ pending: true });
    mama.edit((snapshot) => deleteBookFromSnapshot(snapshot, setup.bookId).snapshot);
    expect(mama.engine.hasLocalChanges(setup.bookId)).toBe(false);
    expect(memberNames()).toContain('Мама');
    mama.hooks.offline = false;
    await mama.engine.syncAll();
    expect(memberNames()).not.toContain('Мама');
    expect(mama.store.get().books[setup.bookId]).toBeUndefined();
    expect(mama.snapshot.books.some((book) => book.id === setup.bookId)).toBe(false);
  });

  it('never sends deletions from a replaced archive (backup, demo, fresh start)', async () => {
    const { owner, mama, setup } = await ownerAndMama();
    const story = createPerspective({ momentId: setup.momentId, type: 'text', content: 'Мамин рассказ', authorId: setup.mamaId });
    mama.edit((snapshot) => addPerspectiveToSnapshot(snapshot, story));
    await mama.engine.syncBook(setup.bookId);
    await owner.engine.syncBook(setup.bookId);
    expect(owner.snapshot.perspectives.some((item) => item.id === story.id)).toBe(true);

    // An older backup without Mama's story: it is taken back from the storage, not deleted.
    owner.edit(() => setup.snapshot);
    owner.engine.snapshotReplaced('pull');
    await owner.engine.syncAll();
    expect(owner.snapshot.perspectives.some((item) => item.id === story.id)).toBe(true);
    await mama.engine.syncAll();
    expect(mama.snapshot.perspectives.some((item) => item.id === story.id)).toBe(true);

    // A fresh start: shared books leave this phone only and can come back.
    owner.edit(() => emptySnapshot(owner.snapshot.settings, 'Новый архив'));
    owner.engine.snapshotReplaced('detach');
    await owner.engine.syncAll();
    expect(owner.snapshot.books.some((book) => book.id === setup.bookId)).toBe(false);
    await mama.engine.syncAll();
    expect(mama.snapshot.perspectives.some((item) => item.id === story.id)).toBe(true);
    expect(mama.snapshot.moments.some((item) => item.id === setup.momentId)).toBe(true);
    await owner.engine.attachBook(setup.bookId);
    expect(owner.snapshot.perspectives.some((item) => item.id === story.id)).toBe(true);
  });

  it('keeps an edit made while a sync was in flight and sends it next time', async () => {
    const { owner, mama, setup } = await ownerAndMama();
    mama.edit((snapshot) => updateMomentInSnapshot(snapshot, setup.momentId, { title: 'От мамы' }));
    await mama.engine.syncBook(setup.bookId);
    owner.hooks.beforeSyncReply = () => {
      owner.hooks.beforeSyncReply = undefined;
      owner.edit((snapshot) => updateMomentInSnapshot(snapshot, setup.momentId, { title: 'Правка во время синхронизации' }));
    };
    await owner.engine.syncBook(setup.bookId);
    expect(owner.snapshot.moments.find((item) => item.id === setup.momentId)?.title).toBe('Правка во время синхронизации');
    expect(owner.engine.hasLocalChanges(setup.bookId)).toBe(true);
    await owner.engine.syncBook(setup.bookId);
    await mama.engine.syncBook(setup.bookId);
    expect(mama.snapshot.moments.find((item) => item.id === setup.momentId)?.title).toBe('Правка во время синхронизации');
  });

  it('never erases the shared book when a phone starts from a clean slate', async () => {
    const { owner, mama, setup } = await ownerAndMama();
    owner.edit(() => emptySnapshot(owner.snapshot.settings, 'Новый архив'));
    await owner.engine.syncAll();
    expect(owner.snapshot.moments.find((item) => item.id === setup.momentId)?.title).toBe('Сенокос');
    expect(await owner.blobs.get('media_photo1')).toBeDefined();
    await mama.engine.syncAll();
    expect(mama.snapshot.moments.some((item) => item.id === setup.momentId)).toBe(true);
  });

  it('keeps a local copy when a relative is removed from the book', async () => {
    const { owner, mama, setup } = await ownerAndMama();
    const { members } = await owner.engine.members(setup.bookId);
    const mamaMember = members.find((item) => !item.isYou)!;
    expect(mamaMember).toMatchObject({ name: 'Мама', personId: setup.mamaId, isCreator: false });
    await owner.engine.removeMember(setup.bookId, mamaMember.id);
    const result = await mama.engine.syncAll();
    expect(result.unlinked).toEqual([setup.bookId]);
    expect(mama.store.get().books[setup.bookId]).toBeUndefined();
    expect(mama.snapshot.books.some((book) => book.id === setup.bookId)).toBe(true);
  });

  it('lets a relative create her own book on the same Drive and invite others', async () => {
    const { server, owner, mama } = await ownerAndMama();
    const created = createBookInSnapshot(mama.snapshot, { title: 'Мамины рассказы' }, 'Школа');
    mama.edit(() => created.snapshot);
    await mama.engine.publishBook(created.book.id);
    expect(mama.store.get().books[created.book.id].canManage).toBe(true);
    const brother = device(server, emptySnapshot(seedSnapshot.settings, 'Брат'));
    const { code } = await mama.engine.createInvite(created.book.id);
    await brother.engine.acceptInvite(SERVER_URL, code, { name: 'Брат' });
    expect(brother.snapshot.chapters.some((chapter) => chapter.title === 'Школа')).toBe(true);
    // The owner sees the book in the storage but is not a member until he steps in.
    const { books } = await owner.engine.refreshBooks();
    expect(books.find((book) => book.id === created.book.id)).toMatchObject({ member: false, canManage: true });
    // He signs in it with a name he picks for this book, not the one he calls himself.
    const self = newSelfPerson(owner.snapshot, 'Сын Серёжа', 'Участник книги');
    await owner.engine.joinBook(created.book.id, { name: 'Сын Серёжа', self });
    expect(owner.snapshot.books.some((book) => book.id === created.book.id)).toBe(true);
    expect(owner.store.get().books[created.book.id].personId).toBe(self.id);
    const names = (await mama.engine.members(created.book.id)).members.map((member) => member.name);
    expect(names).toEqual(expect.arrayContaining(['Сын Серёжа']));
    expect(names).not.toContain('Сергей');
  });

  it('signs the creator and a relative from a general link as narrators of their own, renamed only by them or the creator', async () => {
    const server = loadFamilyServer();
    const setup = ownerSnapshot();
    const owner = device(server, setup.snapshot);
    const me = newSelfPerson(owner.snapshot, 'Серёжа', 'Автор книги');
    owner.edit((snapshot) => ({ ...snapshot, people: [...snapshot.people, me] }));
    await owner.engine.connectOwner(SERVER_URL, 'Сергей');
    await owner.engine.publishBook(setup.bookId, { personId: me.id, name: me.name });
    expect(owner.store.get().books[setup.bookId]).toMatchObject({ personId: me.id, creatorName: 'Серёжа', people: [me.id] });

    const brother = device(server, emptySnapshot(seedSnapshot.settings, 'Брат'));
    const { code } = await owner.engine.createInvite(setup.bookId);
    expect(await brother.engine.previewInvite(SERVER_URL, code)).toMatchObject({ inviterName: 'Серёжа', personName: '' });
    const self = newSelfPerson(brother.snapshot, 'Брат Коля', 'Участник книги');
    const joined = await brother.engine.acceptInvite(SERVER_URL, code, { name: 'Брат Коля', profileName: 'Николай', self });
    expect(joined.book.personId).toBe(self.id);
    expect(brother.snapshot.people.map((person) => person.name).sort()).toEqual(['Брат Коля', 'Серёжа']);
    await owner.engine.syncBook(setup.bookId);
    expect(owner.snapshot.people.find((person) => person.id === self.id)?.name).toBe('Брат Коля');
    const members = await owner.engine.members(setup.bookId);
    expect(members.members.map((member) => [member.name, member.personId])).toEqual([['Серёжа', me.id], ['Брат Коля', self.id]]);

    // The creator renames him for everyone.
    owner.edit((snapshot) => updatePersonInSnapshot(snapshot, self.id, { name: 'Николай Сергеевич' }));
    await owner.engine.syncBook(setup.bookId);
    await brother.engine.syncBook(setup.bookId);
    expect(brother.snapshot.people.find((person) => person.id === self.id)?.name).toBe('Николай Сергеевич');
    // He may not rename the creator: the storage gives the name back.
    brother.edit((snapshot) => updatePersonInSnapshot(snapshot, me.id, { name: 'Серый' }));
    const refused = await brother.engine.syncBook(setup.bookId);
    expect(refused.denied).toBe(1);
    expect(brother.snapshot.people.find((person) => person.id === me.id)?.name).toBe('Серёжа');
    // His own name is his to change, here and in the list of members.
    brother.edit((snapshot) => updatePersonInSnapshot(snapshot, self.id, { name: 'Коля' }));
    await brother.engine.updateMember(setup.bookId, { name: 'Коля' });
    expect((await brother.engine.syncBook(setup.bookId)).denied).toBe(0);
    await owner.engine.syncBook(setup.bookId);
    expect(owner.snapshot.people.find((person) => person.id === self.id)?.name).toBe('Коля');
    expect((await owner.engine.members(setup.bookId)).members[1].name).toBe('Коля');
  });

  it('refreshes an expired Drive key and still downloads', async () => {
    const { server, owner, setup } = await ownerAndMama();
    const second = device(server, emptySnapshot(seedSnapshot.settings, 'Второй телефон'));
    const { code } = await owner.engine.createInvite(setup.bookId);
    server.fake.rotateToken();
    await second.engine.acceptInvite(SERVER_URL, code, { name: 'Сергей' });
    expect(await second.blobs.get('media_photo1')).toBeDefined();
    server.fake.rotateToken();
    owner.edit((snapshot) => addMediaAssetToSnapshot(snapshot, createMediaAsset({ type: 'photo', url: storedMediaUrl('media_new'), mimeType: 'image/png' }, 'media_new')));
    await owner.blobs.put('media_new', new Blob([new Uint8Array([5])], { type: 'image/png' }));
    owner.edit((snapshot) => ({ ...snapshot, books: snapshot.books.map((book) => book.id === setup.bookId ? { ...book, coverMediaAssetId: 'media_new' } : book) }));
    const outcome = await owner.engine.syncBook(setup.bookId);
    expect(outcome).toMatchObject({ uploaded: 1, mediaPending: 0 });
  });

  it('removes an interview-based moment deleted elsewhere without rebuilding it', async () => {
    const server = loadFamilyServer();
    const owner = device(server, demoSnapshot());
    const bookId = owner.snapshot.settings.activeBookId ?? owner.snapshot.books[0].id;
    const linked = owner.snapshot.moments.find((moment) => moment.bookId === bookId && moment.sourceMemoryId)!;
    await owner.engine.connectOwner(SERVER_URL, 'Сергей');
    await owner.engine.publishBook(bookId);
    // The owner's second device (same key): it may delete what the owner's phone added.
    const relative = device(server, emptySnapshot(seedSnapshot.settings, 'Планшет'));
    relative.store.update(() => ({ version: 1, connection: owner.store.get().connection, books: { [bookId]: freshBookState({ canManage: true }) } }));
    await relative.engine.syncBook(bookId);
    const copy = relative.snapshot.moments.find((moment) => moment.id === linked.id)!;
    expect(copy.sourceMemoryId).toBeUndefined();
    relative.edit((snapshot) => ({ ...snapshot, moments: snapshot.moments.filter((moment) => moment.id !== linked.id) }));
    await relative.engine.syncBook(bookId);
    await owner.engine.syncBook(bookId);
    expect(owner.snapshot.moments.some((moment) => moment.id === linked.id)).toBe(false);
    expect(owner.snapshot.memories.some((memory) => memory.id === linked.sourceMemoryId)).toBe(false);
    expect(owner.engine.hasLocalChanges(bookId)).toBe(false);
  });

  it('forgets the device key when the storage no longer knows it', async () => {
    const { server, mama, setup } = await ownerAndMama();
    const key = [...server.fake.properties.keys()].find((item) => item.startsWith('m:') && JSON.parse(server.fake.properties.get(item)!).name === 'Мама')!;
    server.fake.properties.delete(key);
    await expect(mama.engine.syncBook(setup.bookId)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(mama.store.get().connection).toBeUndefined();
    expect(mama.snapshot.books.some((book) => book.id === setup.bookId)).toBe(true);
  });

  it('rejects storage records that point outside the app', async () => {
    const { server, owner, mama, setup } = await ownerAndMama();
    const ownerToken = owner.store.get().connection!.token;
    const rev = owner.store.get().books[setup.bookId].rev;
    server.post({ action: 'sync', token: ownerToken, bookId: setup.bookId, sinceRev: rev, changes: [
      { key: 'media:media_evil', data: { id: 'media_evil', type: 'photo', url: 'https://evil.example/x.jpg', mimeType: 'image/jpeg', createdAt: '2026-01-01T00:00:00.000Z' } },
      { key: 'moment:m_other', data: { id: 'm_other', bookId: 'another_book', chapterId: setup.chapterId, title: 'x', summary: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', favorite: false } }
    ] });
    await mama.engine.syncBook(setup.bookId);
    expect(mama.snapshot.mediaAssets.some((asset) => asset.id === 'media_evil')).toBe(false);
    expect(mama.snapshot.moments.some((moment) => moment.id === 'm_other')).toBe(false);
  });
});
