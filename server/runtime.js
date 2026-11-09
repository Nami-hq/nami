'use strict';

// First-run runtime: NAMI fetches its own ani-cli and yt-dlp into the app's state
// directory, so nobody has to open a terminal. Streaming from the site's own
// endpoints works without them; they power the ani-cli fallback and downloads.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const stateRoot = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
const stateDir = process.env.NAMI_STATE_DIR || path.join(stateRoot, 'nami');
const binRoot = process.env.NAMI_BIN_DIR || path.join(stateDir, 'bin');

const ANI_CLI_URLS = [
  'https://raw.githubusercontent.com/ani-cli/ani-cli/master/ani-cli',
  'https://raw.githubusercontent.com/pystardust/ani-cli/master/ani-cli',
];

const YT_DLP_URLS = {
  linux: ['https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'],
  darwin: ['https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'],
  win32: ['https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'],
};

function platformKey(platform = process.platform) {
  if (platform === 'win32') return 'win32';
  if (platform === 'darwin') return 'darwin';
  return 'linux';
}

function binaryNames(key = platformKey()) {
  return key === 'win32'
    ? { aniCli: 'ani-cli', ytDlp: 'yt-dlp.exe', bash: 'bash.exe' }
    : { aniCli: 'ani-cli', ytDlp: 'yt-dlp', bash: 'bash' };
}

function ensureBinDir(dir = binRoot) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  return dir;
}

/** Look for an executable on PATH, and in the app's own bin directory first. */
function findExecutable(name, { dir = binRoot, env = process.env } = {}) {
  const own = path.join(dir, name);
  if (fs.existsSync(own)) {
    if (process.platform === 'win32' || fs.statSync(own).mode & 0o111) return own;
  }
  if (process.platform === 'win32') {
    const where = spawnSync('where', [name], { encoding: 'utf8', env });
    const line = String(where.stdout || '').split(/\r?\n/).find(Boolean);
    return line ? line.trim() : null;
  }
  for (const entry of String(env.PATH || '').split(':')) {
    if (!entry) continue;
    const candidate = path.join(entry, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function runtimeStatus(options = {}) {
  const key = platformKey(options.platform);
  const names = binaryNames(key);
  const dir = options.dir || binRoot;
  const aniCli = findExecutable(names.aniCli, { ...options, dir });
  const ytDlp = findExecutable(names.ytDlp, { ...options, dir });
  const bash = findExecutable(names.bash, { ...options, dir });
  return {
    platform: key,
    dir,
    aniCli,
    ytDlp,
    bash,
    ready: Boolean(aniCli && ytDlp),
    // ani-cli is a shell script, so Windows needs a bash for the fallback path.
    needsBash: key === 'win32' && !bash,
  };
}

/** PATH with the app's bin directory in front, so a spawned spared shell finds them. */
function envWithRuntime(base = process.env, dir = binRoot) {
  const separator = process.platform === 'win32' ? ';' : ':';
  const path = base.PATH || base.Path || '';
  return { ...base, PATH: `${dir}${separator}${path}` };
}

async function download(url, destination) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'NAMI' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} returned HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1024) throw new Error('The download was too small to be a binary');
  const temp = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temp, buffer, { mode: 0o755 });
  fs.renameSync(temp, destination);
  if (process.platform !== 'win32') fs.chmodSync(destination, 0o755);
  return destination;
}

async function downloadFirst(urls, destination) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await download(url, destination);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No download source answered');
}

async function installAniCli({ dir = ensureBinDir(), onProgress = () => {} } = {}) {
  const names = binaryNames();
  const target = path.join(dir, names.aniCli);
  onProgress({ step: 'ani-cli', state: 'start' });
  await downloadFirst(ANI_CLI_URLS, target);
  const text = fs.readFileSync(target, 'utf8');
  if (!text.startsWith('#!') || !/ani-cli/i.test(text.slice(0, 4000))) {
    fs.rmSync(target, { force: true });
    throw new Error('The ani-cli download was not the expected script');
  }
  onProgress({ step: 'ani-cli', state: 'done', path: target });
  return target;
}

async function installYtDlp({ dir = ensureBinDir(), onProgress = () => {}, platform } = {}) {
  const key = platformKey(platform);
  const names = binaryNames(key);
  const target = path.join(dir, names.ytDlp);
  onProgress({ step: 'yt-dlp', state: 'start' });
  await downloadFirst(YT_DLP_URLS[key], target);
  onProgress({ step: 'yt-dlp', state: 'done', path: target });
  return target;
}

/**
 * Install whatever is missing. Returns the status plus the problems we hit, so
 * the UI can say what happened instead of failing quietly.
 */
async function installRuntime({ onProgress = () => {}, force = false, dir } = {}) {
  const target = ensureBinDir(dir);
  const before = runtimeStatus({ dir: target });
  const problems = [];

  if (force || !before.aniCli) {
    try {
      await installAniCli({ dir: target, onProgress });
    } catch (error) {
      problems.push({ step: 'ani-cli', message: error.message });
    }
  }
  if (force || !before.ytDlp) {
    try {
      await installYtDlp({ dir: target, onProgress });
    } catch (error) {
      problems.push({ step: 'yt-dlp', message: error.message });
    }
  }

  const status = runtimeStatus({ dir: target });
  if (status.needsBash) {
    const attempt = spawnSync(
      'winget',
      ['install', '--id', 'Git.Git', '-e', '--accept-package-agreements', '--accept-source-agreements'],
      { encoding: 'utf8' }
    );
    if (attempt.error || attempt.status !== 0) {
      problems.push({
        step: 'bash',
        message: 'ani-cli needs Git Bash on Windows. Install Git for Windows, then run setup again.',
      });
    }
  }

  return { ...runtimeStatus({ dir: target }), problems };
}

module.exports = {
  binRoot,
  platformKey,
  binaryNames,
  ensureBinDir,
  findExecutable,
  runtimeStatus,
  envWithRuntime,
  installRuntime,
  installAniCli,
  installYtDlp,
};
