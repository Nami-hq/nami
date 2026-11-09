# NAMI — liquid glass everywhere, mini HUD, and a social layer

Design doc. Owner: the NAMI owner. Written 2026-11-09.

This is the plan for the round that turns NAMI from a glass anime player into a
player someone keeps open on their desktop all day: better glass and motion,
a floating mini player, blocks and playlists, and friends with DMs,
watch-together and a sticker/GIF library.

Round 2 (skip intro, next-episode-on-outro, auto-install runtime, macOS,
Termux, a new trailer) is already in flight. This doc builds on it and does not
replace it. Steps 1 to 3 of round 2 ship first, then the jobs below.

---

## 1. Where the app is today

- Electron. `main.js` owns one `BrowserWindow`. `preload.js` exposes a small
  bridge (`nami:api`, window controls).
- The UI is `app/index.html` plus `app/js/{app,player,ui,api}.js` and one big
  `app/css/style.css`. A single glass token block lives in `:root` and
  `[data-theme="dark"]`.
- The player is a full-screen overlay (`#player-root`) with an HLS.js video and
  Electron's native picture-in-picture button.
- The backend is absent by design: `server/scrape.js` resolves streams directly,
  and `ani-cli` plus `yt-dlp` are a fallback. No accounts, no network service.
- Settings and history persist to JSON under the app state directory
  (`server/store.js`).

The two facts that shape everything below:

1. A mini player that floats above other windows and moves must be its own
   `BrowserWindow` (`frame:false`, `alwaysOnTop`). It cannot be a DOM element in
   the main window.
2. One `<video>` element cannot render in two windows at once. Exactly one
   surface owns playback at a time; switching surfaces rebuilds the HLS player
   at the same position. This is fast because the app's own protocol handler
   already proxies and can cache segments.

---

## 2. Goals

- Real liquid glass motion across the whole app: player, tabs, dialogs,
  popovers, cards, the mini HUD.
- Two interaction forms: quick inline changes ("tap") and anchored glass
  popovers that animate open from the thing you clicked.
- A floating mini player: own look, movable anywhere, always on top, collapse to
  a live glass pill that pauses playback, reopen and resume.
- Full theming by the owner. Everything is editable except the app name, the
  logo, and the position of things.
- Block titles. Import a playlist of titles.
- Accounts (optional), friends, presence, DMs, send-an-anime cards, a
  sticker/GIF library, and watch-together with a host and many viewers.
- A trailer and a landing page that show all of it.

## 3. Non-goals

- No downloads, no offline library.
- No iOS/Android native build. Android stays Termux.
- No DRM. Crunchyroll streams cannot be played; only title lists can be imported.
- No always-on background service when the app is closed.

## 4. Anti-goals

- The app must stay fully usable offline and signed-out. An account adds
  features; it never gates the player, search, history or settings.
- Glass must stay readable. No low-contrast gray-on-gray, no blur on text.
- No animation on keyboard-driven or high-frequency actions. Motion is for
  things you point at, not for every state change.

## 5. Constraints

- Free hosting only: no card, no ID. The owner creates the Supabase project;
  the agent writes the code.
- The repo is public. Only the Supabase URL and the public anon key are baked
  in. Row Level Security is the security boundary. The service key never ships.
- Desktop only. macOS, Windows, Linux; Termux for Android.
- The 21+ gate stays. Adult titles are blurred until the code unlocks them. The
  owner accepts that DMs and stickers are adult-permitted; moderation is the
  owner's call.

---

## 6. Approaches considered and chosen

Recorded from the conversation. These are decided.

**Social backbone: central server on Supabase.** Chosen over peer-to-peer
WebRTC and over room-code-only. Supabase gives auth, a Postgres database,
realtime channels with presence, and file storage in one free signup. It covers
friends, DMs, presence, watch-together and sticker storage with the least
custom code. Cost: the owner operates a backend and owns a privacy policy and
moderation. Accepted with "idc about 21+ for dms".

**Mini player: a second frameless BrowserWindow.** Chosen over shrinking the
main window and over a DOM overlay. Only a real window can sit above other
windows and float free of the app. Accepted cost: playback must move between
windows rather than mirror.

**Sticker/GIF source: bundled pack plus Tenor search.** Tenor has a free key
with no card. Hosted search results sit behind the same adult gate as titles.

---

## 7. Job 1 — Design system and motion

Purpose: one motion language and one token set that every surface follows.

Tokens (extend the existing `:root` block, keep the light and dark worlds):

