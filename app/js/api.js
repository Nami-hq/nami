const ORIGIN = 'nami://app';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function bridge() {
  const api = window.nami?.api;
  if (!api?.call) {
    throw new ApiError('NAMI must run as the desktop app', { code: 'bridge_missing' });
  }
  return api;
}

async function request(method, payload = {}) {
  let result;
  try {
    result = await bridge().call(method, payload);
  } catch {
    throw new ApiError('The desktop bridge did not answer. Restart NAMI.', {
      code: 'bridge_failed',
    });
  }

  if (!result || result.ok !== true) {
    const error = result?.error || {};
    throw new ApiError(error.message || 'Something went wrong', {
      status: Number(error.status) || 0,
      code: error.code || 'request_failed',
    });
  }

  return result.value;
}

export const api = {
  bootstrap: () => request('bootstrap'),
  trending: () => request('trending'),
  search: (query) => request('search', { query }),
  episodes: (slug) => request('episodes', { slug }),
  anime: (slug) => request('anime', { slug }),
  resolve: (payload) => request('resolve', payload),
  history: () => request('history.list'),
  saveHistory: (entry) => request('history.save', { entry }),
  removeHistory: (slug, mode) => request('history.remove', { slug, mode }),
  clearHistory: () => request('history.clear'),
  settings: () => request('settings.get'),
  saveSettings: (patch) => request('settings.save', { patch }),
  skipTimes: (payload) => request('skip.times', payload),
  saveIntro: (payload) => request('intro.save', payload),
  gateStatus: () => request('gate.status'),
  gateUnlock: (code) => request('gate.unlock', { code }),
  gateLock: () => request('gate.lock'),
  gateSetCode: (payload) => request('gate.setCode', payload),
  gateClearCode: () => request('gate.clearCode'),
  runtimeStatus: () => request('runtime.status'),
  runtimeInstall: (force = false) => request('runtime.install', force ? { force: true } : {}),
};

export function imageUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  return `${ORIGIN}/img?${new URLSearchParams({ u: url }).toString()}`;
}

export function streamUrl(upstream, referer) {
  if (!upstream) return '';
  const params = new URLSearchParams({ u: upstream });
  if (referer) params.set('r', referer);
  return `${ORIGIN}/stream?${params.toString()}`;
}
