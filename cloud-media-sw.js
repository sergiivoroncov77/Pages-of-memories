/*
 * «Истории близких»: voices and videos of shared books stream from the family
 * storage piece by piece, so they start at once and can be rewound without
 * downloading the whole file. Loaded into the app's service worker
 * (vite.config.ts → workbox.importScripts).
 *
 * A player asks for …/cloud-media/<file id>. The worker asks the page for a
 * short-lived Drive key (the page gets it from the storage script) and passes
 * the byte range on to Google Drive. Nothing is cached here.
 */
const CLOUD_MEDIA_ROUTE = '/cloud-media/';
const ASSET_ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const cloudMediaAccess = new Map();

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const index = url.pathname.indexOf(CLOUD_MEDIA_ROUTE);
  if (index < 0) return;
  const assetId = decodeURIComponent(url.pathname.slice(index + CLOUD_MEDIA_ROUTE.length));
  if (!ASSET_ID.test(assetId)) return;
  event.respondWith(streamCloudMedia(event, assetId));
});

async function pagesFor(event) {
  const own = event.clientId ? await self.clients.get(event.clientId) : undefined;
  const all = await self.clients.matchAll({ type: 'window' });
  return own ? [own, ...all.filter((client) => client.id !== own.id)] : all;
}

/** The page holds the storage key; it answers with what is needed to read the file from Drive. */
async function askPage(event, assetId, refresh) {
  const pages = await pagesFor(event);
  for (const page of pages) {
    const reply = await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), 15000);
      channel.port1.onmessage = (message) => { clearTimeout(timer); resolve(message.data); };
      page.postMessage({ type: 'cloud-media-access', assetId, refresh }, [channel.port2]);
    });
    if (reply && reply.ok) return reply;
  }
  throw new Error('Нет открытой страницы приложения, чтобы получить доступ к файлу.');
}

async function accessFor(event, assetId, refresh) {
  const cached = cloudMediaAccess.get(assetId);
  if (!refresh && cached && cached.expiresAt > Date.now() + 30000) return cached;
  const access = await askPage(event, assetId, refresh);
  cloudMediaAccess.set(assetId, access);
  return access;
}

function fromDrive(access, range) {
  const headers = { Authorization: 'Bearer ' + access.accessToken };
  if (range) headers.Range = range;
  return fetch(access.url, { headers });
}

async function streamCloudMedia(event, assetId) {
  const range = event.request.headers.get('range');
  try {
    let access = await accessFor(event, assetId, false);
    let response = await fromDrive(access, range);
    if (response.status === 401) {
      access = await accessFor(event, assetId, true);
      response = await fromDrive(access, range);
    }
    if (!response.ok) return new Response(null, { status: response.status === 416 ? 416 : 502 });
    return playable(response, access, range);
  } catch (error) {
    return new Response(null, { status: 504, statusText: 'Cloud storage unreachable' });
  }
}

/**
 * The same bytes with the headers a player needs. Drive may not let the page
 * see Content-Range across origins, so it is rebuilt from the known size.
 */
function playable(response, access, range) {
  const headers = new Headers({ 'Content-Type': access.mimeType || response.headers.get('content-type') || 'application/octet-stream',
    'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  const size = typeof access.size === 'number' ? access.size : null;
  const length = response.headers.get('content-length');
  if (response.status === 206) {
    let contentRange = response.headers.get('content-range');
    const asked = /^bytes=(\d+)-(\d*)$/.exec(range || '');
    if (!contentRange && size !== null && asked) {
      const start = Number(asked[1]);
      const end = Math.min(asked[2] ? Number(asked[2]) : size - 1, size - 1);
      contentRange = 'bytes ' + start + '-' + end + '/' + size;
      if (!length) headers.set('Content-Length', String(end - start + 1));
    }
    if (contentRange) headers.set('Content-Range', contentRange);
    if (length) headers.set('Content-Length', length);
    return new Response(response.body, { status: 206, headers });
  }
  if (length || size !== null) headers.set('Content-Length', length || String(size));
  return new Response(response.body, { status: 200, headers });
}
