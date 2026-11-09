'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nami-flow-'));
process.env.NAMI_STATE_DIR = stateDir;
process.env.NAMI_SKIP_CACHE = path.join(stateDir, 'skip-times.json');
process.env.NAMI_BIN_DIR = path.join(stateDir, 'bin');

const scrape = require('../server/scrape');
const store = require('../server/store');
const skipTimes = require('../server/skip-times');
const api = require('../electron/api');

test('a detail result is classified and its slug cannot resolve', async () => {
  const original = scrape.getAnimeInfo;
  scrape.getAnimeInfo = async () => ({
    slug: 'redo-flow',
    title: 'Redo of Healer',
    genres: ['Hentai'],
    description: '',
  });
  try {
    const info = await api.call('anime', { slug: 'redo-flow' });
    assert.equal(info.adult, true);
    await assert.rejects(
      () => api.call('resolve', { slug: 'redo-flow', ep: '1' }),
      /locked/i
    );
  } finally {
    scrape.getAnimeInfo = original;
  }
});

test('history keeps the adult flag and local marks survive AniSkip being off', async () => {
  store.saveSettings({ useAniSkip: false });
  store.saveHistoryEntry({
    slug: 'redo-flow',
    title: 'Redo of Healer',
    poster: 'x.jpg',
    ep: '1',
    adult: true,
  });
  assert.equal(store.readHistory()[0].adult, true);

  const listed = await api.call('history.list');
  assert.equal(listed.items[0].adult, true);

  store.saveIntroMark('redo-flow', { start: 4, end: 88 });
  const times = await api.call('skip.times', {
    slug: 'redo-flow',
    title: 'Redo of Healer',
    ep: '1',
  });
  assert.equal(times.source, 'disabled');
  assert.equal(times.learned.end, 88);
});

test(
  'a slow AniSkip lookup does not hold the local mark',
  { timeout: 3000 },
  async () => {
    store.saveSettings({ useAniSkip: true });
    store.saveIntroMark('slow-flow', { start: 1, end: 2 });
    const original = skipTimes.skipTimesFor;
    let release;
    skipTimes.skipTimesFor = () =>
      new Promise((resolve) => {
        release = resolve;
      });

    try {
      const sent = [];
      const result = await api.call(
        'skip.times',
        { slug: 'slow-flow', title: 'Slow Show', ep: '2' },
        { send: (channel, value) => sent.push([channel, value]) }
      );
      assert.equal(result.learned.end, 2);
      assert.equal(result.pending, true);

      release({ op: { start: 3, end: 60 }, ed: null });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(sent.length, 1);
      assert.equal(sent[0][0], 'nami:skip-times');
      assert.deepEqual(sent[0][1].skip.op, { start: 3, end: 60 });
      assert.equal(sent[0][1].ep, '2');
    } finally {
      skipTimes.skipTimesFor = original;
    }
  }
);

test('a transient network failure is not cached for 30 days', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('offline');
  };
  try {
    const result = await skipTimes.skipTimesFor({ title: 'Transient Show', episode: 1 });
    assert.equal(result, null);
    let cache = { skip: {} };
    try {
      cache = JSON.parse(fs.readFileSync(process.env.NAMI_SKIP_CACHE, 'utf8'));
    } catch {
      /* no file yet is fine */
    }
    assert.equal(cache.skip['transient show#1'], undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a definite empty answer is cached', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).includes('jikan')
        ? { data: [{ mal_id: 0, title: 'No Marks Show', episodes: 1 }] }
        : { results: [] },
  });
  try {
    const result = await skipTimes.skipTimesFor({ title: 'No Marks Show', episode: 1 });
    assert.equal(result, null);
    const cache = JSON.parse(fs.readFileSync(process.env.NAMI_SKIP_CACHE, 'utf8'));
    assert.equal(cache.skip['no marks show#1'].value, null);
  } finally {
    global.fetch = originalFetch;
  }
});
