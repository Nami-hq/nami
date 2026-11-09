'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseVariants, parseEpisodes, parseServers, parseSearch, resolveAniCliCommand } = require('../server/scrape');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('the ani-cli fallback uses the app runtime and bash on Windows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nami-ani-'));
  const script = path.join(dir, 'ani-cli');
  fs.writeFileSync(script, '#!/bin/sh\n', { mode: 0o755 });

  const linux = resolveAniCliCommand({
    args: ['-S', '1'],
    dir,
    platform: 'linux',
    env: { PATH: '/nonexistent' },
  });
  assert.equal(linux.command, script);
  assert.deepEqual(linux.args, ['-S', '1']);

  fs.writeFileSync(path.join(dir, 'bash.exe'), 'binary');
  const windows = resolveAniCliCommand({
    args: ['-S', '1'],
    dir,
    platform: 'win32',
    env: { PATH: '' },
  });
  assert.equal(windows.command, path.join(dir, 'bash.exe'));
  assert.deepEqual(windows.args, [script, '-S', '1']);

  fs.rmSync(path.join(dir, 'bash.exe'));
  assert.equal(
    resolveAniCliCommand({ args: [], dir, platform: 'win32', env: { PATH: '' } }),
    null
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('parseVariants resolves URLs and sorts by height', () => {
  const master = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
    '360/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
    'https://other.example.test/1080.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720',
    '720/index.m3u8?token=abc',
  ].join('\n');

  const variants = parseVariants(master, 'https://cdn.example.test/show/master.m3u8');
  assert.deepEqual(
    variants.map((variant) => variant.label),
    ['1080p', '720p', '360p']
  );
  assert.equal(variants[1].url, 'https://cdn.example.test/show/720/index.m3u8?token=abc');
  assert.equal(variants[0].url, 'https://other.example.test/1080.m3u8');
});

test('parseEpisodes reads episode anchors and deduplicates numbers', () => {
  const payload = JSON.stringify({
    html: `
      <a class="ep-item" data-number="1" data-id="101" href="/watch/a?ep=1">1</a>
      <a class="ep-item" data-number="2" data-id="102" href="/watch/a?ep=2">2</a>
      <a class="ep-item" data-number="2" data-id="999" href="/watch/a?ep=2b">2 again</a>
      <a class="ep-item" data-number="3" data-id="103" href="/watch/a?ep=3">3</a>`,
  });
  const episodes = parseEpisodes(payload);
  assert.deepEqual(
    episodes.map((episode) => episode.number),
    ['1', '2', '3']
  );
  assert.equal(episodes[1].id, 102);
});

test('parseServers reads div-based server items', () => {
  const payload = JSON.stringify({
    html: `
      <div class="server-item" data-server-name="ZokoAnime" data-type="sub" data-hash="YWJj"></div>
      <div class="server-item" data-server-name="ZokoAnime" data-type="dub" data-hash="ZGVm"></div>
      <div class="server-item" data-server-name="MegaCloud" data-type="sub" data-hash="Z2hp"></div>`,
  });
  const servers = parseServers(payload);
  assert.equal(servers.length, 3);
  assert.deepEqual(servers[0], { name: 'ZokoAnime', type: 'sub', hash: 'YWJj' });
});

test('parseSearch extracts a title, poster and counts from a result block', () => {
  const html = `
    <div class="flw-item">
      <img class="film-poster-img" src="https://cdn.example.test/poster.jpg" />
      <a class="dynamic-name" href="https://hianime.at/watch/frieren-beyond-journeys-end-481" title="Frieren: Beyond Journey's End" data-jname="Sousou no Frieren"></a>
      <div class="tick tick-sub"><div>28</div></div>
      <div class="tick tick-dub"><div>4</div></div>
      <div class="tick tick-eps"><div>28</div></div>
      <span class="fdi-item">TV</span>
      <span class="fdi-item">24m</span>
      <div class="description">An elf mage walks on.</div>
    </div>
    <div id="main-sidebar"></div>`;

  const items = parseSearch(html);
  assert.equal(items.length, 1);
  assert.equal(items[0].slug, 'frieren-beyond-journeys-end-481');
  assert.equal(items[0].title, "Frieren: Beyond Journey's End");
  assert.equal(items[0].poster, 'https://cdn.example.test/poster.jpg');
  assert.equal(items[0].sub, 28);
  assert.equal(items[0].dub, 4);
});
