'use strict';

const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const media = require('./media');
const scrape = require('../server/scrape');
const store = require('../server/store');

const APP_ROOT = path.join(__dirname, '..', 'app');
const ORIGIN = 'nami://app';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: nami:",
  "media-src 'self' blob: nami:",
  "connect-src 'self' nami:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const DEBUG_LOG = process.env.NAMI_DEBUG_LOG || '';

function debugLog(line) {
  if (!DEBUG_LOG) return;
  try {
    fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* logging must never break a response */
  }
}

function toResponseBody(body, label) {
  const node = Readable.fromWeb(body);
  node.on('error', (error) => debugLog(`${label} body error: ${error.message}`));
  return Readable.toWeb(node);
}

function textResponse(value, status = 200) {
  return new Response(value, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS },
  });
}

async function serveStatic(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return textResponse('Bad path', 400);
  }
  if (decoded === '/') decoded = '/index.html';
  const file = path.resolve(APP_ROOT, `.${decoded}`);
  if (!file.startsWith(APP_ROOT + path.sep)) return textResponse('Not found', 404);

  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    return textResponse('Not found', 404);
  }
  if (!stat.isFile()) return textResponse('Not found', 404);

  const ext = path.extname(file).toLowerCase();
  const headers = {
    ...SECURITY_HEADERS,
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
  };
  if (ext === '.html') headers['content-security-policy'] = CSP;

  const body = await fsp.readFile(file);
  return new Response(body, { status: 200, headers });
}

async function serveImage(request) {
  const target = new URL(request.url).searchParams.get('u');
  if (!target) return textResponse('Missing image URL', 400);

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return textResponse('Bad image URL', 400);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return textResponse('Only http and https images are supported', 400);
  }

  const cacheBase = store.imageCachePath(parsed.href);
  const metaFile = `${cacheBase}.json`;
  try {
    const [buffer, meta] = await Promise.all([
      fsp.readFile(cacheBase),
      fsp.readFile(metaFile, 'utf8'),
    ]);
    const type = JSON.parse(meta).type || 'image/jpeg';
    return new Response(buffer, {
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=604800, immutable',
        ...SECURITY_HEADERS,
      },
    });
  } catch {
    /* not cached yet */
  }

  try {
    const response = await fetch(parsed.href, {
      headers: {
        'user-agent': scrape.UA,
        referer: `${scrape.BASE}/`,
        accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return textResponse('Image not found', 404);

    const type = response.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return textResponse('Upstream did not return an image', 502);

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 12_000_000) return textResponse('Image is too large', 502);

    store.ensureDir(path.dirname(cacheBase));
    await Promise.all([
      fsp.writeFile(cacheBase, buffer),
      fsp.writeFile(metaFile, JSON.stringify({ type, url: parsed.href })),
    ]);

    return new Response(buffer, {
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=604800, immutable',
        ...SECURITY_HEADERS,
      },
    });
  } catch (error) {
    return textResponse(`Image failed: ${error.message}`, 502);
  }
}

async function serveStream(request) {
  const url = new URL(request.url);
  const upstream = url.searchParams.get('u');
  const referer = url.searchParams.get('r') || '';
  if (!upstream) return textResponse('Missing stream URL', 400);

  let target;
  try {
    target = new URL(upstream);
  } catch {
    return textResponse('Bad stream URL', 400);
  }
  if (!/^https?:$/.test(target.protocol)) {
    return textResponse('Only http and https streams are supported', 400);
  }

  let response;
  try {
    response = await fetch(target.href, {
      headers: media.mediaHeaders(referer, request.headers.get('range')),
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    return textResponse(
      error.name === 'TimeoutError' ? 'Stream timed out' : `Stream failed: ${error.message}`,
      502
    );
  }

  if (!response.ok && response.status !== 206) {
    const detail = await response.text().catch(() => '');
    return textResponse(`Upstream ${response.status}. ${detail.slice(0, 200)}`, 502);
  }

  const finalUrl = response.url || target.href;
  const type = media.contentTypeFor(response.headers.get('content-type'), finalUrl);

  if (media.looksLikePlaylist(response.headers.get('content-type'), finalUrl)) {
    const text = await response.text();
    const rewritten = media.rewritePlaylist(text, finalUrl, referer);
    return new Response(rewritten, {
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        ...SECURITY_HEADERS,
      },
    });
  }

  if (type.startsWith('text/vtt')) {
    return new Response(await response.text(), {
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
        ...SECURITY_HEADERS,
      },
    });
  }

  const headers = new Headers({
    'content-type': type,
    'cache-control': 'public, max-age=3600',
    'access-control-allow-origin': '*',
  });
  for (const key of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = response.headers.get(key);
    if (value) headers.set(key, value);
  }

  debugLog(`segment ${response.status} ${type} ${finalUrl.slice(0, 160)}`);
  return new Response(toResponseBody(response.body, path.basename(finalUrl)), {
    status: response.status,
    headers,
  });
}

async function handleAppRequest(request) {
  let parsed;
  try {
    parsed = new URL(request.url);
  } catch {
    return textResponse('Bad request', 400);
  }
  if (parsed.origin !== ORIGIN && parsed.hostname !== 'app') {
    return textResponse('Not found', 404);
  }

  try {
    if (parsed.pathname === '/stream') return await serveStream(request);
    if (parsed.pathname === '/img') return await serveImage(request);
    return await serveStatic(parsed.pathname);
  } catch (error) {
    return textResponse(`NAMI failed: ${error.message}`, 500);
  }
}

function register() {
  const { protocol } = require('electron');
  protocol.handle('nami', handleAppRequest);
}

module.exports = { register, handleAppRequest, APP_ROOT, ORIGIN };
