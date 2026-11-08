# NAMI — progress

## Goal
Ship three things for NAMI (the desktop GUI over `ani-cli`): real downloadable
packages for Windows/Fedora/Arch, a professional landing page in `site/`, and a
trailer video. Acceptance: every download link on the page resolves to a file
that exists and, for Linux, one that runs on this machine; the page passes the
design-taste-frontend gate.

## Done
- Desktop app: glass UI, dark + light themes persisted through settings, player
  glass controls, `nami://` protocol for stream/image proxying, no local server.
- `npm test` → 12/12 (media URL builders + playlist rewriting).
- Theme persistence verified live: pick dark/light/system → live + stored +
  after-restart match, no console errors.
- `DESIGN.md` written (token system, both palettes, always-dark player).
- Packaging, all built on this host:
  - `dist/NAMI-0.1.0-x86_64.AppImage` (120.1 MiB) — booted.
  - `dist/NAMI-0.1.0-x86_64.rpm` (93.5 MiB) — extracted, payload booted.
  - `dist/NAMI-0.1.0-setup.exe` (115.9 MiB) — NSIS built without Wine; not run
    on Windows.
  - `packaging/arch/PKGBUILD` + `nami-0.1.0.tar.gz` — `bash -n` clean; not built
    (`makepkg` absent on this Fedora host).
- Landing page `site/index.html` written end to end (nav-centre, hero, 2×2
  features, download + player mock + 5 per-platform rows, questions, footer).
  Phone rhythm 390 = 8 screens; phone trims applied.
- Landing page gate (`gate.mjs --quick`, 1440 + 390): **1 FAIL** — `tilt` on the
  hero window, which the brief asked for — and 15 WARNs. All `section-height`,
  `section-gaps`, `dark-ground` FAILs are cleared and probe-verified.
- `nami/` is a git repo on `main`; commit `d13b03b` holds app + packaging + page.

## Next
1. Trailer video for NAMI. Not started.
2. User decisions: repo owner/name slug, go-ahead to push, and how to close the
   page's build in the gate (`--done` with their words, or drop the 3D tilt).
   Real download URLs, the PKGBUILD `source` and the Windows CI need the push.

## Open questions
- Publish to a public GitHub repo? `nami-inc/nami` is what the files say today;
  the user said "Nami.co or inc or smt like that" — the exact slug is unconfirmed
  and the org does not exist yet.
- `site/assets/` carries the taste-skill's whole library (39 MiB); the page
  references ~23 files. Publishing redistributes third-party code and dead
  weight. Not resolved.
- Android: needs a separate mobile project. The page says "Not yet".

## Key facts
- Measured page FAILs that remain: `tilt` at 1440 only (accepted: the brief asked
  for a tilting 3D hero window). `scroll-reveal` FAILs appear only in a non-quick
  gate round; `--quick` skips motion checks. Both are user-accepted.
- Remaining WARNs (15), by check: `nav-labels` ~8, `no-visual` 2,
  `text-contrast` 2, `section-gaps` 1, `copy-length` 1, `action-repeat` 1,
  `cta` 1, `visual-caption` 1.
- `#features` at 1440 sits exactly at its T-fit limit (content bottom =
  section bottom − padb), so adding any content to it breaks `section-height`.
- CSS rule that matters: the checker's first-screen-group budget applies only to
  `.g2` sections (`isG2` in consistency.mjs ~2342).
- Ground tokens: `--ground-bg: #93c2ee` etc. (index.html ~40 and ~54). Do not go
  lighter than `#a0cef2` — OKLab chroma crosses 0.07 and `paletteKind` flips to
  `light`, which breaks `dark-ground`.
- Design-skill scripts need
  `CHROME_PATH=~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
  one headless Chrome at a time. Gate: `.taste-skill/build.json` is armed.
- Probes (in `/tmp/opencode`): `measure.mjs` (CDP + `--probe`), `probe-checker.js`
  (per-section g1/g2 boxes), `extent.js` (content extents + gaps),
  `grounds.mjs` (dark-ground ratios), `shot-section.mjs` (section screenshot).
- `appimagetool` and `makepkg` are absent here; `rpmbuild`, `fakeroot`, `ar`,
  `inkscape`, `7z` are present. Host: Nobara 44 (Fedora-family), x86_64.
- Runtime deps not bundled: `ani-cli` (`server/scrape.js:367`) and `yt-dlp`.
