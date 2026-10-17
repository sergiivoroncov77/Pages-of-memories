// A local stand-in for the family storage: runs the real Code.gs on fake
// Apps Script services and serves the Drive endpoints the app uses for media.
//
//   node server/google-apps-script/dev/mockServer.mjs [port]
//
// In the app, connect to http://127.0.0.1:<port>/macros/s/mock/exec.
// Like Apps Script, a POST answers with a redirect to a one-time "echo" URL.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createFakeAppsScript, loadFamilyServer } from './fakeGoogle.mjs';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const server = loadFamilyServer(createFakeAppsScript());
const echoes = new Map();

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-upload-content-type, x-upload-content-length',
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
    if (url.pathname === '/__state') {
      response.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ properties: Object.fromEntries(server.fake.properties), files: [...server.fake.drive.files.values()]
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
