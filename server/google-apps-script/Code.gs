/**
 * «Истории близких» — семейное хранилище на Google Диске.
 *
 * Скрипт работает от имени владельца Google аккаунта и хранит книги в папке
 * «Истории близких» на его Диске. Близким аккаунт Google не нужен: приложение
 * подключается к скрипту по ссылке-приглашению с секретным ключом.
 *
 * Права скрипта ограничены `drive.file` (см. appsscript.json): он видит только
 * файлы, которые создал сам, а остальной Диск владельца ему недоступен.
 *
 * Как установить — docs/GOOGLE_DRIVE_SETUP.md или «Настройки → Семейное
 * хранилище → пошаговая инструкция» в приложении.
 */

var APP = 'family-stories';
var VERSION = 1;
var DRIVE = 'https://www.googleapis.com';
var ROOT_FOLDER_NAME = 'Истории близких — семейное хранилище';
var INVITE_DAYS = 30;
var MAX_CHANGES = 5000;
var MAX_ENTITY_CHARS = 200000;
var ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;
var KEY_PATTERN = /^(book|chapter|moment|perspective|reflection|media|person|file):[A-Za-z0-9_.:-]{1,160}$/;

// ---------- Запуск вручную из редактора ----------

/** Запустите один раз кнопкой «Выполнить»: Google спросит разрешения и создаст папку хранилища. */
function setup() {
  var root = ensureRoot_();
  Logger.log('Готово. Папка хранилища: https://drive.google.com/drive/folders/' + root);
  Logger.log('Дальше: «Начать развертывание» → «Новое развертывание» → тип «Веб-приложение»,'
    + ' «Запуск от имени: меня», «Кто имеет доступ: все». Скопируйте адрес веб-приложения в приложение «Истории близких».');
}

/**
 * Если телефон владельца потерян или браузер очищен: отключает старое
 * устройство владельца, и приложение сможет подключиться заново по адресу скрипта.
 */
function resetOwner() {
  var ownerId = props_().getProperty('owner');
  if (ownerId) props_().deleteProperty('m:' + ownerId);
  props_().deleteProperty('owner');
  Logger.log('Владелец отключён. Откройте приложение и подключите хранилище заново — вы снова станете владельцем.');
}

// ---------- Веб-приложение ----------

function doGet() {
  return json_({ ok: true, app: APP, version: VERSION,
    message: 'Семейное хранилище работает. Скопируйте адрес этой страницы в приложение «Истории близких».' });
}

function doPost(e) {
  var request;
  try {
    request = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '{}');
  } catch (error) {
    return json_(fail_('bad_request', 'Не удалось прочитать запрос.'));
  }
  try {
    return json_(handle_(request && typeof request === 'object' ? request : {}));
  } catch (error) {
    if (error && error.code) return json_(fail_(error.code, error.message));
    console.error(error);
    return json_(fail_('server_error', 'Ошибка в скрипте хранилища: ' + (error && error.message ? error.message : String(error))));
  }
}

function handle_(request) {
  var action = String(request.action || '');
  if (action === 'info') return ok_({ app: APP, version: VERSION, claimed: !!props_().getProperty('owner') });
  if (action === 'claim') return claim_(request);
  if (action === 'previewInvite') return previewInvite_(request);
  if (action === 'acceptInvite') return acceptInvite_(request);
  var member = auth_(request);
  switch (action) {
    case 'me': return me_(member);
    case 'createBook': return createBook_(member, request);
    case 'deleteBook': return deleteBook_(member, request);
    case 'leaveBook': return leaveBook_(member, request);
    case 'joinBook': return joinBook_(member, request);
    case 'createInvite': return createInvite_(member, request);
    case 'members': return members_(member, request);
    case 'removeMember': return removeMember_(member, request);
    case 'sync': return sync_(member, request);
    case 'mediaAccess': return mediaAccess_(member, request);
    default: throw error_('bad_request', 'Неизвестное действие: ' + action);
  }
}

// ---------- Участники ----------

function claim_(request) {
  return withLock_(function () {
    if (props_().getProperty('owner')) {
      throw error_('claimed', 'Хранилище уже подключено к телефону владельца. Попросите у создателя книги ссылку-приглашение.');
    }
    ensureRoot_();
    var created = newMember_(cleanName_(request.name, 'Владелец хранилища'), true);
    props_().setProperty('owner', created.member.id);
    return ok_({ member: publicMember_(created.member), token: created.token });
  });
}

