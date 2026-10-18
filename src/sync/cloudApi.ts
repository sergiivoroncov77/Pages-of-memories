/*
 * Talking to the family storage: the Apps Script web app for books, members
 * and invitations, and Google Drive directly for photo, voice and video files.
 */

export type CloudErrorCode =
  | 'offline' | 'not_script' | 'unauthorized' | 'claimed' | 'not_member' | 'book_not_found' | 'forbidden'
  | 'invite_not_found' | 'invite_expired' | 'busy' | 'drive_error' | 'bad_request' | 'too_large' | 'server_error'
  | 'exists' | 'media_failed' | 'local_write';

export class CloudError extends Error {
  readonly code: CloudErrorCode;

  constructor(code: CloudErrorCode, message: string) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
  }
}

export const cloudErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось связаться с семейным хранилищем.';

const GOOGLE_SCRIPT_URL = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]{10,}\/exec$/;
const LOCAL_DEV_URL = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{2,5})?\/[^\s?#]*$/;

/** Accept the web-app address as Google shows it; reject anything else. */
export function normalizeServerUrl(value: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = value.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (/^https:\/\/script\.google\.com\/.*\/dev$/.test(trimmed)) {
    return { ok: false, error: 'Это тестовый адрес (…/dev), он работает только у вас. Скопируйте адрес веб-приложения из окна «Развертывание» — он заканчивается на /exec.' };
  }
  if (GOOGLE_SCRIPT_URL.test(trimmed) || LOCAL_DEV_URL.test(trimmed)) return { ok: true, url: trimmed };
  return { ok: false, error: 'Нужен адрес веб-приложения Google Apps Script: https://script.google.com/macros/s/…/exec' };
}

/** A local mock storage (for development) also serves the Drive endpoints. */
export function driveApiBase(serverUrl: string): string {
  return LOCAL_DEV_URL.test(serverUrl) ? new URL(serverUrl).origin : 'https://www.googleapis.com';
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

type ServerReply = Record<string, unknown> & { ok?: boolean; error?: string; message?: string };

/**
 * One request to the Apps Script web app. A plain-text body keeps the request
 * "simple" for CORS: Apps Script cannot answer a preflight.
 */
export async function callFamilyServer<T = Record<string, unknown>>(url: string, request: Record<string, unknown>, fetchImpl: FetchLike = defaultFetch): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(request), redirect: 'follow' });
  } catch {
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    throw new CloudError('offline', online
      ? 'Хранилище не отвечает. Проверьте адрес скрипта и что в развертывании выбрано «Кто имеет доступ: все». Изменения сохранены на устройстве.'
      : 'Нет интернета. Изменения сохранены на устройстве и уйдут, когда появится связь.');
  }
  let reply: ServerReply;
  try {
    reply = JSON.parse(await response.text()) as ServerReply;
  } catch {
    throw new CloudError('not_script', 'По этому адресу отвечает не скрипт хранилища. Проверьте адрес и настройки развертывания.');
  }
  if (!reply || reply.ok !== true) {
    const code = (typeof reply?.error === 'string' ? reply.error : 'server_error') as CloudErrorCode;
    throw new CloudError(code, typeof reply?.message === 'string' ? reply.message : 'Хранилище ответило ошибкой.');
  }
  return reply as unknown as T;
}

/** Short-lived Drive access for one book's media folder. */
export interface MediaAccess {
  accessToken: string;
  folderId: string;
  expiresAt: number;
  api: string;
}

export interface UploadMeta {
  name: string;
  mimeType: string;
  assetId: string;
  bookId: string;
}

export interface MediaTransfer {
  upload(access: MediaAccess, blob: Blob, meta: UploadMeta): Promise<string>;
  download(access: MediaAccess, fileId: string, mimeType: string): Promise<Blob>;
}

class ExpiredAccess extends CloudError {
  constructor() {
    super('unauthorized', 'Ключ доступа к Google Диску устарел.');
  }
}

export const isExpiredAccess = (error: unknown) => error instanceof ExpiredAccess;

/** Resumable upload straight to the book folder: no 50 MB limit of the script. */
export function createDriveTransfer(fetchImpl: FetchLike = defaultFetch): MediaTransfer {
  const request = async (input: string, init: RequestInit) => {
    try {
      return await fetchImpl(input, init);
    } catch {
      throw new CloudError('offline', 'Нет связи с Google Диском. Файлы загрузятся позже.');
    }
  };
  const check = (response: Response, what: string) => {
    if (response.status === 401) throw new ExpiredAccess();
    if (!response.ok) throw new CloudError('media_failed', `Google Диск не принял ${what} (ошибка ${response.status}).`);
  };
  return {
    async upload(access, blob, meta) {
      const start = await request(`${access.api}/upload/drive/v3/files?uploadType=resumable&fields=id`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': meta.mimeType || 'application/octet-stream',
          'X-Upload-Content-Length': String(blob.size)
        },
        body: JSON.stringify({ name: meta.name, parents: [access.folderId], mimeType: meta.mimeType || undefined,
          appProperties: { assetId: meta.assetId, bookId: meta.bookId } })
      });
      check(start, 'файл');
      const session = start.headers.get('Location') ?? start.headers.get('location');
      if (!session) throw new CloudError('media_failed', 'Google Диск не начал загрузку файла.');
      const done = await request(session, { method: 'PUT', headers: { 'Content-Type': meta.mimeType || 'application/octet-stream' }, body: blob });
      check(done, 'файл');
      const result = await done.json() as { id?: unknown };
      if (typeof result.id !== 'string') throw new CloudError('media_failed', 'Google Диск не вернул номер файла.');
      return result.id;
    },
    async download(access, fileId, mimeType) {
      const response = await request(`${access.api}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
        headers: { Authorization: `Bearer ${access.accessToken}` }
      });
      check(response, 'запрос файла');
      const blob = await response.blob();
      return blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
    }
  };
}

/** The invitation lives after `#`, so neither GitHub Pages nor proxies see the code. */
export function inviteLink(appUrl: string, serverUrl: string, code: string): string {
  const base = appUrl.endsWith('/') ? appUrl : `${appUrl}/`;
  return `${base}join#s=${encodeURIComponent(serverUrl)}&c=${encodeURIComponent(code)}`;
}

export function parseInviteHash(hash: string): { url: string; code: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const server = normalizeServerUrl(params.get('s') ?? '');
  const code = params.get('c') ?? '';
  if (!server.ok || !/^[A-Za-z0-9_-]{20,80}$/.test(code)) return null;
  return { url: server.url, code };
}