- `--glass-fill`, `--glass-blur`, `--glass-border`, `--glass-inner`,
  `--glass-shadow`: already present. Add `--glass-tint` (the owner's colour
  wash) and `--glass-spec` (the moving specular highlight).
- Motion: `--dur-1..4` (120/200/320/520 ms), `--ease-out`, `--ease-spring`,
  `--ease-liquid`. `--motion-scale` (0 to 2) multiplies all durations and is
  set to 0 under `prefers-reduced-motion`.
- Shape: `--radius-s/m/l/xl` exist. Add `--radius-pill`.

Two interaction forms, one rule:

- **Tap (inline).** For a boolean or a small value in place: toggles, the theme
  switch, mute, a like. The control animates itself (knob, fill, tick). No new
  surface appears.
- **Popover (anchored).** For a picker or a panel: quality, episode list, share,
  sticker picker, account menu, filters. A glass panel animates out of the
  element you clicked: it starts at that element's box and `transform-origin`,
  scales and un-blurs into place, and reverses to close. Escape and an outside
  click close it. Only one is open at a time.

Glass motion vocabulary (used everywhere, named once):

- **Specular sweep**: a soft highlight travels across a surface on hover and on
  open.
- **Refraction edge**: a 1px inner rim that brightens on the side facing the
  pointer.
- **Liquid lift**: scale 1 to 1.02 with a spring and a small shadow growth.
- **Morph open**: the popover's own start box to its end box, radius
  interpolated.
- **Ripple-in**: a single expanding ring on click, capped, never looping.

Implementation: a new `app/js/motion.js` with a small helper
(`morph(anchorEl, panelEl)`, `lift(el)`, `sweep(el)`) so every call site is the
same three calls, plus CSS for the glass layers. No animation library; CSS
transitions and the Web Animations API only.

Theme editor (in-app, layout fixed). A new "Appearance" screen where the owner
changes, live and saved to the state dir:

- accent colour, and the light and dark canvas colours
- glass blur, tint and strength
- corner radius (one control, mapped to the radius scale)
- motion speed (multiplies `--motion-scale`, with a preview)
- density (spacing scale) and base font size
- background art: none, a solid tint, an image the owner picks, or the current
  title's poster as a blurred field
- avatar frame and card shape

Fixed and not editable: the app name, the logo, and element positions. The
editor is itself a glass surface and follows the motion rules. It ships with a
reset to default and an export/import of the theme as JSON.

Acceptance: the player, every dialog, every popover, the rail and the settings
screen use these tokens and helpers; a capture at 1440px shows the glass and
shows no surface without its entrance animation; reduced-motion disables all of
it; every control in the theme editor changes the app live and survives a
restart.

## 8. Job 2 — Mini HUD

A second window, `app/hud.html` plus `app/js/hud.js`.

Window: `frame:false`, `transparent:true`, `alwaysOnTop:true` with level
`floating`, `hasShadow:false`, resizable, min 320×180, default 480×270,
remembered position. Dragging uses `-webkit-app-region: drag` on the glass
chrome; buttons opt out.

States:

- **Playing**: video, title, a compact scrub, play/pause, next, and a "who's
  watching" avatar row when in a room.
- **Collapsed (pill)**: an animated liquid-glass pill ~64×28, still always on
  top, that reads "NAMI" plus a live pulse while a title is paused. Playback is
  paused when collapsing and the position is kept. Clicking expands back and
  fluidly unpauses.
- **Room**: the pill and the full HUD both show viewer avatars; a join/leave
  animates them in and out.

Playback handoff: the surface that owns the `<video>` is either the main player
or the HUD, never both. Enabling the HUD moves ownership: the main player saves
its position, tears down its HLS instance, and shows a "playing in the mini
player" card. Disabling reverses it. On a handoff the app re-requests the
stream. Today the proxy only sets `cache-control` and writes no segments, so
job 2 also adds a real on-disk segment cache (see section 16) that both windows
share, or a handoff re-buffers and misses its acceptance.

Acceptance: enabling the HUD floats above other windows; collapsing pauses and
the pill stays on top; reopening resumes at the same second (±1 s); the pill and
HUD both animate; the position survives app restart.

## 9. Job 3 — Content: block and import

- **Block titles.** A local `blocks` set in `server/store.js` plus a row in
  Supabase for blocked users later. Blocked titles vanish from search, trending
  and history. A blocked card is not rendered at all. Settings lists them.
- **Playlist import.** Import a list of titles from MyAnimeList or AniList
  (public list URL or username), or paste titles. Each is resolved to the
  site's slug through the existing search, and stored as a local library view.
  A resolved library entry plays like any other. The import is local; it does
  not sync.

