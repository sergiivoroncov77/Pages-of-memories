import { describe, expect, it } from 'vitest';
import source from '../../server/google-apps-script/Code.gs?raw';
import manifest from '../../server/google-apps-script/appsscript.json?raw';
import { loadFamilyServer } from '../../server/google-apps-script/dev/fakeGoogle.mjs';
import { APP_SCRIPT_RELEASE, cleanScriptId, deploymentIdOf, releaseOf, updateStorageScript, type ScriptUpdateStep } from './scriptUpdate';

const SERVER = 'https://script.google.com/macros/s/AKfycbDeployment123/exec';
const SCRIPT_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';
const API = `https://script.googleapis.com/v1/projects/${SCRIPT_ID}`;
const oldSource = source.replace(/^var RELEASE = \d+;$/m, 'var RELEASE;');

interface ScriptFile { name: string; type: string; source: string }

/** The owner's Apps Script project and its web app, as Google would answer the app. */
function google(options: { files?: ScriptFile[]; fail?: Record<string, [number, string]>; stuck?: boolean } = {}) {
  let live = loadFamilyServer(undefined, oldSource);
  let files = options.files ?? [{ name: 'Код', type: 'SERVER_JS', source: oldSource }, { name: 'appsscript', type: 'JSON', source: '{}' }];
  const versions: ScriptFile[][] = [];
  const calls: string[] = [];
  const bodies: Record<string, unknown> = {};
  const answer = (status: number, value: unknown) => new Response(JSON.stringify(value), { status });
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    if (url === SERVER) return answer(200, live.post(JSON.parse(String(init.body))));
    const route = `${init.method ?? 'GET'} ${url.replace(API, '')}`;
    calls.push(route);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-1');
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    bodies[route] = body;
    const failure = options.fail?.[route];
    if (failure) return answer(failure[0], { error: { code: failure[0], message: failure[1] } });
    if (route === 'GET /content') return answer(200, { files });
    if (route === 'GET /deployments/AKfycbDeployment123') return answer(200, { deploymentId: 'AKfycbDeployment123' });
    if (route === 'PUT /content') { files = (body as { files: ScriptFile[] }).files; return answer(200, { files }); }
    if (route === 'POST /versions') { versions.push(files); return answer(200, { versionNumber: versions.length }); }
    if (route === 'PUT /deployments/AKfycbDeployment123') {
      const { versionNumber } = (body as { deploymentConfig: { versionNumber: number } }).deploymentConfig;
      if (!options.stuck) live = loadFamilyServer(live.fake, versions[versionNumber - 1].find((file) => file.type === 'SERVER_JS')!.source);
      return answer(200, {});
    }
    return answer(404, { error: { code: 404, message: 'Requested entity was not found.' } });
  };
  return { fetchImpl, calls, bodies, files: () => files };
}

const run = (fake: ReturnType<typeof google>, steps: ScriptUpdateStep[] = []) => updateStorageScript({
  accessToken: 'token-1', scriptId: SCRIPT_ID, serverUrl: SERVER, fetch: fake.fetchImpl, wait: async () => undefined, onStep: (step) => steps.push(step)
});

describe('updating the storage script from the app', () => {
  it('puts the app’s code into the project, makes a version and moves the web app to it', async () => {
    const fake = google();
    const steps: ScriptUpdateStep[] = [];
    await expect(run(fake, steps)).resolves.toEqual({ release: APP_SCRIPT_RELEASE, versionNumber: 1 });
    expect(steps).toEqual(['check', 'upload', 'version', 'deploy', 'verify']);
    expect(fake.calls).toEqual(['GET /content', 'GET /deployments/AKfycbDeployment123', 'PUT /content', 'POST /versions', 'PUT /deployments/AKfycbDeployment123']);
    // «Код.gs» keeps its name; the manifest comes along.
    expect(fake.files()).toEqual([{ name: 'appsscript', type: 'JSON', source: manifest }, { name: 'Код', type: 'SERVER_JS', source }]);
    expect(fake.bodies['PUT /deployments/AKfycbDeployment123']).toEqual({ deploymentConfig: {
      scriptId: SCRIPT_ID, versionNumber: 1, manifestFileName: 'appsscript', description: `Выпуск ${APP_SCRIPT_RELEASE}, из приложения` } });
  });

  it('leaves alone a project that is not the storage script, or whose deployment is another one', async () => {
    const other = google({ files: [{ name: 'Code', type: 'SERVER_JS', source: 'function myFunction() {}' }, { name: 'appsscript', type: 'JSON', source: '{}' }] });
    await expect(run(other)).rejects.toMatchObject({ code: 'wrong_project' });
    expect(other.calls).toEqual(['GET /content']);

    const elsewhere = google({ fail: { 'GET /deployments/AKfycbDeployment123': [404, 'Requested entity was not found.'] } });
    await expect(run(elsewhere)).rejects.toMatchObject({ code: 'wrong_deployment' });
    expect(elsewhere.calls).not.toContain('PUT /content');
  });

  it('explains what to turn on when Google refuses', async () => {
    const userOff = google({ fail: { 'GET /content': [403, 'User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings then retry.'] } });
    await expect(run(userOff)).rejects.toMatchObject({ code: 'user_api_off', message: expect.stringContaining('Google Apps Script API') });
    const projectOff = google({ fail: { 'GET /content': [403, 'Apps Script API has not been used in project 56488384370 before or it is disabled.'] } });
    await expect(run(projectOff)).rejects.toMatchObject({ code: 'project_api_off' });
    const stranger = google({ fail: { 'GET /content': [403, 'The caller does not have permission'] } });
    await expect(run(stranger)).rejects.toMatchObject({ code: 'no_access', message: expect.stringContaining('тем аккаунтом Google') });
    const expired = google({ fail: { 'POST /versions': [401, 'Request had invalid authentication credentials.'] } });
    await expect(run(expired)).rejects.toMatchObject({ code: 'expired' });
  });

  it('says so when the web app still answers with the old code', async () => {
    await expect(run(google({ stuck: true }))).rejects.toMatchObject({ code: 'not_live', message: expect.stringContaining('setup') });
  });

  it('reads the deployment from the storage address and a script ID from what the owner pastes', () => {
    expect(deploymentIdOf(SERVER)).toBe('AKfycbDeployment123');
    expect(deploymentIdOf('https://script.google.com/a/macros/example.com/s/AKfycbX_y-z1234567890/exec')).toBe('AKfycbX_y-z1234567890');
    expect(deploymentIdOf('http://127.0.0.1:8787/macros/s/mock/exec')).toBe('mock');
    expect(cleanScriptId(`  ${SCRIPT_ID} `)).toBe(SCRIPT_ID);
    expect(cleanScriptId(`https://script.google.com/home/projects/${SCRIPT_ID}/edit`)).toBe(SCRIPT_ID);
    expect(cleanScriptId(`https://script.google.com/d/${SCRIPT_ID}/edit?usp=sharing`)).toBe(SCRIPT_ID);
    expect(cleanScriptId('не знаю')).toBeNull();
  });

  it('carries a new release with every change of the script', async () => {
    expect(APP_SCRIPT_RELEASE).toBe(releaseOf(source));
    // Changed Code.gs or appsscript.json? Raise RELEASE in Code.gs, then write the new fingerprint here:
    // owners are offered the update only for a higher release.
    const text = (source.replace(/^var RELEASE = \d+;$/m, '') + manifest).replace(/\r\n/g, '\n');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    const fingerprint = [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    expect({ release: APP_SCRIPT_RELEASE, fingerprint }).toEqual({ release: 1, fingerprint: '9baa0eefef7496b3' });
  });
});
