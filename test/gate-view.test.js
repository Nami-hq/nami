'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('adult titles stay locked no matter what the settings say', async () => {
  const { isLocked, lockLabel } = await import('../app/js/gate-view.js');
  const adult = { adult: true, reason: 'genre: hentai' };
  const clean = { adult: false };

  // The ordinary unlock and the filter switch never reveal an adult title.
  assert.equal(isLocked(adult, { filter: true, unlocked: true }), true);
  assert.equal(isLocked(adult, { filter: false, unlocked: true }), true);
  assert.equal(isLocked(adult, null), true);
  assert.equal(isLocked(adult, {}), true);

  // Only the owner's secret path, which the UI cannot set, opens them.
  assert.equal(isLocked(adult, { ownerUnlocked: true }), false);

  assert.equal(isLocked(clean, { filter: true, unlocked: false }), false);
  assert.equal(isLocked(null, {}), false);

  assert.equal(lockLabel(), '21+');
});