function auth_(request) {
  var token = String(request.token || '');
  if (!token) throw error_('unauthorized', 'Это устройство не подключено к хранилищу.');
  var memberId = props_().getProperty('t:' + hash_(token));
  var member = memberId ? read_('m:' + memberId) : null;
  if (!member) throw error_('unauthorized', 'Это устройство отключено от хранилища. Откройте ссылку-приглашение ещё раз.');
  return member;
}

function newMember_(name, admin) {
  var member = { id: 'member_' + Utilities.getUuid(), name: name, admin: !!admin, createdAt: new Date().toISOString() };
  var token = secret_();
  write_('m:' + member.id, member);
  props_().setProperty('t:' + hash_(token), member.id);
  return { member: member, token: token };
}

function publicMember_(member) {
  return { id: member.id, name: member.name, admin: !!member.admin };
}

function me_(member) {
  var all = props_().getProperties();
  var books = [];
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('b:') !== 0) return;
    var book = JSON.parse(all[key]);
    if (book.members[member.id] || member.admin) books.push(bookSummary_(book, member));
  });
  return ok_({ member: publicMember_(member), books: books });
}

// ---------- Книги ----------

function readBook_(bookId) {
  return read_('b:' + checkId_(bookId));
}

function requireBook_(member, bookId) {
  var book = readBook_(bookId);
  if (!book) throw error_('book_not_found', 'Этой книги больше нет в хранилище.');
  if (!book.members[member.id]) throw error_('not_member', 'Вас нет среди участников этой книги.');
  return book;
}

function requireManager_(member, book) {
  if (book.creatorId !== member.id && !member.admin) {
    throw error_('forbidden', 'Это может сделать только создатель книги — ' + book.creatorName + '.');
  }
}

function bookSummary_(book, member) {
  var membership = book.members[member.id];
  return {
    id: book.id, title: book.title, creatorId: book.creatorId, creatorName: book.creatorName,
    member: !!membership, personId: membership && membership.personId ? membership.personId : null,
    canManage: book.creatorId === member.id || !!member.admin,
    memberCount: Object.keys(book.members).length, rev: book.rev, createdAt: book.createdAt
  };
}

function createBook_(member, request) {
  var bookId = checkId_(request.bookId);
  var title = cleanName_(request.title, 'Семейная книга');
  return withLock_(function () {
    var existing = readBook_(bookId);
    if (existing) {
      if (existing.members[member.id]) return ok_({ book: bookSummary_(existing, member) });
      throw error_('exists', 'Книга с таким номером уже есть в хранилище.');
    }
    var root = ensureRoot_();
    var folderId = driveCreateFolder_(title, root);
    var mediaFolderId = driveCreateFolder_('Фото, голос и видео', folderId);
    var stateFileId = driveCreateJson_('book.json', folderId, { app: APP, version: VERSION, bookId: bookId, rev: 0, entities: {} });
    var now = new Date().toISOString();
    var book = {
      id: bookId, title: title, folderId: folderId, mediaFolderId: mediaFolderId, stateFileId: stateFileId,
      creatorId: member.id, creatorName: member.name, members: {}, rev: 0, createdAt: now
    };
    book.members[member.id] = { name: member.name, personId: optionalId_(request.personId), joinedAt: now };
    write_('b:' + bookId, book);
    return ok_({ book: bookSummary_(book, member) });
  });
}

function deleteBook_(member, request) {
  return withLock_(function () {
    var book = readBook_(request.bookId);
    if (!book) return ok_({});
    requireManager_(member, book);
    trashQuietly_(book.folderId);
    props_().deleteProperty('b:' + book.id);
    forEachInvite_(function (key, invite) {
      if (invite.bookId === book.id) props_().deleteProperty(key);
    });
    return ok_({});
  });
}

function leaveBook_(member, request) {
  return withLock_(function () {
    var book = readBook_(request.bookId);
    if (!book || !book.members[member.id]) return ok_({});
    if (book.creatorId === member.id) throw error_('forbidden', 'Создатель не может выйти из книги — её можно только удалить.');
    delete book.members[member.id];
    write_('b:' + book.id, book);
    // Вернуться в книгу можно только по новому приглашению.
    cancelInvitesOf_(book.id, member.id);
    return ok_({});
  });
}

/** Владелец хранилища может вернуться в любую книгу, например если телефон создателя потерян. */
function joinBook_(member, request) {
  if (!member.admin) throw error_('forbidden', 'Войти в книгу без приглашения может только владелец хранилища.');
  return withLock_(function () {
    var book = readBook_(request.bookId);
    if (!book) throw error_('book_not_found', 'Этой книги больше нет в хранилище.');
    if (!book.members[member.id]) {
      book.members[member.id] = { name: member.name, personId: optionalId_(request.personId), joinedAt: new Date().toISOString() };
      write_('b:' + book.id, book);
    }
    return ok_({ book: bookSummary_(book, member) });
  });
}

