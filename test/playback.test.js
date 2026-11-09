'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let rules;

test('load the playback rules', async () => {
  rules = await import('../app/js/playback-rules.js');
  assert.equal(typeof rules.shouldOfferSkipIntro, 'function');
  assert.equal(typeof rules.shouldOfferNext, 'function');
  assert.equal(typeof rules.pickLearnedMark, 'function');
});

const MINUTE = 60;

test('skip intro shows inside the window and hides outside it', () => {
  const base = { duration: 24 * MINUTE, settings: {}, playing: true };
  assert.equal(rules.shouldOfferSkipIntro({ ...base, currentTime: 2 }), false, 'before the intro');
  assert.equal(rules.shouldOfferSkipIntro({ ...base, currentTime: 6 }), true, 'inside the intro');
  assert.equal(rules.shouldOfferSkipIntro({ ...base, currentTime: 60 }), true, 'still inside');
  assert.equal(rules.shouldOfferSkipIntro({ ...base, currentTime: 120 }), false, 'past the end');
});

test('skip intro respects the setting and the pause state', () => {
  const base = { duration: 24 * MINUTE, currentTime: 30 };
  assert.equal(rules.shouldOfferSkipIntro({ ...base, settings: { introSkip: false } }), false);
  assert.equal(rules.shouldOfferSkipIntro({ ...base, settings: {}, playing: false }), false);
});

test('a learned intro end replaces the default length', () => {
  const learned = { start: 12, end: 74 };
  assert.equal(rules.shouldOfferSkipIntro({ currentTime: 20, duration: 24 * MINUTE, learned }), true);
  assert.equal(rules.shouldOfferSkipIntro({ currentTime: 80, duration: 24 * MINUTE, learned }), false);
  assert.equal(rules.nextIntroEnd({ currentTime: 20, learned }), 74);
});

test('skipping twice moves the learned end deeper, never shallower', () => {
  const first = rules.learnIntroSkips({ at: 30, settings: {} });
  const second = rules.learnIntroSkips({ skips: first.skips, at: 66, settings: {}, learned: first });
  assert.ok(second.end > first.end, `${second.end} should pass ${first.end}`);
  assert.ok(second.end <= first.start + 200);
  const third = rules.learnIntroSkips({ skips: second.skips, at: 40, settings: {}, learned: second });
  assert.ok(third.end <= second.end, 'an early skip must not push the end out');
});

test('a jump never lands behind the playhead', () => {
  assert.equal(rules.nextIntroEnd({ currentTime: 88, settings: {} }), 90);
  assert.equal(rules.nextIntroEnd({ currentTime: 200, settings: {} }), 202);
});

test('a late intro answer never overwrites a newer learned mark', () => {
  const mine = { start: 5, end: 90, updatedAt: 200 };
  assert.equal(rules.pickLearnedMark(mine, null), mine);
  assert.equal(rules.pickLearnedMark(null, mine), mine);
  assert.equal(rules.pickLearnedMark(mine, { start: 5, end: 60, updatedAt: 100 }), mine);
  assert.equal(rules.pickLearnedMark(mine, { start: 5, end: 120, updatedAt: 300 }).end, 120);
  assert.equal(
    rules.pickLearnedMark({ start: 5, end: 80, updatedAt: 0 }, { start: 5, end: 120, updatedAt: 0 }).end,
    120
  );
});

test('next episode appears through the outro and not before it', () => {
  const base = { duration: 24 * MINUTE, settings: {}, playing: true };
  assert.equal(rules.shouldOfferNext({ ...base, currentTime: 10 * MINUTE }), false);
  assert.equal(rules.shouldOfferNext({ ...base, currentTime: 24 * MINUTE - 40 }), false);
  assert.equal(rules.shouldOfferNext({ ...base, currentTime: 24 * MINUTE - 20 }), true);
  // A silly number is clamped to the 300 s ceiling, so it still shows in the outro.
  assert.equal(rules.shouldOfferNext({ ...base, currentTime: 1240, settings: { outroSeconds: 30 * MINUTE } }), true);
  assert.equal(rules.shouldOfferNext({ ...base, currentTime: 10 * MINUTE, settings: { outroSeconds: 30 * MINUTE } }), false);
});

test('the outro prompt needs a real duration and a playing video', () => {
  assert.equal(rules.shouldOfferNext({ currentTime: 12, duration: NaN }), false);
  assert.equal(rules.shouldOfferNext({ currentTime: 12, duration: 20, settings: {}, playing: false }), false);
  assert.equal(rules.shouldOfferNext({ currentTime: 20, duration: 20 }), false, 'the ended event covers this');
  assert.equal(rules.remainingSeconds(30, 100), 70);
  assert.equal(rules.remainingSeconds(200, 100), 0);
});
