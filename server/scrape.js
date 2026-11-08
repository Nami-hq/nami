'use strict';

const { spawn } = require('node:child_process');

const BASE = 'https://hianime.at';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const XOR_KEY = Buffer.from('otaku-embed-v1', 'utf8');
const REQUEST_TIMEOUT = 20_000;

class UpstreamError extends Error {
  constructor(message, { status = 0, url = '', referer = '' } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.url = url;
    this.referer = referer;
  }
}

async function fetchText(url, { referer, timeout = REQUEST_TIMEOUT } = {}) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        ...(referer ? { referer } : {}),
      },
    });
  } catch (error) {
    throw new UpstreamError(`Could not reach ${new URL(url).host}`, {
      url,
      referer,
      status: 0,
    });
  }
  if (!response.ok) {
    throw new UpstreamError(`${new URL(url).host} returned HTTP ${response.status}`, {
      status: response.status,
      url,
      referer,
    });
  }
  return response.text();
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => {
      const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      return map[name.toLowerCase()];
    });
}

function safeCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return match ? decodeEntities(match[1]) : '';
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function slugFromHref(href) {
  if (!href) return '';
  const path = href.replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '');
  return path.replace(/^watch\//, '').replace(/\/$/, '');
}

function parseCount(block, cls) {
  const match = block.match(new RegExp(`tick-${cls}[^>]*>[\\s\\S]*?(\\d+)</div>`, 'i'));
  return match ? Number(match[1]) : 0;
}

function parseSearch(html) {
  const main = String(html).split('id="main-sidebar"')[0];
  const blocks = main.split('<div class="flw-item').slice(1);
  const seen = new Set();
  const items = [];

  for (const block of blocks) {
    const posterTag = block.match(/<img[^>]*class="film-poster-img"[^>]*>/i);
    const nameTag = block.match(/<a[^>]*class="dynamic-name"[^>]*>/i);
    const hrefMatch = block.match(/href="https:\/\/hianime\.at\/watch\/([^"]+)"/i);
    const idMatch = block.match(/data-id="(\d+)"/i);
    if (!nameTag || !hrefMatch) continue;

    const slug = slugFromHref(hrefMatch[1]);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const title = attr(nameTag[0], 'title') || stripTags(nameTag[0]);
    const info = [...block.matchAll(/<span class="fdi-item[^"]*">([^<]*)<\/span>/gi)].map((m) =>
      stripTags(m[1])
    );
    const descMatch = block.match(/<div class="description">([\s\S]*?)<\/div>/i);

    items.push({
      slug,
      id: idMatch ? Number(idMatch[1]) : null,
      title: title || 'Untitled',
      jname: attr(nameTag[0], 'data-jname'),
      poster: posterTag ? attr(posterTag[0], 'src') : '',
      description: descMatch ? stripTags(descMatch[1]) : '',
      type: info[0] || '',
      duration: info[1] || '',
      sub: parseCount(block, 'sub'),
      dub: parseCount(block, 'dub'),
      episodes: parseCount(block, 'eps'),
    });
  }

  return items;
}

function parseTrending(html) {
  const section = String(html).split('<div id="anime-trending"')[1];
  if (!section) return [];
  const scoped = section.split('</section>')[0];
  const blocks = scoped.split('<div class="swiper-slide">').slice(1);
  const items = [];

  for (const block of blocks) {
    const linkTag = block.match(/<a[^>]*class="film-poster"[^>]*>/i);
    const posterTag = block.match(/<img[^>]*class="film-poster-img"[^>]*>/i);
    const titleMatch = block.match(/<div class="film-title[^"]*"[^>]*>([^<]*)<\/div>/i);
    const rankMatch = block.match(/<div class="number">[\s\S]*?<span>(\d+)<\/span>/i);
    if (!linkTag) continue;
    const slug = slugFromHref(attr(linkTag[0], 'href'));
    if (!slug) continue;
    items.push({
      slug,
      title: stripTags(titleMatch ? titleMatch[1] : attr(linkTag[0], 'title')),
      jname: attr(titleMatch ? titleMatch[0] : '', 'data-jname'),
      poster: posterTag ? attr(posterTag[0], 'src') : '',
      rank: rankMatch ? Number(rankMatch[1]) : items.length + 1,
      description: '',
      type: '',
      duration: '',
      sub: 0,
      dub: 0,
      episodes: 0,
    });
  }

  return items.slice(0, 12);
}

