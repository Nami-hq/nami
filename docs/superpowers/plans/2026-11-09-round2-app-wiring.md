# Round 2 app wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish round 2 by wiring the already-built playback, gate and runtime logic into the app UI, so skip-intro, next-episode-on-outro, the adult gate and first-run auto-install all work in the running app.

**Architecture:** The pure logic is done and tested (`app/js/playback-rules.js`, `server/content-gate.js`, `server/skip-times.js`, `server/runtime.js`), and the main-process IPC handlers exist in `electron/api.js`. This plan adds the renderer client methods, the player controls, the gate UI and the runtime installer screen, all through the existing `nami:api` bridge and the existing `nami://` origin. No CSP change, no new npm dependency.

**Tech Stack:** Electron, vanilla ES modules, node:test, HLS.js (vendored), CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-11-09-liquid-glass-social-design.md` (this plan covers the round-2 prerequisite named in that spec's section 1 and 12).

## Global Constraints

- Desktop only. No server process. No `localhost`/IP.
- The renderer stays network-free: everything goes through `window.nami.api.call` and the `nami://` proxy.
- No new npm runtime dependencies. Vendor files by hand if needed.
- `npm test` must stay green; new logic gets a node:test.
- Streams resolve with `ani-cli -S <n> -e <ep> -q best <query>` only as fallback; `scrape.resolveDirect` is primary.
- Renders use `TMPDIR=/home/qusai13q/.cache/hf-tmp`. One headless Chrome at a time, `CHROME_PATH=/home/qusai13q/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` for design scripts.
- Content gate: adult titles stay blurred and unusable until a code unlocks them; the unlock lives in memory for the run only.

## Review Focus

- A seek issued before video metadata loads: the player already holds `pendingSeek`; the skip-intro jump must go through it, not set `currentTime` blind.
- `duration` of `NaN` or `0` while a stream loads: `shouldOfferNext` and `shouldOfferIntro` must both return false (already unit-tested; the wiring must not bypass the guard).
- An adult item with no poster or a broken image: the blur card must still render and stay opaque.
- AniSkip unreachable: playback must start exactly as it does today, on the local window and local learning.
- First run on Windows with no `bash`: the runtime screen must say so plainly instead of failing the fallback silently.

---

### Task 1: Renderer API client methods

**Files:**
- Modify: `app/js/api.js`
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `request(method, payload)` in `app/js/api.js`.
- Produces: `api.skipTimes({ title, slug, ep })`, `api.saveIntro({ slug, mark })`, `api.gateStatus()`, `api.gateUnlock(code)`, `api.gateLock()`, `api.gateSetCode({ code, current })`, `api.gateClearCode()`, `api.runtimeStatus()`, `api.runtimeInstall()`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// The module reads window.nami.api.call. Stub it before importing.
const calls = [];
globalThis.window = {
  nami: { api: { call: async (method, payload) => { calls.push([method, payload]); return { ok: true, value: { method, payload } }; } } },
};

