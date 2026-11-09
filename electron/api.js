'use strict';

const scrape = require('../server/scrape');
const store = require('../server/store');
const gate = require('../server/content-gate');
const skipTimes = require('../server/skip-times');
const runtime = require('../server/runtime');
const { version } = require('../package.json');

let trendingCache = { at: 0, items: [] };
const infoCache = new Map();
// Slugs the gate has flagged this run. A resolve for one never reaches a stream.
const adultSlugs = new Set();

function rememberAdult(item) {
  if (item?.adult === true && item.slug) adultSlugs.add(String(item.slug));
  return item;
}

function classifyItems(items) {
  return gate.classifyAll(items).map(rememberAdult);
}

function classifyItem(item) {
  return rememberAdult(gate.classify(item));
}
// Unlocked for this run only; closing NAMI puts the blur back.
let gateUnlocked = false;

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

function gateState() {
  const settings = store.readSettings();
  return {
    filter: settings.adultFilter !== false,
    hasCode: Boolean(store.readGate()),
    unlocked: gateUnlocked,
  };
}

async function call(method, payload = {}, context = {}) {
  switch (method) {
    case 'bootstrap': {
      const [trending, history] = await Promise.all([
        getTrending().catch(() => []),
        Promise.resolve(store.readHistory()),
      ]);
      enrichHistoryInBackground(history);
      const settings = store.readSettings();
      const state = gateState();
      return {
        trending: classifyItems(trending),
        history: classifyItems(history),
        settings,
        version,
        gate: state,
        runtime: runtime.runtimeStatus(),
      };
    }

    case 'trending':
      return { items: classifyItems(await getTrending()) };

    case 'search': {
      const query = String(payload.query || '').trim();
      if (query.length < 2) throw apiError('Type at least two characters', 400, 'bad_query');
      return { items: classifyItems(await scrape.searchAnime(query)), query };
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
      const value = classifyItem(await scrape.getAnimeInfo(slug));
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
      if (adultSlugs.has(slug)) {
        throw apiError('This title is locked', 403, 'adult_locked');
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
      return { items: classifyItems(history) };
    }

    case 'history.save':
      return { entry: store.saveHistoryEntry(classifyItem(payload.entry || {})) };

    case 'history.remove':
      store.removeHistoryEntry(String(payload.slug || ''), payload.mode);
      return { ok: true };

    case 'history.clear':
      store.clearHistory();
      return { ok: true };

    case 'skip.times': {
      const learned = store.readIntroMark(payload.slug);
      const settings = store.readSettings();
      if (!settings.useAniSkip) return { skip: null, learned, source: 'disabled' };

      const title = String(payload.title || '');
      const episode = String(payload.ep || '');
      const cached = skipTimes.cachedSkipTimes({ title, episode });
      if (cached.found) {
        return { skip: cached.value, learned, source: cached.value ? 'aniskip' : 'local' };
      }

      // Do not hold the first frame for a network lookup. The player pushes the
      // answer when it lands and applies it only to the same episode.
      skipTimes
        .skipTimesFor({ title, episode })
        .then((skip) =>
          context.send?.('nami:skip-times', {
            slug: String(payload.slug || ''),
            ep: episode,
            skip,
          })
        )
        .catch(() => {});
      return { skip: null, learned, source: 'local', pending: true };
    }

    case 'intro.save': {
      const mark = store.saveIntroMark(String(payload.slug || ''), payload.mark);
      return { mark };
    }

    case 'gate.status':
      return gateState();

    case 'gate.unlock': {
      const record = store.readGate();
      if (!record) throw apiError('Set a code first', 409, 'gate_no_code');
      if (!gate.verifyCode(payload.code, record)) {
        gateUnlocked = false;
        throw apiError('That code is not right', 403, 'gate_bad_code');
      }
      gateUnlocked = true;
      return gateState();
    }

    case 'gate.lock':
      gateUnlocked = false;
      return gateState();

    case 'gate.setCode': {
      const record = store.readGate();
      if (record && !gate.verifyCode(payload.current, record)) {
        throw apiError('The current code is not right', 403, 'gate_bad_code');
      }
      const problem = gate.codeProblem(payload.code);
      if (problem) throw apiError(problem, 400, 'gate_weak_code');
      store.writeGate(gate.makeRecord(payload.code));
      gateUnlocked = true;
      return gateState();
    }

    case 'gate.clearCode':
      store.writeGate(null);
      gateUnlocked = false;
      return gateState();

    case 'runtime.status':
      return runtime.runtimeStatus();

    case 'runtime.install': {
      const status = await runtime.installRuntime({
        force: Boolean(payload.force),
        onProgress: (progress) => context.send?.('nami:runtime', progress),
      });
      store.saveSettings({ runtimeInstalled: status.ready });
      return status;
    }

    case 'settings.save':
      return store.saveSettings(payload.patch || {});

    default:
      throw apiError('Unknown NAMI action', 404, 'not_found');
  }
}

function register(ipcMain) {
  ipcMain.handle('nami:api', async (event, request) => {
    const method = request && typeof request.method === 'string' ? request.method : '';
    try {
      const context = {
        send: (channel, value) => {
          try {
            event.sender.send(channel, value);
          } catch {
            /* the window went away */
          }
        },
      };
      return { ok: true, value: await call(method, request?.payload || {}, context) };
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

module.exports = { register, call, gateState };