function parseEpisodes(payload) {
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    throw new UpstreamError('Episode list was not valid JSON');
  }
  const html = String(data.html || '');
  const tags = html.match(/<a\b[^>]*\bep-item\b[^>]*>/gi) || [];
  const seen = new Set();
  const episodes = [];

  for (const tag of tags) {
    const number = attr(tag, 'data-number');
    const id = attr(tag, 'data-id');
    if (!number || !id || seen.has(number)) continue;
    seen.add(number);
    episodes.push({ number, id: Number(id), href: attr(tag, 'href') });
  }

  return episodes;
}

function parseServers(payload) {
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    throw new UpstreamError('Server list was not valid JSON');
  }
  const html = String(data.html || '');
  const tags = html.match(/<[a-z]+\b[^>]*\bdata-server-name\b[^>]*>/gi) || [];
  return tags
    .map((tag) => ({
      name: attr(tag, 'data-server-name'),
      type: attr(tag, 'data-type'),
      hash: attr(tag, 'data-hash'),
    }))
    .filter((server) => server.hash);
}

function deobfuscateBlob(blob) {
  const encrypted = Buffer.from(blob, 'base64');
  const clear = Buffer.alloc(encrypted.length);
  for (let i = 0; i < encrypted.length; i += 1) {
    clear[i] = encrypted[i] ^ XOR_KEY[i % XOR_KEY.length];
  }
  return clear.toString('utf8');
}

function parseVariants(playlist, masterUrl) {
  const lines = String(playlist).split(/\r?\n/);
  const variants = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const uri = lines.slice(i + 1).find((candidate) => {
      const value = candidate.trim();
      return value && !value.startsWith('#');
    });
    if (!uri) continue;
    const heightMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/i);
    const height = heightMatch ? Number(heightMatch[2]) : 0;
    variants.push({
      label: height ? `${height}p` : bandwidthMatch ? `${Math.round(Number(bandwidthMatch[1]) / 1000)}k` : 'Auto',
      height,
      bandwidth: bandwidthMatch ? Number(bandwidthMatch[1]) : 0,
      url: new URL(uri.trim(), masterUrl).href,
    });
  }
  return variants.sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
}

async function searchAnime(query) {
  const url = `${BASE}/search?keyword=${encodeURIComponent(query.trim())}`;
  const html = await fetchText(url, { referer: `${BASE}/` });
  const items = parseSearch(html);
  if (!items.length) {
    throw new UpstreamError('No results found', { url, status: 404 });
  }
  return items;
}

async function getTrending() {
  const html = await fetchText(`${BASE}/home`, { referer: `${BASE}/` });
  return parseTrending(html);
}

async function getEpisodes(slug) {
  const suffix = String(slug).split('-').pop();
  if (!/^\d+$/.test(suffix)) throw new UpstreamError('That anime link has no numeric id', { status: 400 });
  const payload = await fetchText(`${BASE}/api/theme/episode/list/${suffix}`, {
    referer: `${BASE}/`,
  });
  return parseEpisodes(payload);
}

async function getAnimeInfo(slug) {
  const url = `${BASE}/${slug}`;
  const html = await fetchText(url, { referer: `${BASE}/` });
  const ogImage = String(html).match(/<meta property="og:image" content="([^"]+)"/i);
  const desc = String(html).match(/<div class="film-description[^"]*">[\s\S]*?<div class="text">([\s\S]*?)<\/div>/i);
  const name = String(html).match(/<h2[^>]*class="film-name[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
  const genres = [...String(html).matchAll(/href="https:\/\/hianime\.at\/genre\/([^"]+)"/gi)]
    .map((m) => decodeEntities(m[1].replace(/-/g, ' ')))
    .filter((value, index, list) => value && list.indexOf(value) === index)
    .slice(0, 6);
  const score = String(html).match(/itemprop="ratingValue"[^>]*content="([^"]+)"/i);
  const status = String(html).match(/<span class="item">\s*Status:\s*<\/span>\s*<span class="name">([^<]+)<\/span>/i);
  return {
    slug,
    title: name ? stripTags(name[1]) : '',
    poster: ogImage ? decodeEntities(ogImage[1]) : '',
    description: desc ? stripTags(desc[1]) : '',
    genres,
    score: score ? score[1] : '',
    status: status ? stripTags(status[1]) : '',
  };
}