Acceptance: blocking removes a title from every list and survives restart;
importing a public list resolves to playable titles, and unresolved ones are
shown as such with the reason.

## 10. Job 4 — Social (Supabase)

### 10.1 Accounts

Supabase auth. Two sign-in paths: GitHub OAuth (no email confirm, lowest
friction) and email plus password. Optional entirely: the app is fully usable
signed out, and the account UI is one screen reachable from the rail.

Identity is a `profiles` row: id, username (unique), display name, avatar,
banner, bio, created_at (the "joined NAMI" date). The avatar is any of: a
bundled preset, an uploaded image, or a GIF. The banner is an uploaded image or
a GIF. A friendship carries the date it was accepted, so the profile shows
"friends since".

No card and no ID are involved. The owner creates the Supabase project once and
pastes the URL and anon key.

### 10.2 Data model

Tables, all with RLS on:

- `profiles` — id, username, display_name, avatar, created_at.
- `friendships` — requester, addressee, state (pending/accepted/blocked).
- `blocks` — blocker, blocked.
- `dm_threads` — id, a, b, created_at, last_message_at.
- `dm_messages` — id, thread, sender, kind (text/anime/sticker/gif), body,
  ref (jsonb: slug, title, poster, ep, mode), created_at.
- `room_state` — id, host, title_ref (jsonb), episode, mode, position,
  playing, rate, updated_at.
- `room_members` — room, user, joined_at.
- `stickers` — id, owner (null = bundled), storage_path, tags.

RLS summary: a DM thread is readable only by its two members; messages are
insertable only by a member; a profile is readable by anyone signed in; a room
is readable by members; only the host writes `room_state` except for a granted
co-host.

### 10.3 Presence and DMs

Realtime presence on a per-user channel drives online state and "watching now".
DMs are Postgres rows with a Realtime subscription per thread, so a message
appears without polling. Message kinds: text, an anime card (poster, title,
episode, a deep link that opens that title), a sticker, and a GIF.

Anyone can send a friend request or a DM request. Each account has a setting in
its own account screen: who may message me (everyone, friends only, nobody), and
a list of incoming requests you can accept, decline or block. Declining closes
the request.

### 10.4 Watch together

A room is one `room_state` row. The host's client broadcasts
`{position, playing, rate, episodeRef}` on the room channel at about 1 Hz and on
every control change. Viewers apply the state with drift correction: if their
position is off by more than 250 ms they seek; below that they adjust playback
rate by ±2% and settle. A viewer can request control; the host grants it and the
requestor becomes the writer of `room_state`.

Limit stated plainly in the UI: every viewer resolves the episode on their own
machine through their own ani-cli/site path. The room shares the title,
episode, mode and timestamps, never the stream. If a title is unavailable to a
viewer, they see an unavailable card while the rest keep watching.

The player chrome shows "who is watching": an avatar row plus a count, live from
presence, animating in and out. Rooms hold more than two; there is no cap below
what Realtime allows.

A room opens by inviting friends, and also carries a join code and a shareable
link so anyone with it can join. The host is the writer of `room_state` unless a
viewer is granted control.

### 10.5 Sticker and GIF library

Bundled pack shipped in the repo under `app/stickers/`. User stickers upload to
Supabase Storage and appear in the sender's picker. GIF search uses Tenor with
the owner's free key, behind the adult gate. Picker is an anchored popover per
Job 1.

### 10.6 Profiles

