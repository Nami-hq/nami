'use strict';

// Real intro and outro marks from AniSkip. The site slugs are not MAL ids, so a
// title lookup (Jikan) runs first and both answers are cached on disk.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const JIKAN = 'https://api.jikan.moe/v4/anime';
const ANISKIP = 'https://api.aniskip.com/v2/skip-times';
const TIMEOUT = 12_000;
const MAL_TTL = 7 * 24 * 60 * 60 * 1000;
const SKIP_TTL = 30 * 24 * 60 * 60 * 1000;

const stateRoot = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
const cacheFile =
  process.env.NAMI_SKIP_CACHE || path.join(stateRoot, 'nami', 'skip-times.json');

function readCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { mal: {}, skip: {} };
  } catch {
    return { mal: {}, skip: {} };
  }
}

function writeCache(cache) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const temp = `${cacheFile}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(cache));
    fs.renameSync(temp, cacheFile);
  } catch {
    /* a cache miss is survivable */
  }
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(sub|dub|uncensored|season\s*\d+|part\s*\d+)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Pick the MAL id that best matches a site title. Exact normalised matches win,
 * then a prefix match, then the first result.
 */
function pickMalId(results, title) {
  const wanted = normalizeTitle(title);
  if (!wanted || !Array.isArray(results) || !results.length) return null;
  const scored = results
    .map((entry) => {
      const names = [entry.title, entry.title_english, ...(entry.titles || []).map((t) => t.title)]
        .filter(Boolean)
        .map(normalizeTitle);
      let score = 0;
      for (const name of names) {
        if (name === wanted) score = Math.max(score, 3);
        else if (name.startsWith(wanted) || wanted.startsWith(name)) score = Math.max(score, 2);
        else if (name && wanted && name.includes(wanted)) score = Math.max(score, 1);
      }
      return { id: entry.mal_id, score, episodes: entry.episodes || 0 };
    })
    .filter((entry) => entry.id && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.episodes - b.episodes);
  return scored.length ? scored[0].id : results[0].mal_id || null;
}

/** AniSkip answers with a list of intervals; keep the first op and the first ed. */
function normalizeSkipTimes(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const pick = (type) =>
    results
      .filter((entry) => entry?.skipType === type && entry?.interval)
      .map((entry) => ({
        start: Number(entry.interval.startTime),
        end: Number(entry.interval.endTime),
      }))
      .filter((entry) => Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.end > entry.start)
      .sort((a, b) => a.start - b.start)[0] || null;
  const op = pick('op');
  const ed = pick('ed');
  if (!op && !ed) return null;
  return { op, ed, episodeLength: Number(payload?.episodeLength) || 0 };
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} returned HTTP ${response.status}`);
  return response.json();
}

async function findMalId(title, cache) {
  const key = normalizeTitle(title);
  if (!key) return null;
  const hit = cache.mal[key];
  if (hit && Date.now() - hit.at < MAL_TTL) return hit.id;
  const url = `${JIKAN}?q=${encodeURIComponent(title)}&limit=8&sfw=false`;
  const payload = await getJson(url);
  const id = pickMalId(payload?.data || [], title);
  cache.mal[key] = { id, at: Date.now() };
  return id;
}

/**
 * Skip marks for one episode. Returns null when neither service knows the title,
 * so the player falls back to its own window and its own learning.
 */
async function skipTimesFor({ title, episode }) {
  const ep = Number(episode);
  if (!title || !Number.isFinite(ep) || ep < 1) return null;
  const cache = readCache();
  const skipKey = `${normalizeTitle(title)}#${ep}`;
  const hit = cache.skip[skipKey];
  if (hit && Date.now() - hit.at < SKIP_TTL) return hit.value;

  let value = null;
  try {
    const malId = await findMalId(title, cache);
    if (malId) {
      const url = `${ANISKIP}/${malId}/${ep}?types[]=op&types[]=ed`;
      const payload = await getJson(url);
      const normalized = normalizeSkipTimes(payload);
      if (normalized) value = { malId, episode: ep, ...normalized };
    }
  } catch {
    value = null;
  }
  cache.skip[skipKey] = { value, at: Date.now() };
  writeCache(cache);
  return value;
}

module.exports = {
  normalizeTitle,
  pickMalId,
  normalizeSkipTimes,
  skipTimesFor,
  MAL_TTL,
  SKIP_TTL,
};
