/*
 * Updating the storage script from the app. The owner signs in to Google, and
 * the Apps Script API puts this app's Code.gs into their project, makes a new
 * version and moves the web app's deployment to it: the address stays the same.
 */
import scriptSource from '../../server/google-apps-script/Code.gs?raw';
import manifestSource from '../../server/google-apps-script/appsscript.json?raw';
import { callFamilyServer, type FetchLike } from './cloudApi';

export const releaseOf = (source: string) => Number(/^var RELEASE = (\d+);/m.exec(source)?.[1] ?? 0);

/** The script release this app carries. */
export const APP_SCRIPT_RELEASE = releaseOf(scriptSource);

/** The app's OAuth client in Google Cloud: it works only on the app's own address and for its test users. */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)
  || '56488384370-iftkvii7up0jdsglu6e2tato2sjnn0ok.apps.googleusercontent.com';

export const SCRIPT_SCOPES = ['https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/script.deployments'];

export const APPS_SCRIPT_SETTINGS_URL = 'https://script.google.com/home/usersettings';

export const scriptEditorUrl = (scriptId: string) => `https://script.google.com/d/${encodeURIComponent(scriptId)}/edit`;

/** The deployment is the …/s/<id>/exec part of the storage address. */
export function deploymentIdOf(serverUrl: string): string | null {
  return /\/s\/([A-Za-z0-9_-]+)\/exec$/.exec(serverUrl)?.[1] ?? null;
}

/** A script ID as «Настройки проекта» show it, or the editor's address with it. */
export function cleanScriptId(value: string): string | null {
  const text = value.trim();
  const id = /\/(?:projects|d)\/([A-Za-z0-9_-]{20,})(?:[/?#]|$)/.exec(text)?.[1] ?? text;
  return /^[A-Za-z0-9_-]{20,}$/.test(id) ? id : null;
}

export type ScriptUpdateStep = 'check' | 'upload' | 'version' | 'deploy' | 'verify';

export type ScriptUpdateErrorCode = 'offline' | 'expired' | 'user_api_off' | 'project_api_off' | 'no_access'
  | 'wrong_project' | 'wrong_deployment' | 'rejected' | 'not_live';

export class ScriptUpdateError extends Error {
  readonly code: ScriptUpdateErrorCode;

  constructor(code: ScriptUpdateErrorCode, message: string) {
    super(message);
    this.name = 'ScriptUpdateError';
    this.code = code;
  }
}

function apiError(status: number, message: string): ScriptUpdateError {
  if (status === 401) return new ScriptUpdateError('expired', 'Вход в Google устарел. Нажмите «Обновить скрипт» ещё раз.');
  if (status === 403 && /not enabled the Apps Script API/i.test(message)) {
    return new ScriptUpdateError('user_api_off', 'Google не даёт приложениям менять ваши скрипты: включите «Google Apps Script API» в настройках Apps Script и нажмите ещё раз. Если только что включили, подождите пару минут.');
  }
  if (status === 403 && /has not been used in project|is disabled|SERVICE_DISABLED/i.test(message)) {
    return new ScriptUpdateError('project_api_off', 'В проекте Google Cloud, где создан Client ID, не включён Apps Script API: console.cloud.google.com → «API и сервисы» → «Библиотека» → Apps Script API → «Включить».');
  }
  if (status === 403 || status === 404) {
    return new ScriptUpdateError('no_access', 'Google не нашёл скрипт или не дал к нему доступа. Войдите тем аккаунтом Google, в котором установлен скрипт хранилища, и проверьте ID скрипта.');
  }
  return new ScriptUpdateError('rejected', `Google ответил ошибкой ${status}${message ? `: ${message}` : ''}.`);
}

interface ScriptFile {
  name: string;
  type: string;
  source?: string;
}

export interface ScriptUpdateOptions {
  accessToken: string;
  scriptId: string;
  /** The storage address …/s/<deployment>/exec. */
  serverUrl: string;
  api?: string;
  fetch?: FetchLike;
  onStep?: (step: ScriptUpdateStep) => void;
  /** Pause between checks that the new code answers. */
  wait?: (ms: number) => Promise<void>;
  source?: string;
  manifest?: string;
}

/**
 * Checks first that the project is the storage script and the address is its
 * deployment, since new content replaces every file of the project.
 */
export async function updateStorageScript(options: ScriptUpdateOptions): Promise<{ release: number; versionNumber: number }> {
  const { accessToken, scriptId, serverUrl, onStep = () => undefined } = options;
  const api = options.api ?? 'https://script.googleapis.com';
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); }));
  const source = options.source ?? scriptSource;
  const release = releaseOf(source);
  const deploymentId = deploymentIdOf(serverUrl);
  if (!deploymentId) throw new ScriptUpdateError('wrong_deployment', 'В адресе хранилища нет номера развертывания (…/s/…/exec).');

  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(`${api}/v1/projects/${encodeURIComponent(scriptId)}${path}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=UTF-8' }) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new ScriptUpdateError('offline', 'Нет связи с Google. Проверьте интернет и нажмите ещё раз.');
    }
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* not JSON */ }
    if (!response.ok) {
      const error = data.error as { message?: unknown } | undefined;
      throw apiError(response.status, typeof error?.message === 'string' ? error.message : '');
    }
    return data as T;
  };

  onStep('check');
  const content = await request<{ files?: ScriptFile[] }>('GET', '/content');
  const code = (content.files ?? []).filter((file) => file.type === 'SERVER_JS');
  if (!code.some((file) => /^var APP = 'family-stories';/m.test(file.source ?? ''))) {
    throw new ScriptUpdateError('wrong_project', 'В этом проекте Apps Script не скрипт хранилища. Проверьте ID скрипта: его код мы не трогали.');
  }
  try {
    await request('GET', `/deployments/${encodeURIComponent(deploymentId)}`);
  } catch (error) {
    if (error instanceof ScriptUpdateError && error.code === 'no_access') {
      throw new ScriptUpdateError('wrong_deployment', 'Адрес хранилища не из этого проекта Apps Script. Проверьте ID скрипта: его код мы не трогали.');
    }
    throw error;
  }

  onStep('upload');
  // The file keeps its name: «Код.gs» stays «Код.gs».
  const name = code.length === 1 ? code[0].name : 'Code';
  await request('PUT', '/content', { files: [
    { name: 'appsscript', type: 'JSON', source: options.manifest ?? manifestSource },
    { name, type: 'SERVER_JS', source }
  ] });

  onStep('version');
  const description = `Выпуск ${release}, из приложения`;
  const version = await request<{ versionNumber?: number }>('POST', '/versions', { description });
  const versionNumber = Number(version.versionNumber);
  if (!versionNumber) throw new ScriptUpdateError('rejected', 'Google не создал новую версию скрипта.');

  onStep('deploy');
  await request('PUT', `/deployments/${encodeURIComponent(deploymentId)}`, {
    deploymentConfig: { scriptId, versionNumber, manifestFileName: 'appsscript', description }
  });

  onStep('verify');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt) await wait(2000);
    const info = await callFamilyServer<{ release?: number }>(serverUrl, { action: 'info' }, fetchImpl).catch(() => null);
    if (info && Number(info.release) >= release) return { release, versionNumber };
  }
  throw new ScriptUpdateError('not_live', 'Новый код загружен, но хранилище пока отвечает по-старому. Откройте редактор скрипта, выберите функцию setup и нажмите «Выполнить»: если Google попросит разрешения, дайте их. Потом нажмите «Обновить скрипт» ещё раз.');
}