test('playback, gate and runtime methods reach the bridge', async () => {
  const { api } = await import('../app/js/api.js');
  await api.skipTimes({ title: 'Frieren', slug: 'frieren', ep: '1' });
  await api.saveIntro({ slug: 'frieren', mark: { start: 5, end: 90 } });
  await api.gateStatus();
  await api.gateUnlock('letmein7');
  await api.gateLock();
  await api.gateSetCode({ code: 'letmein7', current: '' });
  await api.gateClearCode();
  await api.runtimeStatus();
  await api.runtimeInstall();
  assert.deepEqual(calls.map(([m]) => m), [
    'skip.times', 'intro.save', 'gate.status', 'gate.unlock', 'gate.lock',
    'gate.setCode', 'gate.clearCode', 'runtime.status', 'runtime.install',
  ]);
  assert.deepEqual(calls[0][1], { title: 'Frieren', slug: 'frieren', ep: '1' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/api.test.js`
Expected: FAIL, `api.skipTimes is not a function`.

- [ ] **Step 3: Add the methods to the `api` object in `app/js/api.js`**

Mirror the existing one-line style, e.g. `skipTimes: (payload) => request('skip.times', payload)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/api.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/js/api.js test/api.test.js
git commit -m "feat: renderer client for skip, gate and runtime"
```

---

### Task 2: Gate view helper and card blur

**Files:**
- Create: `app/js/gate-view.js`
- Modify: `app/js/app.js` (bootstrap handling, card render)
- Test: `test/gate-view.test.js`

**Interfaces:**
- Produces: `isLocked(item, gateState)` returning boolean; `lockLabel(reason)` returning a short string.
- Consumes: bootstrap's `gate` shape `{ filter, hasCode, unlocked }`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('an adult item is locked unless the gate is open', async () => {
  const { isLocked } = await import('../app/js/gate-view.js');
  const adult = { adult: true, reason: 'genre: hentai' };
  const clean = { adult: false };
  assert.equal(isLocked(adult, { filter: true, unlocked: false }), true);
  assert.equal(isLocked(adult, { filter: true, unlocked: true }), false);
  assert.equal(isLocked(adult, { filter: false, unlocked: false }), false);
  assert.equal(isLocked(clean, { filter: true, unlocked: false }), false);
  assert.equal(isLocked(adult, null), true, 'no gate state means locked');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/gate-view.test.js`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `app/js/gate-view.js`**

Export `isLocked(item, gate)` = `Boolean(item?.adult) && gate?.filter !== false && gate?.unlocked !== true`. Export `lockLabel(reason)` returning `'21+'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/gate-view.test.js`
Expected: PASS.

- [ ] **Step 5: Use `isLocked` in `app/js/app.js`**

Store `gate` from bootstrap and from `gate.*` results. In the card renderer, when `isLocked(item, gate)`, add `card--locked`, replace the poster with a blurred placeholder, remove the click-to-open handler, and show the lock badge. Blocked clicks call `openUnlockDialog()`.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/js/gate-view.js app/js/app.js test/gate-view.test.js
git commit -m "feat: blur adult titles behind the code gate"
```

---

### Task 3: Unlock dialog and gate settings rows

**Files:**
- Modify: `app/js/app.js` (settings view, `#dialog-root`)
- Modify: `app/css/style.css`

**Interfaces:**
- Consumes: `api.gateUnlock/gateSetCode/gateClearCode/gateStatus`.
- Produces: `openUnlockDialog()`, settings rows "Adult titles" (filter toggle) and "Access code" (set/clear).

- [ ] **Step 1: Build the unlock dialog**

A glass dialog in `#dialog-root` with a code field and a submit button. Wrong code shows the bridge error inline. On success, store the returned gate state, re-render visible lists, close.

- [ ] **Step 2: Add the two settings rows**

"Adult titles" toggle writes `saveSettings({ adultFilter })`. "Access code" opens the dialog to set or clear; when a code exists show "Change code" and "Remove code".

- [ ] **Step 3: Verify by running the app**

Run the packaged app with `--remote-debugging-port=9223`, take a CDP screenshot of a search list containing an adult title, the locked card, and the unlock dialog.
Expected: adult cards blurred with a lock badge; the dialog opens; a wrong code shows an error; the right code unblurs.

- [ ] **Step 4: Commit**

```bash
git add app/js/app.js app/css/style.css
git commit -m "feat: unlock dialog and adult-title settings"
```

---

### Task 4: Skip-intro control in the player

**Files:**
- Modify: `app/js/player.js` (render, cache, bind, actions)
- Modify: `app/css/style.css`

**Interfaces:**
- Consumes: `shouldOfferSkipIntro`, `nextIntroEnd`, `learnIntroSkips` from `app/js/playback-rules.js`; `api.skipTimes`, `api.saveIntro`.
- Produces: a `[data-action="skip-intro"]` button; `this.introMark`; `this.skipWindow`.

- [ ] **Step 1: Load marks on open**

In `open()` (after `this.data` resolves), call `api.skipTimes({ title, slug, ep })`. Store `skip` and `learned`. The effective window is `skip.op` when present, else `introWindow(settings, learned)`. Failure is silent: keep the local window.

- [ ] **Step 2: Add the button and its visibility**

Render a `Skip intro` button over the stage. On `timeupdate`, set its visibility from `shouldOfferSkipIntro({ currentTime, duration, settings, learned, playing })` using the effective window. Clicking seeks through `pendingSeek` if metadata is not ready, otherwise `currentTime = nextIntroEnd(...)`, then `api.saveIntro({ slug, mark: learnIntroSkips({ skips: learned?.skips, at, settings, learned }) })`.

- [ ] **Step 3: Verify by running the app**

Play an episode, reach the intro, screenshot the button, click it, confirm the jump and that `intros.json` gained a mark.
Expected: button appears inside the window only; the jump lands at the mark; the mark persists.

- [ ] **Step 4: Commit**

```bash
git add app/js/player.js app/css/style.css
git commit -m "feat: skip-intro button backed by AniSkip and local learning"
```

---

### Task 5: Next-episode prompt on the outro

**Files:**
- Modify: `app/js/player.js`

**Interfaces:**
- Consumes: `shouldOfferNext` from `app/js/playback-rules.js`; the existing `upnext` block and `playNextEpisode`.

- [ ] **Step 1: Show the prompt at the outro**

On `timeupdate`, call `shouldOfferNext({ currentTime, duration, settings, playing })`; toggle the existing `upnext` element. `handleEnded` keeps its current behavior as the fallback. Respect `settings.outroSkip === false`.

- [ ] **Step 2: Verify by running the app**

Seek near the end of an episode, screenshot the upnext card, confirm it appears before the file ends and plays the next episode.
Expected: card appears within the outro window and hides if dismissed.

- [ ] **Step 3: Commit**

```bash
git add app/js/player.js
git commit -m "feat: next-episode prompt starts at the outro"
```

---

### Task 6: First-run runtime installer

**Files:**
- Modify: `app/js/app.js` (a first-run screen and a settings row)
- Modify: `electron/api.js` (nothing new; `runtime.install` already exists)
- Modify: `preload.js` if a push channel is needed

**Interfaces:**
- Consumes: `api.runtimeStatus()`, `api.runtimeInstall()`; the `nami:runtime` progress channel.
- Produces: `openSetup()` and a "Player tools" settings row showing `ani-cli` and `yt-dlp` state.

- [ ] **Step 1: Detect and install**

On bootstrap, if `runtime.ready` is false, show a glass setup card: what it downloads, a progress line from `nami:runtime`, and a Retry that calls `runtimeInstall`. On success, write `saveSettings({ runtimeInstalled: true })` and continue.

- [ ] **Step 2: Settings row**

Show the resolved paths and a "Reinstall" button. On Windows with `needsBash`, show the Git Bash message from `runtime.js`.

- [ ] **Step 3: Verify with a clean state dir**

Run with `NAMI_STATE_DIR=/tmp/opencode/nami-fresh` so `bin/` starts empty. Confirm the setup runs and both binaries land executable in `bin/`.
Expected: `ls -l /tmp/opencode/nami-fresh/bin` shows `ani-cli` and `yt-dlp`, both executable.

- [ ] **Step 4: Commit**

```bash
git add app/js/app.js app/css/style.css preload.js
git commit -m "feat: first-run auto-install of ani-cli and yt-dlp"
```

---

### Task 7: End-to-end check

**Files:** none.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all pass (28 plus the new tests).

- [ ] **Step 2: One capture pass**

Run the packaged app, and in one CDP session capture: a blurred adult card, the unlock dialog, the skip-intro button, the upnext card, and the setup card on a fresh state dir.
Expected: five screenshots on disk with the described content.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test: round 2 end-to-end pass"
```
