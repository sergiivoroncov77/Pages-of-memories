// In-memory stand-ins for the Apps Script runtime and the Drive REST API.
// They run the real Code.gs in tests and in the local mock server, so the
// app's cloud sync can be exercised without a Google account.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

export const SCRIPT_PATH = new URL('../Code.gs', import.meta.url);

/** Drive v3 subset used by Code.gs (through UrlFetchApp) and by the app (through fetch). */
export function createFakeDrive() {
  const files = new Map();
  const sessions = new Map();
  const tokens = new Set();
  let apiOff = null;
  let counter = 0;
  const newId = () => `file${(counter += 1).toString(36)}${randomUUID().slice(0, 8)}`;

  const json = (status, value, headers = {}) => ({ status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body: Buffer.from(JSON.stringify(value)) });
  const error = (status, message) => json(status, { error: { code: status, message } });
  const authorized = (headers) => tokens.has(String(headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
  const text = (body) => (body === undefined ? '' : Buffer.isBuffer(body) ? body.toString('utf8') : typeof body === 'string' ? body : Buffer.from(body).toString('utf8'));
  const bytes = (body) => (body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : typeof body === 'string' ? Buffer.from(body) : Buffer.from(body));

  function create(meta, content = Buffer.alloc(0)) {
    const id = newId();
    files.set(id, { id, name: meta.name ?? 'untitled', mimeType: meta.mimeType ?? 'application/octet-stream', parents: meta.parents ?? [],
      appProperties: meta.appProperties ?? {}, trashed: false, content });
    return files.get(id);
  }

  /** request: { method, url, headers (lower-case keys), body } → { status, headers, body: Buffer } */
  function handle(request) {
    const method = request.method.toUpperCase();
    const url = new URL(request.url, 'https://www.googleapis.com');
    const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    const path = url.pathname;
    const sessionId = url.searchParams.get('upload_id');
    if (apiOff) return error(403, `Google Drive API has not been used in project ${apiOff} before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=${apiOff} then retry.`);

    if (path === '/upload/drive/v3/files' && sessionId && method === 'PUT') {
      const meta = sessions.get(sessionId);
      if (!meta) return error(404, 'Upload session not found');
      sessions.delete(sessionId);
      const file = create(meta, bytes(request.body));
      return json(200, { id: file.id, name: file.name, size: String(file.content.length) });
    }
    if (!authorized(headers)) return error(401, 'Invalid Credentials');

    if (path === '/drive/v3/files' && method === 'POST') {
      const file = create(JSON.parse(text(request.body) || '{}'));
      return json(200, { id: file.id });
    }
    if (path === '/upload/drive/v3/files' && method === 'POST' && url.searchParams.get('uploadType') === 'resumable') {
      const id = randomUUID();
      sessions.set(id, JSON.parse(text(request.body) || '{}'));
      const base = request.uploadBase ?? 'https://www.googleapis.com';
      return { status: 200, headers: { location: `${base}/upload/drive/v3/files?uploadType=resumable&upload_id=${id}` }, body: Buffer.alloc(0) };
    }
    const media = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(path);
    if (media && method === 'PATCH') {
      const file = files.get(decodeURIComponent(media[1]));
      if (!file || file.trashed) return error(404, 'File not found');
      file.content = bytes(request.body);
      return json(200, { id: file.id });
    }
    const item = /^\/drive\/v3\/files\/([^/]+)$/.exec(path);
    if (item) {
      const file = files.get(decodeURIComponent(item[1]));
      if (!file || (file.trashed && method === 'GET')) return error(404, 'File not found');
      if (method === 'GET' && url.searchParams.get('alt') === 'media') {
        // Like Drive, a byte range comes back as 206: video and audio stream piece by piece.
        const range = /^bytes=(\d+)-(\d*)$/.exec(String(headers.range ?? ''));
        if (range) {
          const size = file.content.length;
          const start = Number(range[1]);
          if (start >= size) return { status: 416, headers: { 'content-range': `bytes */${size}` }, body: Buffer.alloc(0) };
          const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
          return { status: 206, headers: { 'content-type': file.mimeType, 'content-range': `bytes ${start}-${end}/${size}` }, body: file.content.subarray(start, end + 1) };
        }
        return { status: 200, headers: { 'content-type': file.mimeType }, body: file.content };
      }
      if (method === 'PATCH') {
        Object.assign(file, JSON.parse(text(request.body) || '{}'));
        if (file.trashed) trashChildren(file.id);
        return json(200, { id: file.id });
      }
      if (method === 'GET') return json(200, { id: file.id, name: file.name, mimeType: file.mimeType, trashed: file.trashed });
    }
    return error(400, `Unsupported request ${method} ${path}`);
  }

  function trashChildren(parentId) {
    for (const file of files.values()) {
      if (file.parents.includes(parentId) && !file.trashed) { file.trashed = true; trashChildren(file.id); }
    }
  }

  return {
    files,
    handle,
    issueToken() { const token = `ya29.fake-${randomUUID()}`; tokens.add(token); return token; },
    revokeTokens() { tokens.clear(); },
    /** Answers like Google while the Drive API is off in the script's Cloud project. */
    turnApiOff(project = '707687405673') { apiOff = project; },
    /** Live (not trashed) files inside a folder, recursively. */
    liveFilesUnder(folderId) {
      const result = [];
      const walk = (id) => { for (const file of files.values()) if (file.parents.includes(id) && !file.trashed) { result.push(file); walk(file.id); } };
      walk(folderId);
      return result;
    }
  };
}

/** Apps Script globals backed by memory and the fake Drive. */
export function createFakeAppsScript(drive = createFakeDrive()) {
  const properties = new Map();
  const logs = [];
  let currentToken = drive.issueToken();
  const scriptProperties = {
    getProperty: (key) => (properties.has(key) ? properties.get(key) : null),
    setProperty: (key, value) => {
      const text = String(value);
      if (Buffer.byteLength(key) + Buffer.byteLength(text) > 9 * 1024) throw new Error(`Property ${key} is larger than 9 KB`);
      properties.set(key, text);
      return scriptProperties;
    },
    deleteProperty: (key) => { properties.delete(key); return scriptProperties; },
    getProperties: () => Object.fromEntries(properties),
    setProperties: (values) => { for (const [key, value] of Object.entries(values)) scriptProperties.setProperty(key, value); return scriptProperties; }
  };
  const globals = {
    PropertiesService: { getScriptProperties: () => scriptProperties },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => randomUUID(),
      computeDigest: (algorithm, value) => [...createHash(algorithm).update(String(value), 'utf8').digest()].map((byte) => (byte > 127 ? byte - 256 : byte))
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => ({ content, mimeType: 'text/plain', setMimeType(type) { this.mimeType = type; return this; }, getContent() { return this.content; } })
    },
    ScriptApp: { getOAuthToken: () => currentToken },
    UrlFetchApp: {
      fetch: (url, options = {}) => {
        const headers = { ...(options.headers ?? {}) };
        if (options.contentType) headers['content-type'] = options.contentType;
        const response = drive.handle({ method: options.method ?? 'get', url, headers, body: options.payload });
        if (response.status >= 300 && !options.muteHttpExceptions) throw new Error(`Request failed with ${response.status}`);
        return { getResponseCode: () => response.status, getContentText: () => response.body.toString('utf8') };
      }
    },
    Logger: { log: (message) => logs.push(String(message)) },
    console: { log: () => undefined, warn: () => undefined, error: () => undefined }
  };
  return {
    drive,
    properties,
    logs,
    globals,
    /** Simulates Apps Script handing out a fresh token after the old one expired. */
    rotateToken() { drive.revokeTokens(); currentToken = drive.issueToken(); }
  };
}

/** Load Code.gs into an isolated context and expose its web-app entry points. */
export function loadFamilyServer(fake = createFakeAppsScript(), source = readFileSync(SCRIPT_PATH, 'utf8')) {
  const context = createContext({ ...fake.globals });
  runInContext(source, context, { filename: 'Code.gs' });
  return {
    fake,
    context,
    /** POST a request object the way the app does and return the parsed JSON reply. */
    post(request) {
      const output = context.doPost({ postData: { contents: JSON.stringify(request) } });
      return JSON.parse(output.getContent());
    },
    get() { return JSON.parse(context.doGet({}).getContent()); },
    run(name) { return context[name](); }
  };
}
