'use strict';

// First-run runtime: NAMI fetches its own ani-cli and yt-dlp into the app's state
// directory, so nobody has to open a terminal. Streaming from the site's own
// endpoints works without them; they power the ani-cli fallback and downloads.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const stateRoot = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
const stateDir = process.env.NAMI_STATE_DIR || path.join(stateRoot, 'nami');
const binRoot = process.env.NAMI_BIN_DIR || path.join(stateDir, 'bin');

// Pinned on 2026-11-09. Bump the commit, the version and their hashes together;
// the installer refuses a file that does not match.
const ANI_CLI_COMMIT = '2cc8ae2c27324c8e684e4dc4223698c1f6caec03';
const ANI_CLI_SHA256 = 'be466708dd5bd5f5ae4feff3dbb47fc5f048a7f801f11e1264db9cab83c3d146';
const ANI_CLI_URLS = [
  `https://raw.githubusercontent.com/pystardust/ani-cli/${ANI_CLI_COMMIT}/ani-cli`,
  `https://raw.githubusercontent.com/ani-cli/ani-cli/${ANI_CLI_COMMIT}/ani-cli`,
];

const YT_DLP_VERSION = '2026.10.26';
const YT_DLP_BASE = `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}`;
const YT_DLP_URLS = {
  linux: [`${YT_DLP_BASE}/yt-dlp`],
  darwin: [`${YT_DLP_BASE}/yt-dlp_macos`],
  win32: [`${YT_DLP_BASE}/yt-dlp.exe`],
};
const YT_DLP_SHA256 = {
  linux: 'e51e69e89489f199530f13d32a4342da3ddb2cf34842f364603a066db05afbf3',
  darwin: '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa',
  win32: 'f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d',
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
function findExecutable(name, { dir = binRoot, env = process.env, platform = process.platform } = {}) {
  const own = path.join(dir, name);
  if (fs.existsSync(own)) {
    if (platform === 'win32' || fs.statSync(own).mode & 0o111) return own;
  }
  if (platform === 'win32') {
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
    ready: Boolean(aniCli && ytDlp && (key !== 'win32' || bash)),
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

function matchesChecksum(buffer, expected) {
  if (!expected || typeof expected !== 'string' || !/^[0-9a-f]{64}$/i.test(expected)) return false;
  return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase() === expected.toLowerCase();
}

async function download(url, destination, { sha256 = '' } = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'NAMI' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} returned HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1024) throw new Error('The download was too small to be a binary');
  if (sha256 && !matchesChecksum(buffer, sha256)) {
    throw new Error('The download did not match its pinned checksum');
  }
  const temp = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temp, buffer, { mode: 0o755 });
  fs.renameSync(temp, destination);
  if (process.platform !== 'win32') fs.chmodSync(destination, 0o755);
  return destination;
}

async function downloadFirst(urls, destination, options = {}) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await download(url, destination, options);
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
  await downloadFirst(ANI_CLI_URLS, target, { sha256: ANI_CLI_SHA256 });
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
  await downloadFirst(YT_DLP_URLS[key], target, { sha256: YT_DLP_SHA256[key] });
  onProgress({ step: 'yt-dlp', state: 'done', path: target });
  return target;
}

/** winget can take minutes on a cold machine, so never block the main process. */
function runWinget() {
  return new Promise((resolve) => {
    const child = spawn(
      'winget',
      ['install', '--id', 'Git.Git', '-e', '--accept-package-agreements', '--accept-source-agreements'],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, timedOut: true });
    }, 180_000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, timedOut: false });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, timedOut: false });
    });
  });
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

  let status = runtimeStatus({ dir: target });
  if (status.needsBash) {
    onProgress({ step: 'bash', state: 'start' });
    await runWinget();
    status = runtimeStatus({ dir: target });
    if (status.needsBash) {
      onProgress({ step: 'bash', state: 'failed' });
      problems.push({
        step: 'bash',
        message: 'ani-cli needs Git Bash on Windows. Install Git for Windows, then run setup again.',
      });
    } else {
      onProgress({ step: 'bash', state: 'done', path: status.bash });
    }
  }

  return { ...runtimeStatus({ dir: target }), problems };
}

module.exports = {
  binRoot,
  ANI_CLI_COMMIT,
  ANI_CLI_SHA256,
  YT_DLP_VERSION,
  YT_DLP_URLS,
  YT_DLP_SHA256,
  platformKey,
  binaryNames,
  ensureBinDir,
  findExecutable,
  runtimeStatus,
  envWithRuntime,
  matchesChecksum,
  installRuntime,
  installAniCli,
  installYtDlp,
};