async function resolveDirect({ slug, epNumber, epId, mode = 'sub' }) {
  const episodes = epId ? [] : await getEpisodes(slug);
  const episode = epId
    ? { id: Number(epId), number: String(epNumber) }
    : episodes.find((item) => String(item.number) === String(epNumber));
  if (!episode || !episode.id) {
    throw new UpstreamError(`Episode ${epNumber} is not in the episode list`, { status: 404 });
  }

  const serversPayload = await fetchText(`${BASE}/api/theme/episode/servers?episodeId=${episode.id}`, {
    referer: `${BASE}/`,
  });
  const servers = parseServers(serversPayload);
  const server =
    servers.find((item) => item.name === 'ZokoAnime' && item.type === mode) ||
    servers.find((item) => item.type === mode) ||
    servers.find((item) => item.name === 'ZokoAnime');

  if (!server) {
    const error = new UpstreamError(`No ${mode} stream is listed for this episode`, { status: 404 });
    error.code = 'mode_unavailable';
    throw error;
  }

  const embedUrl = Buffer.from(server.hash, 'base64').toString('utf8');
  const referer = `${new URL(embedUrl).origin}/`;
  const embedHtml = await fetchText(embedUrl, { referer });
  const blobMatch = embedHtml.match(/window\.__P\s*=\s*["']([^"']+)["']/);
  if (!blobMatch) {
    throw new UpstreamError('The embed page did not contain a stream blob', { referer, url: embedUrl });
  }

  let data;
  try {
    data = JSON.parse(deobfuscateBlob(blobMatch[1]));
  } catch {
    throw new UpstreamError('The stream blob could not be read', { referer, url: embedUrl });
  }

  if (!data.src || !/^https?:\/\//i.test(data.src)) {
    throw new UpstreamError('The stream blob had no playlist URL', { referer, url: embedUrl });
  }

  const masterUrl = data.src;
  const master = await fetchText(masterUrl, { referer });
  if (!master.includes('#EXTM3U')) {
    throw new UpstreamError('The stream host returned something other than a playlist', {
      referer,
      url: masterUrl,
    });
  }

  return {
    source: 'direct',
    slug,
    episode: String(episode.number),
    epId: episode.id,
    mode,
    masterUrl,
    referer,
    variants: parseVariants(master, masterUrl),
    subtitles: (Array.isArray(data.subtitles) ? data.subtitles : [])
      .filter((track) => track && track.src && /^https?:\/\//i.test(track.src))
      .map((track) => ({
        lang: track.lang || 'und',
        label: track.label || track.lang || 'Subtitles',
        src: track.src,
        default: Boolean(track.default),
      })),
    poster: data.poster || '',
    chapters: Array.isArray(data.chapters) ? data.chapters : [],
  };
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function resolveViaAniCli({ query, index, epNumber, mode = 'sub', referer = '' }) {
  return new Promise((resolve, reject) => {
    const args = ['-S', String(Number(index) + 1), '-e', String(epNumber), '-q', 'best'];
    if (mode === 'dub') args.push('--dub');
    if (query) args.push(String(query));

    const child = spawn('ani-cli', args, {
      env: { ...process.env, ANI_CLI_PLAYER: 'debug' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new UpstreamError('ani-cli timed out', { referer }));
    }, 90_000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new UpstreamError(`ani-cli could not start: ${error.message}`, { referer }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const clean = stripAnsi(output);
      const selected = clean.match(/Selected link:\s*\n\s*(https?:\/\/\S+)/i);
      if (!selected) {
        reject(new UpstreamError('ani-cli did not return a stream link', { referer }));
        return;
      }
      const variants = [...clean.matchAll(/^\s*(\d{3,4})\s*>\s*(https?:\/\/\S+)\s*$/gm)].map((match) => ({
        label: `${match[1]}p`,
        height: Number(match[1]),
        bandwidth: 0,
        url: match[2],
      }));
      const subtitle = clean.match(/Subtitles:\s*\n\s*(https?:\/\/\S+)/i);
      resolve({
        source: 'ani-cli',
        slug: '',
        episode: String(epNumber),
        epId: null,
        mode,
        masterUrl: selected[1],
        referer: referer || `${BASE}/`,
        variants,
        subtitles: subtitle ? [{ lang: 'en', label: 'English', src: subtitle[1], default: true }] : [],
        poster: '',
        chapters: [],
        exitCode: code,
      });
    });
  });
}

module.exports = {
  BASE,
  UA,
  UpstreamError,
  fetchText,
  decodeEntities,
  parseSearch,
  parseTrending,
  parseEpisodes,
  parseServers,
  parseVariants,
  deobfuscateBlob,
  searchAnime,
  getTrending,
  getEpisodes,
  getAnimeInfo,
  resolveDirect,
  resolveViaAniCli,
};
