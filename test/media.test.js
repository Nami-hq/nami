'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  streamPath,
  streamUrl,
  imageUrl,
  rewritePlaylist,
  contentTypeFor,
  mediaHeaders,
} = require('../electron/media');

const BASE = 'https://cdn.example.test/show/master.m3u8';
const REFERER = 'https://embed.example.test/';

test('streamPath carries upstream and referer under the app origin', () => {
  const path = streamPath('https://cdn.example.test/a.m3u8', REFERER);
  assert.match(path, /^\/stream\?/);
  const url = new URL(streamUrl('https://cdn.example.test/a.m3u8', REFERER));
  assert.equal(url.protocol, 'nami:');
  assert.equal(url.host, 'app');
  assert.equal(url.pathname, '/stream');
  assert.equal(url.searchParams.get('u'), 'https://cdn.example.test/a.m3u8');
  assert.equal(url.searchParams.get('r'), REFERER);
});

test('imageUrl wraps remote images under the app origin', () => {
  const url = new URL(imageUrl('https://cdn.example.test/poster.jpg'));
  assert.equal(url.protocol, 'nami:');
  assert.equal(url.host, 'app');
  assert.equal(url.pathname, '/img');
  assert.equal(url.searchParams.get('u'), 'https://cdn.example.test/poster.jpg');
  assert.equal(imageUrl(''), '');
});

test('rewritePlaylist resolves relative playlists against the playlist URL', () => {
  const source = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080',
    '1080/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x720',
    '/show/720/index.m3u8',
  ].join('\n');

  const output = rewritePlaylist(source, BASE, REFERER);
  const lines = output.split('\n');
  assert.equal(lines[0], '#EXTM3U');
  assert.equal(lines[2], streamUrl('https://cdn.example.test/show/1080/index.m3u8', REFERER));
  assert.equal(lines[4], streamUrl('https://cdn.example.test/show/720/index.m3u8', REFERER));
});

test('rewritePlaylist rewrites key and media URIs inside tags', () => {
  const source = [
    '#EXTM3U',
    '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"',
    '#EXTINF:6.006,',
    'seg-1.ts',
    '#EXT-X-MAP:URI="init.mp4"',
  ].join('\n');

  const output = rewritePlaylist(source, 'https://cdn.example.test/show/720/index.m3u8', REFERER);
  assert.ok(output.includes(streamUrl('https://cdn.example.test/show/720/keys/key.bin', REFERER)));
  assert.ok(output.includes(streamUrl('https://cdn.example.test/show/720/init.mp4', REFERER)));
  assert.ok(output.includes(streamUrl('https://cdn.example.test/show/720/seg-1.ts', REFERER)));
});

test('rewritePlaylist leaves data URIs alone', () => {
  const source = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="data:text/plain;base64,AAAA"\nseg.ts';
  const output = rewritePlaylist(source, BASE, REFERER);
  assert.ok(output.includes('URI="data:text/plain;base64,AAAA"'));
});

test('rewritePlaylist normalizes line endings', () => {
  const output = rewritePlaylist('#EXTM3U\r\nseg.ts\r\n', BASE, REFERER);
  assert.ok(!output.includes('\r'));
  const lines = output.split('\n');
  assert.equal(lines[0], '#EXTM3U');
  assert.equal(lines[1], streamUrl('https://cdn.example.test/show/seg.ts', REFERER));
});

test('contentTypeFor maps playlists and subtitles', () => {
  assert.equal(
    contentTypeFor('application/x-mpegURL', 'https://cdn.example.test/a.m3u8'),
    'application/vnd.apple.mpegurl'
  );
  assert.equal(
    contentTypeFor('text/plain', 'https://cdn.example.test/sub.vtt'),
    'text/vtt; charset=utf-8'
  );
  assert.equal(contentTypeFor('video/mp4', 'https://cdn.example.test/seg.mp4'), 'video/mp4');
});

test('mediaHeaders sends a browser user agent, referer and optional range', () => {
  const headers = mediaHeaders(REFERER, 'bytes=0-1023');
  assert.ok(headers['user-agent']);
  assert.equal(headers.referer, REFERER);
  assert.equal(headers.origin, 'https://embed.example.test');
  assert.equal(headers.range, 'bytes=0-1023');

  const bare = mediaHeaders('', '');
  assert.ok(bare['user-agent']);
  assert.equal(bare.referer, undefined);
  assert.equal(bare.range, undefined);
});
