'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const gate = require('../server/content-gate');

test('adult keywords flag a title', () => {
  assert.equal(gate.classify({ title: 'Frieren: Beyond Journey\u2019s End' }).adult, false);
  assert.equal(gate.classify({ title: 'Some Uncensored OVA' }).adult, true);
  assert.equal(gate.classify({ title: 'Plain Show', genres: ['Hentai'] }).adult, true);
  assert.match(gate.classify({ title: 'Ecchi Club' }).reason, /ecchi/);
});

test('a keyword inside a longer word is not a match', () => {
  for (const title of ['My Hero Academia', 'Zero no Tsukaima', 'Hero Mask', 'XXXHOLiC']) {
    assert.equal(gate.classify({ title }).adult, false, title);
  }
  for (const title of ['XXX', 'Ero', 'Ecchi Club', 'Hentai Club', '18+ Show', '21+ Cut']) {
    assert.equal(gate.classify({ title }).adult, true, title);
  }
});

test('classify keeps an existing adult flag', () => {
  assert.equal(gate.classify({ title: 'Some Neutral Title', adult: true }).adult, true);
});

test('classify keeps the item and never drops fields', () => {
  const out = gate.classify({ title: 'Ecchi Club', poster: 'x.jpg', episodes: 12 });
  assert.equal(out.poster, 'x.jpg');
  assert.equal(out.episodes, 12);
  assert.equal(out.adult, true);
  assert.deepEqual(gate.classifyAll([{ title: 'Ok' }]).length, 1);
});

test('the code needs length and a letter', () => {
  assert.match(gate.codeProblem('12345'), /at least/);
  assert.match(gate.codeProblem('123456'), /letter/);
  assert.equal(gate.codeProblem('abc123'), '');
});

test('a code verifies against its record and nothing else', () => {
  const record = gate.makeRecord('letmein7');
  assert.equal(gate.verifyCode('letmein7', record), true);
  assert.equal(gate.verifyCode('letmein8', record), false);
  assert.equal(gate.verifyCode('', record), false);
  assert.equal(gate.verifyCode('letmein7', null), false);
});
