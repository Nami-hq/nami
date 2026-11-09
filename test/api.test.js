'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// app/js/api.js reads window.nami.api.call, so stub the bridge before import.
const calls = [];
globalThis.window = {
  nami: {
    api: {
      call: async (method, payload) => {
        calls.push([method, payload]);
        return { ok: true, value: { method, payload } };
      },
    },
  },
};

test('playback, gate and runtime methods reach the bridge', async () => {
  const { api } = await import('../app/js/api.js');
  await api.skipTimes({ title: 'Frieren', slug: 'frieren', ep: '1' });
  await api.saveIntro({ slug: 'frieren', mark: { start: 5, end: 90 } });
  await api.gateStatus();
  await api.gateUnlock('letmein7');
  await api.gateLock();
  await api.gateSetCode({ code: 'letmein7', current: '' });
  await api.gateClearCode();
  await api.runtimeStatus();
  await api.runtimeInstall();

  assert.deepEqual(calls.map(([method]) => method), [
    'skip.times',
    'intro.save',
    'gate.status',
    'gate.unlock',
    'gate.lock',
    'gate.setCode',
    'gate.clearCode',
    'runtime.status',
    'runtime.install',
  ]);
  assert.deepEqual(calls[0][1], { title: 'Frieren', slug: 'frieren', ep: '1' });
  assert.deepEqual(calls[3][1], { code: 'letmein7' });
});