// ---------- Приглашения ----------

function createInvite_(member, request) {
  var book = requireBook_(member, request.bookId);
  requireManager_(member, book);
  var code = secret_().slice(0, 40);
  var now = new Date();
  var invite = {
    bookId: book.id, personId: optionalId_(request.personId), personName: cleanName_(request.personName, ''),
    createdBy: member.id, createdByName: member.name, createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INVITE_DAYS * 24 * 3600 * 1000).toISOString()
  };
  forEachInvite_(function (key, item) {
    if (new Date(item.expiresAt).getTime() < now.getTime()) props_().deleteProperty(key);
  });
  write_('i:' + hash_(code), invite);
  return ok_({ code: code, expiresAt: invite.expiresAt });
}

function readInvite_(code) {
  code = String(code || '');
  var key = code.length >= 20 ? 'i:' + hash_(code) : '';
  var invite = key ? read_(key) : null;
  if (!invite) throw error_('invite_not_found', 'Приглашение не найдено. Попросите создателя книги прислать новую ссылку.');
  if (new Date(invite.expiresAt).getTime() < Date.now()) throw error_('invite_expired', 'Срок приглашения истёк. Попросите прислать новую ссылку.');
  var book = read_('b:' + invite.bookId);
  if (!book) throw error_('book_not_found', 'Книгу, в которую вас пригласили, удалили.');
  return { key: key, invite: invite, book: book };
}

function previewInvite_(request) {
  var found = readInvite_(request.code);
  return ok_({
    bookId: found.book.id, bookTitle: found.book.title, inviterName: found.invite.createdByName,
    personName: found.invite.personName, personId: found.invite.personId, expiresAt: found.invite.expiresAt
  });
}

function acceptInvite_(request) {
  return withLock_(function () {
    var found = readInvite_(request.code);
    var member = null;
    var token = null;
    if (request.token) {
      var memberId = props_().getProperty('t:' + hash_(String(request.token)));
      member = memberId ? read_('m:' + memberId) : null;
    }
    if (!member) {
      var created = newMember_(cleanName_(request.name, found.invite.personName || 'Участник'), false);
      member = created.member;
      token = created.token;
    }
    var book = found.book;
    var existing = book.members[member.id];
    book.members[member.id] = {
      name: member.name, personId: found.invite.personId || (existing ? existing.personId : null),
      joinedAt: existing ? existing.joinedAt : new Date().toISOString()
    };
    write_('b:' + book.id, book);
    // Remember who used the link: removing that member also cancels it.
    var usedBy = found.invite.usedBy || [];
    if (usedBy.indexOf(member.id) < 0) {
      found.invite.usedBy = usedBy.concat([member.id]);
      write_(found.key, found.invite);
    }
    var result = { member: publicMember_(member), book: bookSummary_(book, member) };
    if (token) result.token = token;
    return ok_(result);
  });
}

function members_(member, request) {
  var book = requireBook_(member, request.bookId);
  var list = Object.keys(book.members).map(function (id) {
    var item = book.members[id];
    return { id: id, name: item.name, personId: item.personId || null, joinedAt: item.joinedAt,
      isCreator: id === book.creatorId, isYou: id === member.id };
  });
  return ok_({ members: list, canManage: book.creatorId === member.id || !!member.admin });
}

function removeMember_(member, request) {
  return withLock_(function () {
    var book = requireBook_(member, request.bookId);
    requireManager_(member, book);
    var memberId = checkId_(request.memberId);
    if (memberId === book.creatorId) throw error_('forbidden', 'Создателя книги удалить нельзя.');
    delete book.members[memberId];
    write_('b:' + book.id, book);
    // Иначе исключённый вернулся бы в книгу по той же ссылке.
    cancelInvitesOf_(book.id, memberId);
    return ok_({});
  });
}

// ---------- Синхронизация ----------

/**
 * Каждое устройство присылает свои изменения и получает всё, что поменялось
 * с прошлого раза. Записи хранятся по ключам «тип:id»; побеждает последняя
 * присланная правка, удаления хранятся отметками. У каждой записи помнится
 * автор (owner): участник удаляет только своё, создатель книги — что угодно.
 * Отклонённые удаления возвращаются телефону, и он восстанавливает записи.
 */
