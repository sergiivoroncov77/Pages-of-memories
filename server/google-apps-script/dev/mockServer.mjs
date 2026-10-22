// A local stand-in for the family storage: runs the real Code.gs on fake
// Apps Script services and serves the Drive endpoints the app uses for media.
//
//   node server/google-apps-script/dev/mockServer.mjs [port] [--old]
//
// In the app, connect to http://127.0.0.1:<port>/macros/s/mock/exec.
// Like Apps Script, a POST answers with a redirect to a one-time "echo" URL.
// It also serves the part of the Apps Script API the app updates the script
// with; `--old` starts a script from before releases, which the app offers to update.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createFakeAppsScript, FAKE_SCRIPT_ID, loadFamilyServer, MANIFEST_PATH, SCRIPT_PATH } from './fakeGoogle.mjs';

const args = process.argv.slice(2);
const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? process.env.PORT ?? 8787);
let source = readFileSync(SCRIPT_PATH, 'utf8');
if (args.includes('--old')) source = source.replace(/^var RELEASE = \d+;$/m, 'var RELEASE;').replace(/^\s*if \(member\.admin\) script\.id = .*$/m, '');
let server = loadFamilyServer(createFakeAppsScript(), source);
const echoes = new Map();

// The script's Apps Script project: its files, versions and the web app's deployment.
const project = {
  files: [{ name: 'Код', type: 'SERVER_JS', source }, { name: 'appsscript', type: 'JSON', source: readFileSync(MANIFEST_PATH, 'utf8') }],
  versions: [],
  deployment: { deploymentId: 'mock', versionNumber: 0 }
};

function scriptApi(method, path, headers, body) {
  const reply = (status, value) => ({ status, body: JSON.stringify(value) });
  const fail = (status, message) => reply(status, { error: { code: status, message } });
  if (!/^Bearer \S+/.test(String(headers.authorization ?? ''))) return fail(401, 'Request is missing required authentication credential.');
  const match = /^\/v1\/projects\/([^/]+)(\/.*)$/.exec(path);
  if (!match || match[1] !== FAKE_SCRIPT_ID) return fail(404, 'Requested entity was not found.');
  const route = `${method} ${match[2]}`;
  if (route === 'GET /content') return reply(200, { scriptId: FAKE_SCRIPT_ID, files: project.files });
  if (route === 'PUT /content') {
    const files = JSON.parse(body || '{}').files ?? [];
    if (!files.some((file) => file.name === 'appsscript' && file.type === 'JSON')) return fail(400, 'Manifest file is missing.');
    project.files = files;
    return reply(200, { scriptId: FAKE_SCRIPT_ID, files });
  }
  if (route === 'POST /versions') {
    const versionNumber = project.versions.length + 1;
    project.versions.push({ versionNumber, files: project.files, description: JSON.parse(body || '{}').description });
    return reply(200, { scriptId: FAKE_SCRIPT_ID, versionNumber });
  }
  if (route === `GET /deployments/${project.deployment.deploymentId}`) return reply(200, project.deployment);
  if (route === `PUT /deployments/${project.deployment.deploymentId}`) {
    const config = JSON.parse(body || '{}').deploymentConfig ?? {};
    const version = project.versions.find((item) => item.versionNumber === config.versionNumber);
    if (!version) return fail(400, 'Version not found.');
    project.deployment = { ...project.deployment, versionNumber: version.versionNumber, description: config.description };
    // The web app now runs the new code over the same properties and Drive.
    server = loadFamilyServer(server.fake, version.files.find((file) => file.type === 'SERVER_JS').source);
    return reply(200, project.deployment);
  }
  if (route.startsWith('GET /deployments/') || route.startsWith('PUT /deployments/')) return fail(404, 'Requested entity was not found.');
  return fail(400, `Unknown request ${route}`);
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, range, x-upload-content-type, x-upload-content-length',
  'access-control-expose-headers': 'location'
};

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => resolve(Buffer.concat(chunks)));
  request.on('error', reject);
});

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const origin = `http://${request.headers.host}`;
  if (request.method === 'OPTIONS') { response.writeHead(204, cors); response.end(); return; }
  try {
    if (url.pathname === '/macros/s/mock/exec') {
      if (request.method === 'GET') {
        response.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(server.get()));
        return;
      }
      const body = (await readBody(request)).toString('utf8');
      const reply = server.post(JSON.parse(body || '{}'));
      const id = randomUUID();
      echoes.set(id, JSON.stringify(reply));
      response.writeHead(302, { ...cors, location: `${origin}/macros/echo?user_content_key=${id}` });
      response.end();
      return;
    }
    if (url.pathname === '/macros/echo') {
      const id = url.searchParams.get('user_content_key');
      const text = echoes.get(id);
      echoes.delete(id);
      response.writeHead(text ? 200 : 404, { ...cors, 'content-type': 'application/json; charset=utf-8' });
      response.end(text ?? '{"ok":false}');
      return;
    }
    if (url.pathname.startsWith('/drive/v3/') || url.pathname.startsWith('/upload/drive/v3/')) {
      const body = await readBody(request);
      const reply = server.fake.drive.handle({ method: request.method, url: url.pathname + url.search, headers: request.headers, body, uploadBase: origin });
      response.writeHead(reply.status, { ...cors, ...reply.headers });
      response.end(reply.body);
      return;
    }
    if (url.pathname.startsWith('/v1/projects/')) {
      const body = (await readBody(request)).toString('utf8');
      const reply = scriptApi(request.method, url.pathname, request.headers, body);
      response.writeHead(reply.status, { ...cors, 'content-type': 'application/json; charset=utf-8' });
      response.end(reply.body);
      return;
    }
    if (url.pathname === '/__state') {
      response.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ properties: Object.fromEntries(server.fake.properties), project, files: [...server.fake.drive.files.values()]
        .map(({ id, name, mimeType, parents, trashed, content }) => ({ id, name, mimeType, parents, trashed, size: content.length })) }));
      return;
    }
    response.writeHead(404, cors);
    response.end('not found');
  } catch (error) {
    response.writeHead(500, cors);
    response.end(String(error));
  }
}).listen(port, '127.0.0.1', () => console.log(`family storage mock on http://127.0.0.1:${port}/macros/s/mock/exec`));