Clicking an avatar anywhere (friends list, a DM header, the player's "who is
watching" row, a shared anime card) opens that person's profile as a glass
surface with the morph animation from Job 1. It shows the avatar, banner, bio,
joined date, friends-since date when you are friends, their public library and
favourite titles, and the actions that fit: add friend, message, join their room,
block.

Your own profile is customisable, and the customisation is a set of effects that
reuse the Job 1 tokens and motion:

- an animated avatar ring (several styles: liquid sweep, aurora, pulse, orbit)
- an avatar frame and a card shape
- a profile banner (image or GIF) with an optional parallax on the pointer
- an accent and glow effect on the profile surface
- a short bio, links, and pinned favourite titles

Effects are picked from the Appearances screen, render live, and persist with
the theme. All effects respect reduced motion and collapse to a still state.

Acceptance: opening a friend's profile shows their real details and the correct
actions; your ring and effects change live, survive a restart, and are visible
to the other person when they open your profile.

Acceptance: two signed-in accounts on one machine (or two) can friend, DM text,
send an anime card that opens the title, send a sticker and a GIF, and start a
room where the host's pause/seek moves both players within the drift budget; a
third viewer joins and appears in the avatar row.

## 11. Job 5 — Trailer and landing page

- Rebuild the trailer (already planned at 1920×1080 to the owner's audio) to show
  the mini HUD, the liquid glass popovers, DMs, a watch-together room, and the
  sticker picker, plus macOS and Termux.
- Landing page: a social features section, a macOS section like the other
  platforms, a Termux row, and auto-install copy. No manual ani-cli steps.

Acceptance: `hyperframes check` reports zero errors; the render is verified with
`ffprobe` and still frames; every new link on the page returns 200.

---

## 12. Order

1. Job 1 motion and tokens (local, ships alone).
2. Job 2 mini HUD (local).
3. Job 3 block and import (local).
4. Job 4 social (needs the Supabase project from the owner).
5. Job 5 trailer and page last, so it shows the real controls and screens.

Jobs 1 to 3 need nothing from the owner but review. Job 4 starts when the owner
pastes the project URL and anon key.

## 13. Decisions from the owner

Settled:

- Theming is an in-app editor. Layout, app name and logo stay fixed.
- Sign-in is email and password. No OAuth redirect.
- Anyone can send a friend request or a DM request; each account can restrict
  who may message it and can decline or block requests.
- Profiles carry an avatar (preset, upload or GIF), a banner, a bio, a joined
  date, and a "friends since" date.
- Profiles are openable from any avatar, and your own is customisable with
  animated avatar rings, frames, banner parallax and glow effects.
- Rooms open by invite and by join code or link.

Still open:

- Bundled sticker pack: the owner's own style, or a plain set to start? Default:
  ship a plain set now, restyle later.
- Tenor: the owner's free key, or a shared read-only one if Tenor allows.
  Default: the owner's key, entered in settings.

## 14. Risks

- Supabase free tier pauses a project after about a week idle; the first connect
  then takes a few seconds. Accepted.
- Realtime drift correction is the hardest part; it gets a focused test and a
  real two-machine check.
- Moderation of DMs and uploaded stickers is the owner's responsibility.
- Playback handoff between windows must not lose position; it gets a test and a
  manual check.

## 15. What is left to the builder

- Exact table columns and RLS policies written as SQL, reviewed for the "only
  the two members" rule.
- The motion helper's real API and the popover placement math.
- Drift-correction parameters.

## 16. Calls made by the builder after review

These were open questions after the first draft. Decisions, with reasons, so a
planner is not guessing.

1. **All social network stays in the main process.** The renderer is locked down:
   `contextIsolation` and `sandbox` are on, and the CSP in `electron/protocol.js`
   allows `connect-src 'self' nami:` and `img-src 'self' data: blob: nami:`.
   Supabase REST, the Realtime socket, Tenor and remote images would all be
   blocked from the renderer, and there are no runtime dependencies to vendor.
   So the main process holds the Supabase client (its Node has global `fetch`
   and `WebSocket`), adds IPC methods to `electron/api.js`, adds proxy routes
   and image paths to `protocol.js`, and pushes realtime events to the windows
   over a channel. The renderer stays network-free and the CSP is not widened.
   RLS still protects the data; the anon key is the only secret that ships.
2. **Social state lives in the main process, so the HUD handoff is free.**
   Because of call 1, presence, DM subscriptions and the room's 1 Hz broadcast
   are owned by the main process, not by a window. When playback moves to the
   HUD, social state does not move or restart. Both windows render from the same
   pushed state.
3. **Anime-card links are in-app, not OS-level.** The app already owns `nami://`
   as its internal origin and locks navigation to it. A card opens the detail
   view inside NAMI. No `setAsDefaultProtocolClient`, no collision with
   `nami://app`.
4. **Auth avoids a redirect by default.** Email and password first, so there is
   no OAuth callback to host. If the owner wants GitHub, it uses a loopback
   `http://127.0.0.1:<port>` listener with PKCE and one redirect URL added in the
   Supabase dashboard; that is owner setup, not code.
5. **Sessions go in the OS keychain** through Electron `safeStorage`, not
   plaintext JSON like the rest of the state, because tokens are long-lived and
   the repo is public.
6. **Job 2 adds a real on-disk segment cache.** `protocol.js` writes proxied
   stream segments to a bounded LRU directory under the state dir, shared by
   both windows. Without it the handoff's ±1 s acceptance depends on Chromium's
   cap-sized HTTP cache and will re-buffer. The cache has a size limit and an
   eviction policy.
7. **Playlist import uses AniList GraphQL** (clean JSON, one POST) in the main
   process, plus a paste-a-list fallback. No HTML scraping, no third-party proxy
   API. MAL support can reuse the same shape later.