function sync_(member, request) {
  var book = requireBook_(member, request.bookId);
  var since = Math.max(0, Math.floor(Number(request.sinceRev) || 0));
  var changes = Array.isArray(request.changes) ? request.changes : [];
  if (changes.length > MAX_CHANGES) throw error_('too_large', 'Слишком много изменений за раз.');
  var clean = changes.map(cleanChange_);
  // Ничего нового: ответ без чтения файла книги.
  if (!clean.length && since === book.rev) return ok_({ rev: book.rev, entities: [], title: book.title });

  return withLock_(function () {
    book = requireBook_(member, request.bookId);
    var state = driveReadJson_(book.stateFileId);
    if (!state.entities) state.entities = {};
    var rev = Number(state.rev) || 0;
    if (since > rev) since = 0;
    var now = new Date().toISOString();
    var trash = [];
    var manager = book.creatorId === member.id || !!member.admin;
    var denied = deniedDeletions_(state.entities, clean, member.id, book.creatorId, manager);
    var accepted = clean.filter(function (change) { return !denied[change.key]; });
    accepted.forEach(function (change) {
      rev += 1;
      var previous = state.entities[change.key];
      if (change.deleted) {
        state.entities[change.key] = { rev: rev, deleted: true, by: member.id, at: now };
        if (change.key.indexOf('file:') === 0 && previous && previous.data && previous.data.fileId) trash.push(String(previous.data.fileId));
      } else {
        var owner = previous && !previous.deleted ? ownerOf_(previous, book) : member.id;
        state.entities[change.key] = { rev: rev, data: change.data, by: member.id, at: now, owner: owner };
      }
    });
    if (accepted.length) {
      state.rev = rev;
      driveWriteJson_(book.stateFileId, state);
      var bookEntity = state.entities['book:' + book.id];
      if (bookEntity && bookEntity.data && typeof bookEntity.data.title === 'string' && bookEntity.data.title.trim()) {
        book.title = bookEntity.data.title.trim().slice(0, 200);
      }
      book.rev = rev;
      write_('b:' + book.id, book);
    }
    trash.forEach(trashQuietly_);
    var entities = [];
    Object.keys(state.entities).forEach(function (key) {
      var entry = state.entities[key];
      if (entry.rev <= since && !denied[key]) return;
      entities.push(entry.deleted ? { key: key, rev: entry.rev, deleted: true }
        : { key: key, rev: entry.rev, data: entry.data, owner: ownerOf_(entry, book) });
    });
    return ok_({ rev: Number(state.rev) || 0, entities: entities, title: book.title, denied: Object.keys(denied) });
  });
}

/** Записи, созданные до учёта авторов, считаются записями создателя книги. */
function ownerOf_(entry, book) {
  return entry.owner || book.creatorId;
}

/**
 * Какие удаления не принимать. Книгу и людей через синхронизацию не удаляет
 * никто. Участник удаляет только свои записи, и момент или главу — только
 * если внутри не остаётся чужого: иначе чужие рассказы пропали бы у всех.
 */
function deniedDeletions_(entities, changes, memberId, creatorId, manager) {
  var denied = {};
  var deleting = {};
  changes.forEach(function (change) {
    if (!change.deleted) return;
    if (/^(book|person):/.test(change.key)) denied[change.key] = true;
    else deleting[change.key] = true;
  });
  if (manager) return denied;
  var live = function (key) { var entry = entities[key]; return !!entry && !entry.deleted; };
  var mine = function (key) { return !live(key) || (entities[key].owner || creatorId) === memberId; };
  var removed = function (key) { return deleting[key] && !denied[key]; };
  Object.keys(deleting).forEach(function (key) { if (!mine(key)) denied[key] = true; });
  // Что останется внутри: для момента — чужие рассказы и отклики, для главы — любые моменты.
  var remainsInside = function (parentKey, prefix, field, onlyOthers) {
    var id = parentKey.slice(parentKey.indexOf(':') + 1);
    return Object.keys(entities).some(function (key) {
      if (key.indexOf(prefix) !== 0 || !live(key) || removed(key)) return false;
      var data = entities[key].data;
      return !!data && data[field] === id && (!onlyOthers || !mine(key));
    });
  };
  Object.keys(deleting).forEach(function (key) {
    if (key.indexOf('moment:') === 0 && !denied[key]
      && (remainsInside(key, 'perspective:', 'momentId', true) || remainsInside(key, 'reflection:', 'momentId', true))) denied[key] = true;
  });
  Object.keys(deleting).forEach(function (key) {
    if (key.indexOf('chapter:') === 0 && !denied[key] && remainsInside(key, 'moment:', 'chapterId', false)) denied[key] = true;
  });
  return denied;
}

