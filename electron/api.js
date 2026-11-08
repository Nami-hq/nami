'use strict';

const scrape = require('../server/scrape');
const store = require('../server/store');
const { version } = require('../package.json');

let trendingCache = { at: 0, items: [] };
const infoCache = new Map();

function apiError(message, status = 502, code = 'upstream_error') {
  return Object.assign(new Error(message), { status, code });
}

async function getTrending() {
  const now = Date.now();
  if (trendingCache.items.length && now - trendingCache.at < 10 * 60_000) {
    return trendingCache.items;
  }
  try {
    const items = await scrape.getTrending();
    if (items.length) trendingCache = { at: now, items };
    return items;
  } catch (error) {
    if (trendingCache.items.length) return trendingCache.items;
    throw error;
  }
}

function enrichHistoryInBackground(items) {
  const missing = items.filter((entry) => !entry.poster && entry.title).slice(0, 4);
  if (!missing.length) return;
  for (const entry of missing) {
    scrape
      .searchAnime(entry.title)
      .then((results) => {
        const exact = results.find(
          (result) => result.title.toLowerCase() === entry.title.toLowerCase()
        );
        const match = exact || results[0];
        if (match && match.poster) store.updateHistoryPoster(entry.slug, entry.mode, match.poster);
      })
      .catch(() => {});
  }
}

async function call(method, payload = {}) {
  switch (method) {
    case 'bootstrap': {
      const [trending, history, settings] = await Promise.all([
        getTrending().catch(() => []),
        Promise.resolve(store.readHistory()),
        Promise.resolve(store.readSettings()),
      ]);
      enrichHistoryInBackground(history);
      return { trending, history, settings, version };
    }

    case 'trending':
      return { items: await getTrending() };

    case 'search': {
      const query = String(payload.query || '').trim();
      if (query.length < 2) throw apiError('Type at least two characters', 400, 'bad_query');
      return { items: await scrape.searchAnime(query), query };
    }

    case 'episodes': {
      const slug = String(payload.slug || '');
      if (!slug) throw apiError('Missing anime id', 400, 'bad_request');
      return { episodes: await scrape.getEpisodes(slug) };
    }

    case 'anime': {
      const slug = String(payload.slug || '');
      if (!slug) throw apiError('Missing anime id', 400, 'bad_request');
      const cached = infoCache.get(slug);
      if (cached && Date.now() - cached.at < 60 * 60_000) return cached.value;
      const value = await scrape.getAnimeInfo(slug);
      infoCache.set(slug, { at: Date.now(), value });
      return value;
    }

    case 'resolve': {
      const slug = String(payload.slug || '');
      const ep = String(payload.ep || '');
      const mode = payload.mode === 'dub' ? 'dub' : 'sub';
      const epId = String(payload.epId || '');
      const query = String(payload.query || '');
      const index = payload.index;
      if (!slug || !/^[0-9]+(\.[0-9]+)?$/.test(ep)) {
        throw apiError('Missing anime or episode', 400, 'bad_request');
      }
      try {
        return await scrape.resolveDirect({ slug, epNumber: ep, epId, mode });
      } catch (error) {
        if (!query || index === undefined || index === null || index === '') throw error;
        const result = await scrape.resolveViaAniCli({
          query,
          index,
          epNumber: ep,
          mode,
          referer: error.referer || '',
        });
        result.warning = error.message;
        return result;
      }
    }

    case 'history.list': {
      const history = store.readHistory();
      enrichHistoryInBackground(history);
      return { items: history };
    }

    case 'history.save':
      return { entry: store.saveHistoryEntry(payload.entry) };

    case 'history.remove':
      store.removeHistoryEntry(String(payload.slug || ''), payload.mode);
      return { ok: true };

    case 'history.clear':
      store.clearHistory();
      return { ok: true };

    case 'settings.get':
      return store.readSettings();

    case 'settings.save':
      return store.saveSettings(payload.patch || {});

    default:
      throw apiError('Unknown NAMI action', 404, 'not_found');
  }
}

function register(ipcMain) {
  ipcMain.handle('nami:api', async (_event, request) => {
    const method = request && typeof request.method === 'string' ? request.method : '';
    try {
      return { ok: true, value: await call(method, request?.payload || {}) };
    } catch (error) {
      return {
        ok: false,
        error: {
          message: error.message || 'Something went wrong',
          status: error.status || 502,
          code: error.code || 'upstream_error',
        },
      };
    }
  });
}

module.exports = { register, call };
