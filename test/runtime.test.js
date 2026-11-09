'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const skip = require('../server/skip-times');
const runtime = require('../server/runtime');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');

test('a site title lands on the right MAL entry', () => {
  const results = [
    { mal_id: 1, title: 'Frieren: Beyond Journey\'s End', episodes: 28 },
    { mal_id: 2, title: 'Frieren Special', episodes: 1 },
  ];
  assert.equal(skip.pickMalId(results, 'Frieren: Beyond Journey\u2019s End'), 1);
  assert.equal(skip.pickMalId(results, 'Nothing Like It'), 1, 'falls back to the first result');
  assert.equal(skip.pickMalId([], 'Frieren'), null);
  assert.equal(skip.pickMalId(results, ''), null);
});

test('normalise leaves only real op and ed intervals', () => {
  const payload = {
    results: [
      { skipType: 'op', interval: { startTime: 12, endTime: 102 } },
      { skipType: 'ed', interval: { startTime: 1320, endTime: 1410 } },
      { skipType: 'mixed-op', interval: { startTime: 0, endTime: 5 } },
    ],
  };
  const out = skip.normalizeSkipTimes(payload);
  assert.deepEqual(out.op, { start: 12, end: 102 });
  assert.deepEqual(out.ed, { start: 1320, end: 1410 });
  assert.equal(skip.normalizeSkipTimes({ results: [] }), null);
  assert.equal(skip.normalizeSkipTimes({ results: [{ skipType: 'op', interval: { startTime: 9, endTime: 9 } }] }), null);
});

test('the runtime knows the right file names per platform', () => {
  assert.equal(runtime.binaryNames('linux').ytDlp, 'yt-dlp');
  assert.equal(runtime.binaryNames('darwin').ytDlp, 'yt-dlp');
  assert.equal(runtime.binaryNames('win32').ytDlp, 'yt-dlp.exe');
  assert.equal(runtime.platformKey('darwin'), 'darwin');
  assert.equal(runtime.platformKey('freebsd'), 'linux');
});

test('downloads must match the pinned checksum', () => {
  const buffer = Buffer.from('hello');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  assert.equal(runtime.matchesChecksum(buffer, hash), true);
  assert.equal(runtime.matchesChecksum(buffer, '0'.repeat(64)), false);
  assert.equal(runtime.matchesChecksum(buffer, ''), false);
});

test('the runtime pins the versions it downloads', () => {
  assert.match(runtime.ANI_CLI_COMMIT, /^[0-9a-f]{40}$/);
  assert.equal(runtime.ANI_CLI_SHA256.length, 64);
  assert.equal(runtime.YT_DLP_VERSION, '2026.10.26');
  assert.ok(runtime.YT_DLP_URLS.linux[0].includes('/download/2026.10.26/'));
  assert.equal(runtime.YT_DLP_SHA256.win32.length, 64);
});

test('Windows is not ready without a bash for ani-cli', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nami-win-'));
  fs.writeFileSync(path.join(dir, 'ani-cli'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(dir, 'yt-dlp.exe'), 'binary');
  const env = { PATH: '' };
  const without = runtime.runtimeStatus({ dir, platform: 'win32', env });
  assert.equal(without.ready, false);
  assert.equal(without.needsBash, true);
  fs.writeFileSync(path.join(dir, 'bash.exe'), 'binary');
  const withBash = runtime.runtimeStatus({ dir, platform: 'win32', env });
  assert.equal(withBash.ready, true);
  assert.equal(withBash.needsBash, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a bin directory on the app path wins over PATH', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nami-bin-'));
  const fake = path.join(dir, 'yt-dlp');
  fs.writeFileSync(fake, '#!/bin/sh\n', { mode: 0o755 });
  assert.equal(runtime.findExecutable('yt-dlp', { dir, env: { PATH: '/nonexistent' } }), fake);
  const env = runtime.envWithRuntime({ PATH: '/usr/bin' }, dir);
  assert.equal(env.PATH.split(path.delimiter)[0], dir);
  fs.rmSync(dir, { recursive: true, force: true });
});