function cleanChange_(change) {
  if (!change || typeof change.key !== 'string' || !KEY_PATTERN.test(change.key)) throw error_('bad_request', 'Неверная запись в изменениях.');
  if (change.deleted === true) return { key: change.key, deleted: true };
  var data = change.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw error_('bad_request', 'Пустая запись: ' + change.key);
  if (JSON.stringify(data).length > MAX_ENTITY_CHARS) throw error_('too_large', 'Слишком большая запись: ' + change.key);
  var id = change.key.slice(change.key.indexOf(':') + 1);
  if (change.key.indexOf('file:') !== 0 && data.id !== id) throw error_('bad_request', 'Запись не совпадает с ключом: ' + change.key);
  return { key: change.key, data: data };
}

/**
 * Фото, голос и видео браузер загружает в папку книги напрямую в Google Диск
 * (так нет ограничения 50 МБ на запрос к скрипту). Ключ доступа живёт недолго
 * и открывает только файлы, созданные этим скриптом.
 */
function mediaAccess_(member, request) {
  var book = requireBook_(member, request.bookId);
  return ok_({ accessToken: ScriptApp.getOAuthToken(), expiresInSeconds: 600, folderId: book.mediaFolderId, api: DRIVE });
}

// ---------- Google Диск ----------

function ensureRoot_() {
  var id = props_().getProperty('root');
  if (id) return id;
  id = driveCreateFolder_(ROOT_FOLDER_NAME, null);
  props_().setProperty('root', id);
  return id;
}

function drive_(method, path, body, contentType) {
  var options = { method: method, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body !== undefined) {
    options.contentType = contentType || 'application/json; charset=utf-8';
    options.payload = typeof body === 'string' ? body : asciiJson_(body);
  }
  var response = UrlFetchApp.fetch(DRIVE + path, options);
  var code = response.getResponseCode();
  var text = response.getContentText('UTF-8');
  if (code >= 300) throw error_('drive_error', 'Google Диск ответил ошибкой ' + code + ': ' + text.slice(0, 300));
  return text;
}

function driveCreateFolder_(name, parentId) {
  var meta = { name: name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  return JSON.parse(drive_('post', '/drive/v3/files?fields=id', meta)).id;
}

function driveCreateJson_(name, parentId, value) {
  var id = JSON.parse(drive_('post', '/drive/v3/files?fields=id', { name: name, parents: [parentId], mimeType: 'application/json' })).id;
  driveWriteJson_(id, value);
  return id;
}

function driveWriteJson_(id, value) {
  drive_('patch', '/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media&fields=id', asciiJson_(value), 'application/json');
}

function driveReadJson_(id) {
  return JSON.parse(drive_('get', '/drive/v3/files/' + encodeURIComponent(id) + '?alt=media'));
}

function trashQuietly_(id) {
  try {
    drive_('patch', '/drive/v3/files/' + encodeURIComponent(id) + '?fields=id', { trashed: true });
  } catch (error) {
    console.warn(error);
  }
}

// ---------- Мелочи ----------

function props_() {
  return PropertiesService.getScriptProperties();
}

function read_(key) {
  var value = props_().getProperty(key);
  return value ? JSON.parse(value) : null;
}

function write_(key, value) {
  props_().setProperty(key, JSON.stringify(value));
}

/** Отменить ссылки на книгу, по которым вошёл этот участник. */
function cancelInvitesOf_(bookId, memberId) {
  forEachInvite_(function (key, invite) {
    if (invite.bookId === bookId && (invite.usedBy || []).indexOf(memberId) >= 0) props_().deleteProperty(key);
  });
}

function forEachInvite_(fn) {
  var all = props_().getProperties();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('i:') === 0) fn(key, JSON.parse(all[key]));
  });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw error_('busy', 'Хранилище занято другим устройством. Попробуйте через минуту.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function secret_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function hash_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i += 1) {
    var value = (bytes[i] + 256) % 256;
    hex += (value < 16 ? '0' : '') + value.toString(16);
  }
  return hex;
}

/** JSON только из ASCII: русский текст не исказится при записи в файл. */
function asciiJson_(value) {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, function (char) {
    return '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
  });
}

function checkId_(value) {
  var id = String(value || '');
  if (!ID_PATTERN.test(id)) throw error_('bad_request', 'Неверный номер записи.');
  return id;
}

function optionalId_(value) {
  return value && ID_PATTERN.test(String(value)) ? String(value) : null;
}

function cleanName_(value, fallback) {
  var name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  return name || fallback;
}

function ok_(data) {
  var result = data || {};
  result.ok = true;
  return result;
}

function fail_(code, message) {
  return { ok: false, error: code, message: message };
}

function error_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
