'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const stateRoot = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
const stateDir = process.env.NAMI_STATE_DIR || path.join(stateRoot, 'nami');
const cacheDir = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'nami');
const historyFile = path.join(stateDir, 'history.json');
const settingsFile = path.join(stateDir, 'settings.json');
const gateFile = path.join(stateDir, 'gate.json');
const introFile = path.join(stateDir, 'intros.json');
const aniCliHistory = path.join(stateRoot, 'ani-cli', 'ani-hsts');

const defaultSettings = {
  quality: 'best',
  mode: 'sub',
  autoplay: true,
  volume: 1,
  muted: false,
  subtitles: true,
  theme: 'system',
  introSkip: true,
  introStart: 5,
  introLength: 85,
  outroSkip: true,
  outroSeconds: 35,
  useAniSkip: true,
  adultFilter: true,
  runtimeInstalled: false,
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, file);
}

function readSettings() {
  const stored = readJson(settingsFile, {});
  return { ...defaultSettings, ...(stored && typeof stored === 'object' ? stored : {}) };
}

function saveSettings(patch) {
  const next = { ...readSettings(), ...patch };
  next.volume = Math.max(0, Math.min(1, Number(next.volume) || 0));
  next.mode = next.mode === 'dub' ? 'dub' : 'sub';
  next.quality = ['best', '1080', '720', '360'].includes(String(next.quality))
    ? String(next.quality)
    : 'best';
  next.autoplay = Boolean(next.autoplay);
  next.muted = Boolean(next.muted);
  next.subtitles = Boolean(next.subtitles);
  next.theme = ['system', 'light', 'dark'].includes(String(next.theme)) ? String(next.theme) : 'system';
  next.introSkip = Boolean(next.introSkip);
  next.outroSkip = Boolean(next.outroSkip);
  next.useAniSkip = Boolean(next.useAniSkip);
  next.adultFilter = Boolean(next.adultFilter);
  next.runtimeInstalled = Boolean(next.runtimeInstalled);
  next.introStart = clampNumber(next.introStart, 0, 900, 5);
  next.introLength = clampNumber(next.introLength, 5, 300, 85);
  next.outroSeconds = clampNumber(next.outroSeconds, 5, 300, 35);
  writeJson(settingsFile, next);
  return next;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/* ------------------------------ the gate --------------------------------- */

function readGate() {
  const record = readJson(gateFile, null);
  return record && typeof record === 'object' && record.hash ? record : null;
}

function writeGate(record) {
  if (!record) {
    try {
      fs.rmSync(gateFile, { force: true });
    } catch {
      /* already gone */
    }
    return null;
  }
  writeJson(gateFile, record);
  return record;
}

/* -------------------------- learned intro marks --------------------------- */

function readIntros() {
  const stored = readJson(introFile, {});
  return stored && typeof stored === 'object' ? stored : {};
}

function saveIntroMark(slug, mark) {
  if (!slug || !mark) return null;
  const intros = readIntros();
  const key = String(slug);
  const previous = intros[key] || {};
  intros[key] = {
    start: Number(mark.start) || previous.start || 0,
    end: Number(mark.end) || previous.end || 0,
    skips: Array.isArray(mark.skips) ? mark.skips.slice(-7) : previous.skips || [],
    updatedAt: Date.now(),
  };
  writeJson(introFile, intros);
  return intros[key];
}

function readIntroMark(slug) {
  const intros = readIntros();
  const mark = slug ? intros[String(slug)] : null;
  return mark && typeof mark === 'object' ? mark : null;
}

function keyFor(entry) {
  return `${entry.slug}::${entry.mode || 'sub'}`;
}

function importAniCliHistory(entries) {
  if (!fs.existsSync(aniCliHistory)) return entries;
  const known = new Set(entries.map(keyFor));
  let lines = [];
  try {
    lines = fs.readFileSync(aniCliHistory, 'utf8').split(/\r?\n/);
  } catch {
    return entries;
  }
  for (const line of lines) {
    const [ep, slug, ...titleParts] = line.split('\t');
    if (!ep || !slug || !titleParts.length) continue;
    const entry = {
      slug,
      title: titleParts.join('\t').trim(),
      poster: '',
      ep,
      mode: 'sub',
      position: 0,
      duration: 0,
      updatedAt: 0,
      imported: true,
    };
    if (known.has(keyFor(entry))) continue;
    known.add(keyFor(entry));
    entries.push(entry);
  }
  return entries;
}

function readHistory() {
  const stored = readJson(historyFile, null);
  let entries = Array.isArray(stored) ? stored : null;
  if (!entries) {
    entries = importAniCliHistory([]);
    if (entries.length) writeJson(historyFile, entries);
  }
  return entries
    .filter((entry) => entry && entry.slug && entry.title)
    .map((entry) => ({
      slug: String(entry.slug),
      title: String(entry.title),
      poster: String(entry.poster || ''),
      ep: String(entry.ep || '1'),
      mode: entry.mode === 'dub' ? 'dub' : 'sub',
      position: Number(entry.position) || 0,
      duration: Number(entry.duration) || 0,
      updatedAt: Number(entry.updatedAt) || 0,
      imported: Boolean(entry.imported),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function saveHistoryEntry(input) {
  if (!input || !input.slug || !input.title) {
    const error = new Error('A history entry needs a slug and a title');
    error.status = 400;
    throw error;
  }
  const entries = readHistory();
  const entry = {
    slug: String(input.slug),
    title: String(input.title).slice(0, 300),
    poster: String(input.poster || ''),
    ep: String(input.ep || '1'),
    mode: input.mode === 'dub' ? 'dub' : 'sub',
    position: Math.max(0, Number(input.position) || 0),
    duration: Math.max(0, Number(input.duration) || 0),
    updatedAt: Date.now(),
    imported: false,
  };
  const key = keyFor(entry);
  const index = entries.findIndex((item) => keyFor(item) === key);
  if (index >= 0) entries[index] = entry;
  else entries.unshift(entry);
  writeJson(historyFile, entries.slice(0, 80));
  return entry;
}

function removeHistoryEntry(slug, mode) {
  const key = `${slug}::${mode === 'dub' ? 'dub' : 'sub'}`;
  const entries = readHistory().filter((entry) => keyFor(entry) !== key);
  writeJson(historyFile, entries);
}

function updateHistoryPoster(slug, mode, poster) {
  if (!poster) return;
  const key = `${slug}::${mode === 'dub' ? 'dub' : 'sub'}`;
  const entries = readHistory();
  const index = entries.findIndex((entry) => keyFor(entry) === key);
  if (index < 0 || entries[index].poster) return;
  entries[index].poster = poster;
  writeJson(historyFile, entries);
}

function clearHistory() {
  writeJson(historyFile, []);
}

function imageCachePath(url) {
  const hash = crypto.createHash('sha1').update(url).digest('hex');
  return path.join(cacheDir, 'img', hash.slice(0, 2), hash);
}

module.exports = {
  stateDir,
  cacheDir,
  readSettings,
  saveSettings,
  readGate,
  writeGate,
  readIntroMark,
  saveIntroMark,
  readHistory,
  saveHistoryEntry,
  removeHistoryEntry,
  updateHistoryPoster,
  clearHistory,
  ensureDir,
  imageCachePath,
};
