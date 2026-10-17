import { describe, expect, it } from 'vitest';
import { loadFamilyServer } from '../../server/google-apps-script/dev/fakeGoogle.mjs';

function ownerWithBook() {
  const server = loadFamilyServer();
  const claim = server.post({ action: 'claim', name: 'Сергей' });
  const ownerToken = claim.token as string;
  const created = server.post({ action: 'createBook', token: ownerToken, bookId: 'book_1', title: 'Книга бабушки' });
  expect(created.ok).toBe(true);
  return { server, ownerToken };
}

function invite(server: ReturnType<typeof loadFamilyServer>, token: string, personId = 'person_mama', personName = 'Мама') {
  const result = server.post({ action: 'createInvite', token, bookId: 'book_1', personId, personName });
  expect(result.ok).toBe(true);
  return result.code as string;
}

describe('family server (Code.gs)', () => {
  it('answers info and lets only the first device claim the storage', () => {
    const server = loadFamilyServer();
    expect(server.get()).toMatchObject({ ok: true, app: 'family-stories' });
    expect(server.post({ action: 'info' })).toMatchObject({ ok: true, claimed: false });
    const claim = server.post({ action: 'claim', name: 'Сергей' });
    expect(claim).toMatchObject({ ok: true, member: { name: 'Сергей', admin: true } });
    expect(typeof claim.token).toBe('string');
    expect(server.post({ action: 'info' })).toMatchObject({ claimed: true });
    expect(server.post({ action: 'claim', name: 'Чужой' })).toMatchObject({ ok: false, error: 'claimed' });
  });

  it('keeps only hashes of device keys and invite codes', () => {
    const { server, ownerToken } = ownerWithBook();
    const code = invite(server, ownerToken);
    const stored = JSON.stringify([...server.fake.properties.entries()]);
    expect(stored).not.toContain(ownerToken);
    expect(stored).not.toContain(code);
  });

  it('creates a book folder with a state file in the owner Drive', () => {
    const { server } = ownerWithBook();
    const names = [...server.fake.drive.files.values()].map((file) => file.name);
    expect(names).toEqual(expect.arrayContaining(['Истории близких — семейное хранилище', 'Книга бабушки', 'Фото, голос и видео', 'book.json']));
  });

  it('rejects requests without a valid device key', () => {
    const { server } = ownerWithBook();
    expect(server.post({ action: 'me' })).toMatchObject({ ok: false, error: 'unauthorized' });
    expect(server.post({ action: 'me', token: 'nope' })).toMatchObject({ ok: false, error: 'unauthorized' });
    expect(server.post({ action: 'sync', token: 'nope', bookId: 'book_1', sinceRev: 0, changes: [] })).toMatchObject({ error: 'unauthorized' });
  });

  it('invites a relative who then reads and writes the book', () => {
    const { server, ownerToken } = ownerWithBook();
    const pushed = server.post({ action: 'sync', token: ownerToken, bookId: 'book_1', sinceRev: 0,
      changes: [{ key: 'book:book_1', data: { id: 'book_1', title: 'Книга бабушки Веры' } }, { key: 'chapter:c1', data: { id: 'c1', title: 'Детство' } }] });
    expect(pushed).toMatchObject({ ok: true, rev: 2, title: 'Книга бабушки Веры' });

    const code = invite(server, ownerToken);
    expect(server.post({ action: 'previewInvite', code })).toMatchObject({ ok: true, bookTitle: 'Книга бабушки Веры', inviterName: 'Сергей', personName: 'Мама' });
    const accepted = server.post({ action: 'acceptInvite', code });
    expect(accepted).toMatchObject({ ok: true, member: { name: 'Мама', admin: false }, book: { id: 'book_1', personId: 'person_mama', canManage: false } });
    const mamaToken = accepted.token as string;

    const pulled = server.post({ action: 'sync', token: mamaToken, bookId: 'book_1', sinceRev: 0, changes: [] });
    expect((pulled.entities as { key: string }[]).map((item) => item.key).sort()).toEqual(['book:book_1', 'chapter:c1']);

    // Mama's moment is taken; deleting the owner's chapter is refused and the chapter comes back.
    const ownerId = (server.post({ action: 'me', token: ownerToken }).member as { id: string }).id;
    const mamaId = (accepted.member as { id: string }).id;
    const added = server.post({ action: 'sync', token: mamaToken, bookId: 'book_1', sinceRev: 2,
      changes: [{ key: 'moment:m1', data: { id: 'm1', title: 'Сенокос' } }, { key: 'chapter:c1', deleted: true }] });
    expect(added).toMatchObject({ rev: 3, denied: ['chapter:c1'] });
    expect(added.entities).toEqual([
      { key: 'chapter:c1', rev: 2, data: { id: 'c1', title: 'Детство' }, owner: ownerId },
      { key: 'moment:m1', rev: 3, data: { id: 'm1', title: 'Сенокос' }, owner: mamaId }
    ]);

    const ownerView = server.post({ action: 'sync', token: ownerToken, bookId: 'book_1', sinceRev: 2, changes: [] });
    expect((ownerView.entities as { key: string }[]).map((item) => item.key).sort()).toEqual(['moment:m1']);
    const quiet = server.post({ action: 'sync', token: ownerToken, bookId: 'book_1', sinceRev: 3, changes: [] });
    expect(quiet).toMatchObject({ ok: true, rev: 3, entities: [] });
  });

  it('lets a relative delete only what they added, and the creator anything', () => {
    const { server, ownerToken } = ownerWithBook();
    const sync = (token: string, changes: unknown[]) => server.post({ action: 'sync', token, bookId: 'book_1', sinceRev: 0, changes });
    const keysOf = (reply: Record<string, unknown>) => (reply.denied as string[]).sort();
    sync(ownerToken, [
      { key: 'book:book_1', data: { id: 'book_1', title: 'Книга бабушки' } },
      { key: 'chapter:c1', data: { id: 'c1', bookId: 'book_1' } },
      { key: 'moment:m1', data: { id: 'm1', chapterId: 'c1' } }
    ]);
    const mamaToken = server.post({ action: 'acceptInvite', code: invite(server, ownerToken) }).token as string;
    sync(mamaToken, [
      { key: 'perspective:p1', data: { id: 'p1', momentId: 'm1' } },
      { key: 'moment:m2', data: { id: 'm2', chapterId: 'c1' } },
      { key: 'perspective:p2', data: { id: 'p2', momentId: 'm2' } },
      { key: 'chapter:c2', data: { id: 'c2', bookId: 'book_1' } },
      { key: 'moment:m3', data: { id: 'm3', chapterId: 'c2' } }
    ]);
    // An edit by the creator keeps Mama as the author of her moment.
    sync(ownerToken, [{ key: 'moment:m3', data: { id: 'm3', chapterId: 'c2', title: 'Поправил' } }, { key: 'reflection:r1', data: { id: 'r1', momentId: 'm3' } }]);

    // Someone else's moment, chapter, the book and a person are refused; her own story goes.
    const first = sync(mamaToken, [
      { key: 'moment:m1', deleted: true }, { key: 'chapter:c1', deleted: true }, { key: 'perspective:p1', deleted: true },
      { key: 'book:book_1', deleted: true }, { key: 'person:person_mama', deleted: true }
    ]);
    expect(keysOf(first)).toEqual(['book:book_1', 'chapter:c1', 'moment:m1', 'person:person_mama']);
    const returned = new Map((first.entities as { key: string; deleted?: boolean }[]).map((item) => [item.key, item]));
    expect(returned.get('moment:m1')).toMatchObject({ data: { id: 'm1' } });
    expect(returned.get('perspective:p1')).toMatchObject({ deleted: true });

    // Her chapter still holds her moment with the creator's comment: both stay.
    const second = sync(mamaToken, [{ key: 'chapter:c2', deleted: true }, { key: 'moment:m3', deleted: true }, { key: 'reflection:r1', deleted: true }]);
    expect(keysOf(second)).toEqual(['chapter:c2', 'moment:m3', 'reflection:r1']);
    // Her own moment with her own story goes.
    const third = sync(mamaToken, [{ key: 'moment:m2', deleted: true }, { key: 'perspective:p2', deleted: true }]);
    expect(third.denied).toEqual([]);

    // The creator deletes anything, except the book and people through sync.
    const owner = sync(ownerToken, [{ key: 'chapter:c2', deleted: true }, { key: 'moment:m3', deleted: true }, { key: 'reflection:r1', deleted: true }, { key: 'book:book_1', deleted: true }]);
    expect(owner.denied).toEqual(['book:book_1']);
    const state = new Map((sync(ownerToken, []).entities as { key: string; deleted?: boolean }[]).map((item) => [item.key, Boolean(item.deleted)]));
    expect(Object.fromEntries(state)).toMatchObject({ 'book:book_1': false, 'chapter:c1': false, 'moment:m1': false, 'chapter:c2': true, 'moment:m3': true, 'moment:m2': true });
  });

  it('stores Russian text intact in the Drive file', () => {
    const { server, ownerToken } = ownerWithBook();
    server.post({ action: 'sync', token: ownerToken, bookId: 'book_1', sinceRev: 0, changes: [{ key: 'moment:m1', data: { id: 'm1', title: 'Ёлка у бабушки — «чудо»' } }] });
    const stateFile = [...server.fake.drive.files.values()].find((file) => file.name === 'book.json')!;
    const raw = new TextDecoder().decode(stateFile.content);
    expect(/^[\x20-\x7e]*$/.test(raw)).toBe(true);
    expect(JSON.parse(raw).entities['moment:m1'].data.title).toBe('Ёлка у бабушки — «чудо»');
  });

  it('lets only the creator or the storage owner invite, list and remove members', () => {
    const { server, ownerToken } = ownerWithBook();
    const mamaToken = server.post({ action: 'acceptInvite', code: invite(server, ownerToken) }).token as string;
    expect(server.post({ action: 'createInvite', token: mamaToken, bookId: 'book_1', personName: 'Брат' })).toMatchObject({ ok: false, error: 'forbidden' });

    // Mama creates her own book on the same Drive and invites her brother into it.
    expect(server.post({ action: 'createBook', token: mamaToken, bookId: 'book_mama', title: 'Мамины рассказы' })).toMatchObject({ ok: true, book: { canManage: true } });
    const brotherCode = server.post({ action: 'createInvite', token: mamaToken, bookId: 'book_mama', personName: 'Брат' }).code as string;
    const brother = server.post({ action: 'acceptInvite', code: brotherCode });
    expect(brother).toMatchObject({ ok: true, book: { id: 'book_mama' } });
    const brotherBooks = server.post({ action: 'me', token: brother.token as string }).books as { id: string }[];
    expect(brotherBooks.map((book) => book.id)).toEqual(['book_mama']);

    // The storage owner sees every book and can step into one without an invite.
    const ownerBooks = server.post({ action: 'me', token: ownerToken }).books as { id: string; member: boolean }[];
    expect(ownerBooks.find((book) => book.id === 'book_mama')).toMatchObject({ member: false });
    expect(server.post({ action: 'joinBook', token: ownerToken, bookId: 'book_mama' })).toMatchObject({ ok: true, book: { member: true } });

    const members = server.post({ action: 'members', token: mamaToken, bookId: 'book_mama' }).members as { id: string; name: string; isCreator: boolean }[];
    expect(members.map((item) => item.name).sort()).toEqual(['Брат', 'Мама', 'Сергей']);
    const brotherId = members.find((item) => item.name === 'Брат')!.id;
    expect(server.post({ action: 'removeMember', token: mamaToken, bookId: 'book_mama', memberId: brotherId })).toMatchObject({ ok: true });
    expect(server.post({ action: 'sync', token: brother.token as string, bookId: 'book_mama', sinceRev: 0, changes: [] })).toMatchObject({ ok: false, error: 'not_member' });

    // The link he used is cancelled with him: neither his phone nor a new one gets back in.
    expect(server.post({ action: 'acceptInvite', code: brotherCode, token: brother.token })).toMatchObject({ ok: false, error: 'invite_not_found' });
    expect(server.post({ action: 'acceptInvite', code: brotherCode, name: 'Брат' })).toMatchObject({ ok: false, error: 'invite_not_found' });
  });

  it('needs a new invitation after a relative leaves the book', () => {
    const { server, ownerToken } = ownerWithBook();
    const code = invite(server, ownerToken);
    const mama = server.post({ action: 'acceptInvite', code });
    expect(server.post({ action: 'leaveBook', token: mama.token, bookId: 'book_1' })).toMatchObject({ ok: true });
    const members = server.post({ action: 'members', token: ownerToken, bookId: 'book_1' }).members as { name: string }[];
    expect(members.map((item) => item.name)).toEqual(['Сергей']);
    expect(server.post({ action: 'acceptInvite', code, token: mama.token })).toMatchObject({ ok: false, error: 'invite_not_found' });
    expect(server.post({ action: 'acceptInvite', code: invite(server, ownerToken), token: mama.token })).toMatchObject({ ok: true, book: { id: 'book_1' } });
  });

  it('lets one invite link connect a second phone of the same person', () => {
    const { server, ownerToken } = ownerWithBook();
    const code = invite(server, ownerToken);
    const phone = server.post({ action: 'acceptInvite', code });
    const tablet = server.post({ action: 'acceptInvite', code });
    expect(phone).toMatchObject({ ok: true });
    expect(tablet).toMatchObject({ ok: true });
    expect(tablet.token).not.toBe(phone.token);
  });

  it('adds a book to an already connected device instead of creating a second member', () => {
    const { server, ownerToken } = ownerWithBook();
    const mama = server.post({ action: 'acceptInvite', code: invite(server, ownerToken) });
    server.post({ action: 'createBook', token: ownerToken, bookId: 'book_2', title: 'Вторая' });
    const second = server.post({ action: 'createInvite', token: ownerToken, bookId: 'book_2', personName: 'Мама' }).code as string;
    const again = server.post({ action: 'acceptInvite', code: second, token: mama.token });
    expect(again.token).toBeUndefined();
    expect(again).toMatchObject({ member: { id: (mama.member as { id: string }).id } });
  });

  it('rejects unknown and expired invites', () => {
    const { server, ownerToken } = ownerWithBook();
    expect(server.post({ action: 'previewInvite', code: 'x'.repeat(40) })).toMatchObject({ ok: false, error: 'invite_not_found' });
    const code = invite(server, ownerToken);
    const key = [...server.fake.properties.keys()].find((item) => item.startsWith('i:'))!;
    const stored = JSON.parse(server.fake.properties.get(key)!);
    server.fake.properties.set(key, JSON.stringify({ ...stored, expiresAt: '2000-01-01T00:00:00.000Z' }));
    expect(server.post({ action: 'acceptInvite', code })).toMatchObject({ ok: false, error: 'invite_expired' });
  });

  it('validates change keys and payloads', () => {
    const { server, ownerToken } = ownerWithBook();
    const bad = (changes: unknown[]) => server.post({ action: 'sync', token: ownerToken, bookId: 'book_1', sinceRev: 0, changes });
    expect(bad([{ key: 'script:alert', data: { id: 'alert' } }])).toMatchObject({ ok: false, error: 'bad_request' });
    expect(bad([{ key: 'moment:m1', data: { id: 'other' } }])).toMatchObject({ ok: false, error: 'bad_request' });
    expect(bad([{ key: 'moment:m1', data: 'text' }])).toMatchObject({ ok: false, error: 'bad_request' });
    expect(bad([{ key: 'moment:m1', data: { id: 'm1', text: 'x'.repeat(210000) } }])).toMatchObject({ ok: false, error: 'too_large' });
  });

  it('hands out a media key for the book folder and trashes files of deleted media', () => {
    const { server, ownerToken } = ownerWithBook();
    const access = server.post({ action: 'mediaAccess', token: ownerToken, bookId: 'book_1' });
    expect(access).toMatchObject({ ok: true, api: 'https://www.googleapis.com' });
    const folderId = access.folderId as string;
    const upload = server.fake.drive.handle({ method: 'POST', url: '/upload/drive/v3/files?uploadType=resumable', headers: { authorization: `Bearer ${access.accessToken}` },
      body: JSON.stringify({ name: 'photo.jpg', parents: [folderId], mimeType: 'image/jpeg' }) });
    const done = server.fake.drive.handle({ method: 'PUT', url: upload.headers.location, body: new Uint8Array([1, 2, 3]) });
    const fileId = JSON.parse(new TextDecoder().decode(done.body)).id as string;
    server.post({ action: 'sync', token: ownerToken, bookId: 'book_1', sinceRev: 0, changes: [{ key: 'file:media_1', data: { fileId } }] });
    expect(server.fake.drive.liveFilesUnder(folderId)).toHaveLength(1);
    server.post({ action: 'sync', token: ownerToken, bookId: 'book_1', sinceRev: 1, changes: [{ key: 'file:media_1', deleted: true }] });
    expect(server.fake.drive.liveFilesUnder(folderId)).toHaveLength(0);
  });

  it('deletes a book for everyone and lets non-creators only leave', () => {
    const { server, ownerToken } = ownerWithBook();
    const mamaToken = server.post({ action: 'acceptInvite', code: invite(server, ownerToken) }).token as string;
    expect(server.post({ action: 'deleteBook', token: mamaToken, bookId: 'book_1' })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(server.post({ action: 'leaveBook', token: ownerToken, bookId: 'book_1' })).toMatchObject({ ok: false, error: 'forbidden' });
    expect(server.post({ action: 'deleteBook', token: ownerToken, bookId: 'book_1' })).toMatchObject({ ok: true });
    expect(server.post({ action: 'sync', token: mamaToken, bookId: 'book_1', sinceRev: 0, changes: [] })).toMatchObject({ ok: false, error: 'book_not_found' });
    const folder = [...server.fake.drive.files.values()].find((file) => file.name === 'Книга бабушки')!;
    expect(folder.trashed).toBe(true);
  });

  it('keeps a display name per book: chosen when creating, joining, and changed by the creator or the person', () => {
    const server = loadFamilyServer();
    const ownerToken = server.post({ action: 'claim', name: 'Сергей' }).token as string;
    server.post({ action: 'createBook', token: ownerToken, bookId: 'book_1', title: 'Книга бабушки', name: 'Серёжа', personId: 'person_me' });
    const code = server.post({ action: 'createInvite', token: ownerToken, bookId: 'book_1' }).code as string;
    expect(server.post({ action: 'previewInvite', code })).toMatchObject({ inviterName: 'Серёжа', personName: '', personId: null });

    // An invitation without a name: the relative signs as a new person of her own.
    const joined = server.post({ action: 'acceptInvite', code, name: 'Тётя Галя', profileName: 'Галина', personId: 'person_galya' });
    expect(joined).toMatchObject({ ok: true, member: { name: 'Галина' }, book: { personId: 'person_galya', creatorName: 'Серёжа' } });
    const galyaToken = joined.token as string;
    const galyaId = (joined.member as { id: string }).id;
    const list = () => (server.post({ action: 'members', token: ownerToken, bookId: 'book_1' }).members as { id: string; name: string; personId: string | null }[]);
    expect(list().map((item) => [item.name, item.personId])).toEqual([['Серёжа', 'person_me'], ['Тётя Галя', 'person_galya']]);

    // She renames herself; only the creator renames others.
    expect(server.post({ action: 'updateMember', token: galyaToken, bookId: 'book_1', name: 'Галя' })).toMatchObject({ ok: true });
    expect(server.post({ action: 'updateMember', token: galyaToken, bookId: 'book_1', memberId: (server.post({ action: 'me', token: ownerToken }).member as { id: string }).id, name: 'Кто-то' }))
      .toMatchObject({ ok: false, error: 'forbidden' });
    expect(server.post({ action: 'updateMember', token: ownerToken, bookId: 'book_1', memberId: galyaId, name: 'Галина Петровна' })).toMatchObject({ ok: true });
    expect(server.post({ action: 'updateMember', token: ownerToken, bookId: 'book_1', name: 'Сергей' })).toMatchObject({ ok: true, book: { creatorName: 'Сергей' } });
    expect(list().map((item) => item.name)).toEqual(['Сергей', 'Галина Петровна']);
    // Nobody signs as someone else's person.
    expect(server.post({ action: 'updateMember', token: galyaToken, bookId: 'book_1', personId: 'person_me' })).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('takes a person’s new name only from the creator, the person, or whoever added them', () => {
    const { server, ownerToken } = ownerWithBook();
    server.post({ action: 'sync', token: ownerToken, bookId: 'book_1', sinceRev: 0, changes: [
      { key: 'person:person_mama', data: { id: 'person_mama', name: 'Мама' } },
      { key: 'person:person_grandpa', data: { id: 'person_grandpa', name: 'Дедушка' } }
    ] });
    const mamaToken = server.post({ action: 'acceptInvite', code: invite(server, ownerToken), name: 'Ольга' }).token as string;
    const renamed = server.post({ action: 'sync', token: mamaToken, bookId: 'book_1', sinceRev: 2, changes: [
      { key: 'person:person_mama', data: { id: 'person_mama', name: 'Ольга' } },
      { key: 'person:person_grandpa', data: { id: 'person_grandpa', name: 'Дед' } },
      { key: 'person:person_aunt', data: { id: 'person_aunt', name: 'Тётя' } }
    ] });
    expect(renamed.denied).toEqual(['person:person_grandpa']);
    const names = Object.fromEntries((renamed.entities as { key: string; data: { name: string } }[]).map((item) => [item.key, item.data.name]));
    expect(names).toEqual({ 'person:person_mama': 'Ольга', 'person:person_grandpa': 'Дедушка', 'person:person_aunt': 'Тётя' });
    // The aunt is Mama's: she may rename her; the creator renames anyone.
    expect(server.post({ action: 'sync', token: mamaToken, bookId: 'book_1', sinceRev: 4, changes: [
      { key: 'person:person_aunt', data: { id: 'person_aunt', name: 'Тётя Люба' } }] }).denied).toEqual([]);
    expect(server.post({ action: 'sync', token: ownerToken, bookId: 'book_1', sinceRev: 5, changes: [
      { key: 'person:person_mama', data: { id: 'person_mama', name: 'Ольга Ивановна' } }] }).denied).toEqual([]);
  });

  it('resetOwner disconnects the lost owner device and allows a new claim', () => {
    const { server, ownerToken } = ownerWithBook();
    server.run('resetOwner');
    expect(server.post({ action: 'me', token: ownerToken })).toMatchObject({ ok: false, error: 'unauthorized' });
    const claim = server.post({ action: 'claim', name: 'Сергей' });
    expect(claim).toMatchObject({ ok: true, member: { admin: true } });
    const books = server.post({ action: 'me', token: claim.token }).books as { id: string; canManage: boolean }[];
    expect(books).toEqual([expect.objectContaining({ id: 'book_1', canManage: true })]);
  });

  it('setup creates the storage folder and explains the next step', () => {
    const server = loadFamilyServer();
    server.run('setup');
    expect(server.fake.logs.join('\n')).toContain('Веб-приложение');
    expect(server.fake.properties.get('root')).toBeTruthy();
  });
});
