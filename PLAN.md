# NAMI — build plan

Goal: a desktop GUI for ani-cli with a liquid-glass interface and an integrated HLS player.
Acceptance: `npm start` opens a frameless window; search finds anime; choosing an episode plays it in the built-in player with subtitles, quality switching, resume, and next episode; app still works after restart.

Stack: Electron shell + local Node HTTP server + vanilla ES modules + hls.js. No build step.

1. Scaffold app, install Electron, vendor hls.js and fonts.
   Check: `npm ls electron` reports a version; vendor files return 200.
2. Scraper module: search, trending, episodes, resolve ZokoAnime stream.
   Check: `node test/scrape.test.js` prints live results for "frieren" and a playable master URL.
3. Stream proxy: rewrite m3u8 URIs, pass Referer, proxy segments and subtitles.
   Check: `curl` the local `/hls` endpoint returns `#EXTM3U` and a segment fetch returns bytes.
4. Local server: API routes, image proxy, history/settings store with atomic writes.
   Check: `/api/trending`, `/api/search`, `/api/episodes`, `/api/history` return 200 JSON.
5. UI shell + discover/detail/history views in liquid glass.
   Check: screenshots at 1440 and 390, no horizontal scroll, focus states visible.
6. Integrated player: custom controls, scrub, volume, quality, subtitles, next episode, resume.
   Check: play a resolved stream in the app and screenshot a frame with controls.
7. Electron shell: frameless window, custom controls, external links, close behaviour.
   Check: `npm start` opens the app; window controls work.
8. Finish: accessibility pass, reduced motion/transparency, empty/error/loading states, tests.
   Check: `npm test` passes; final screenshots reviewed.

Notes:
- App uses the same endpoints as ani-cli 5.1.7. If direct resolution fails, it falls back to `ANI_CLI_PLAYER=debug ani-cli`.
- Streams need `Referer: <embed origin>`. The local proxy adds it.
- Keep ani-cli's history untouched; import it once into NAMI's own store.
