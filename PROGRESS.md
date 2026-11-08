# NAMI — progress

## Goal
Ship three things for NAMI (the desktop GUI over `ani-cli`): real downloadable
packages for Windows/Fedora/Arch, a professional landing page in `site/`, and a
trailer video. Acceptance: the page is live, every download link on it resolves
to a file that exists, and for Linux one that runs on this machine.

## Done
- Desktop app: glass UI, dark + light themes persisted through settings, player
  glass controls, `nami://` protocol for stream/image proxying, no local server.
- `npm test` → 12/12 (media URL builders + playlist rewriting).
- Theme persistence verified live: pick dark/light/system → live + stored +
  after-restart match, no console errors.
- `DESIGN.md` written (token system, both palettes, always-dark player).
- Packaging, all built on this host:
  - `NAMI-0.1.0-x86_64.AppImage` (120.1 MiB) — booted.
  - `NAMI-0.1.0-x86_64.rpm` (93.5 MiB) — extracted, payload booted.
  - `NAMI-0.1.0-setup.exe` (115.9 MiB) — NSIS built without Wine; not run on
    Windows.
  - `packaging/arch/PKGBUILD` + source tarball — `bash -n` clean; not built
    (`makepkg` is not on this host).
- Landing page `site/index.html`: nav-centre, hero, 2×2 features, download with
  the player mock and 5 per-platform rows, questions, footer.
- Landing page gate (`gate.mjs --quick`, 1440 + 390): **1 FAIL** — `tilt` on the
  hero window, which the brief asked for — and 15 WARNs. All `section-height`,
  `section-gaps`, `dark-ground` FAILs are cleared and probe-verified.
- `site/assets` pruned 38 MiB → 916 KiB (the 30 files Chrome actually loads).
  Full-page 390px shot is pixel-identical before and after (`compare -metric AE`
  = `0 (0)`).
- Published to **https://github.com/nami-hq/nami** (org created by the user;
  the repo was first made under `qusai64574-gif` and transferred, so the old
  URLs 200-redirect).
- Release **v0.1.0** carries 5 assets. All five URLs under
  `https://github.com/nami-hq/nami/releases/download/v0.1.0/` return 200:
  `NAMI-0.1.0-setup.exe`, `NAMI-0.1.0-x86_64.AppImage`,
  `NAMI-0.1.0-x86_64.rpm`, `PKGBUILD`, `nami-0.1.0.tar.gz`.
- Arch source tarball is reproducible (`--sort=name --mtime --owner=0
  --numeric-owner | gzip -9n`), so a CI rebuild gives the same sha256 the
  PKGBUILD records. Verified: the asset hashes to
  `0b9b8e68bf09ce8872c09d1d74decd54981b6bc5a5afab0f3ad5ac9fad1a8538`, the same
  value in the uploaded PKGBUILD.
- Landing page live at **https://nami-hq.github.io/nami/** via
  `.github/workflows/pages.yml`; the served HTML carries all 5 release links.
- Design gate closed on the owner's word "Do whatever is better"
  (`GATE: DONE`), so the 3D tilt and scroll reveals stay on the page.
- Trailer built at `trailer/`: 57 s, 1920×1080, 30 fps, one continuous camera
  ("A night in one take", `trailer/STORYLINES.md`). Cut to the owner's track
  `trailer/assets/audio/bed.mp3` (60.1 s, kept as supplied), used as
  `bed-film.mp3` (57 s, 1.6 s tail fade); hits at 16.0, 20.0, 24.0, 26.5, 32.0,
  36.0, 40.0, 43.5, 47.5, 50.0, 51.5 are 0 ms `tl.set`s. Kinetic type carries
  "THE ANI-CLI GUI?" (16 s), "ani-cli, in a real window." (40 s) and "no browser.
  no localhost. no server." (43.5 s). `npx hyperframes check`: 0 errors; 7
  accepted structural warnings, argued in `trailer/REVIEW.md`.
- Real material in the trailer: `assets/ui/*.webp` (2640×1720 renderer captures),
  `assets/ui/player-hd.mp4` (1526×994 @ 15 fps, recorded at the window's own
  size, so the payoff is never upscaled), `assets/anicli.out`, `assets/icon.png`.

## Next
1. Trailer render + `ffprobe` verification (57.0 s, 1920×1080, 30 fps, audio
   stream), then a frame look at 16.3 / 24.5 / 33 / 41 / 48 / 52 s.
2. Commit `trailer/` and push to `main`. Do not push a tag casually:
   `release.yml` would rebuild and replace the release assets.

## Open questions
- `site/assets` still carries files from the design-taste-frontend skill and the
  app fonts (Geist, Instrument Serif) in a public repo; licensing unconfirmed.

## Key facts
- Remaining page WARNs (15), by check: `nav-labels` ~8, `no-visual` 2,
  `text-contrast` 2, `section-gaps` 1, `copy-length` 1, `action-repeat` 1,
  `cta` 1, `visual-caption` 1. `#features` at 1440 sits exactly at its T-fit
  limit, so adding content there breaks `section-height`.
- `gate.mjs --quick` skips motion checks; `scroll-reveal` FAILs appear only in a
  full round, and with `tilt` there are more than `MAX_WAIVERS = 5`, so
  `--done` is the only way to keep both.
- Ground tokens: `--ground-bg: #93c2ee` etc. (`site/index.html` ~40 and ~54).
  Never lighter than `#a0cef2` — OKLab chroma crosses 0.07 and `paletteKind`
  flips, which breaks `dark-ground`.
- Design-skill scripts need
  `CHROME_PATH=~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`; one
  headless Chrome at a time.
- Probes in `/tmp/opencode`: `measure.mjs`, `probe-checker.js`, `extent.js`,
  `grounds.mjs`, `shot-section.mjs`, `assets-used.mjs`, `cap-app.mjs`,
  `run-app.sh`.
- Push and release both work as `qusai64574-gif` (the org owner) with scopes
  `gist`, `read:org`, `repo`, `workflow`. No API can create an org; that is a
  browser step.
- Host: Nobara 44 (Fedora family), x86_64, Wayland with `DISPLAY=:0`.
  `appimagetool` and `makepkg` are absent; `rpmbuild`, `fakeroot`, `ar`,
  `ffmpeg`, `gh` are present. Trailer runs `hyperframes@0.9.22` through `npx`.
- `/tmp` is a 1.8 GB tmpfs, so renders there fail with "Low disk space". Run
  them with `TMPDIR=/home/qusai13q/.cache/hf-tmp`.
- Runtime deps not bundled: `ani-cli` (`server/scrape.js:367`) and `yt-dlp`.
