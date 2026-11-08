'use strict';

const { UA } = require('../server/scrape');

const APP_ORIGIN = 'nami://app';

function streamPath(upstream, referer) {
  const params = new URLSearchParams({ u: upstream });
  if (referer) params.set('r', referer);
  return `/stream?${params.toString()}`;
}

function streamUrl(upstream, referer) {
  return `${APP_ORIGIN}${streamPath(upstream, referer)}`;
}

function imageUrl(upstream) {
  if (!upstream) return '';
  return `${APP_ORIGIN}/img?${new URLSearchParams({ u: upstream }).toString()}`;
}

function rewritePlaylist(text, baseUrl, referer, makeUrl = streamUrl) {
  const resolve = (value) => {
    try {
      return new URL(value, baseUrl).href;
    } catch {
      return '';
    }
  };

  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (match, value) => {
          if (value.startsWith('data:')) return match;
          const absolute = resolve(value);
          return absolute ? `URI="${makeUrl(absolute, referer)}"` : match;
        });
      }
      if (trimmed.startsWith('data:')) return line;
      const absolute = resolve(trimmed);
      return absolute ? makeUrl(absolute, referer) : line;
    })
    .join('\n');
}

function looksLikePlaylist(contentType, url) {
  if (/mpegurl/i.test(contentType || '')) return true;
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return false;
  }
}

function contentTypeFor(contentType, url) {
  if (/mpegurl/i.test(contentType || '')) return 'application/vnd.apple.mpegurl';
  if (/vtt/i.test(contentType || '') || /\.vtt$/i.test(new URL(url).pathname)) {
    return 'text/vtt; charset=utf-8';
  }
  return contentType || 'application/octet-stream';
}

function mediaHeaders(referer, range) {
  const headers = {
    'user-agent': UA,
    accept: '*/*',
    'accept-encoding': 'identity',
  };
  if (referer) {
    headers.referer = referer;
    try {
      headers.origin = new URL(referer).origin;
    } catch {
      /* a malformed referer is omitted */
    }
  }
  if (range) headers.range = range;
  return headers;
}

module.exports = {
  APP_ORIGIN,
  streamPath,
  streamUrl,
  imageUrl,
  rewritePlaylist,
  looksLikePlaylist,
  contentTypeFor,
  mediaHeaders,
};
