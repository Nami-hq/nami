'use strict';

// Content gate: flags adult titles and keeps them behind a blur until the owner
// unlocks them with a code. Nothing here reaches the network.

const crypto = require('node:crypto');

const KEYWORDS = [
  'hentai',
  'ecchi',
  'uncensored',
  'nsfw',
  '18+',
  '21+',
  'xxx',
  'lewd',
  'ero ',
  'smut',
  'milf',
  'adult',
  'fan service',
  'fanservice',
];

const GENRES = ['hentai', 'ecchi', 'erotica', 'adult'];

const MIN_CODE_LENGTH = 6;

function textOf(item) {
  const parts = [item?.title, item?.name, item?.synopsis, item?.description];
  if (Array.isArray(item?.genres)) parts.push(item.genres.join(' '));
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Classify one item. `adult` is true when an adult keyword or genre shows up,
 * and `reason` says which one, so the UI can explain itself.
 */
function classify(item) {
  if (!item || typeof item !== 'object') return { ...item, adult: false, reason: '' };
  const text = textOf(item);
  const genres = Array.isArray(item.genres) ? item.genres.map((g) => String(g).toLowerCase()) : [];

  for (const genre of genres) {
    if (GENRES.includes(genre)) return { ...item, adult: true, reason: `genre: ${genre}` };
  }
  for (const keyword of KEYWORDS) {
    if (text.includes(keyword)) return { ...item, adult: true, reason: `title: ${keyword.trim()}` };
  }
  return { ...item, adult: false, reason: '' };
}

function classifyAll(items) {
  return Array.isArray(items) ? items.map(classify) : [];
}

/* ------------------------------- the code -------------------------------- */

function codeProblem(code) {
  const value = String(code ?? '');
  if (value.trim().length < MIN_CODE_LENGTH) return `Use at least ${MIN_CODE_LENGTH} characters`;
  if (!/[a-z]/i.test(value)) return 'Include at least one letter';
  return '';
}

function makeRecord(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(code), salt, 32).toString('hex');
  return { salt, hash, updatedAt: Date.now() };
}

function verifyCode(code, record) {
  if (!record?.salt || !record?.hash) return false;
  const candidate = crypto.scryptSync(String(code ?? ''), record.salt, 32);
  const known = Buffer.from(record.hash, 'hex');
  if (candidate.length !== known.length) return false;
  return crypto.timingSafeEqual(candidate, known);
}

module.exports = {
  KEYWORDS,
  GENRES,
  MIN_CODE_LENGTH,
  classify,
  classifyAll,
  codeProblem,
  makeRecord,
  verifyCode,
};
