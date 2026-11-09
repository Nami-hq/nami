'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('an adult item is locked unless the gate is open', async () => {
  const { isLocked, lockLabel } = await import('../app/js/gate-view.js');
  const adult = { adult: true, reason: 'genre: hentai' };
  const clean = { adult: false };

  assert.equal(isLocked(adult, { filter: true, unlocked: false }), true);
  assert.equal(isLocked(adult, { filter: true, unlocked: true }), false);
  assert.equal(isLocked(adult, { filter: false, unlocked: false }), false);
  assert.equal(isLocked(clean, { filter: true, unlocked: false }), false);
  assert.equal(isLocked(adult, null), true, 'no gate state means locked');
  assert.equal(isLocked(null, { filter: true, unlocked: false }), false);

  assert.equal(lockLabel(), '21+');
});
