# NAMI — progress

## Goal
Ship three things for NAMI (the desktop GUI over `ani-cli`): real downloadable
packages for Fedora/Arch/Windows, a professional landing page in `site/`, and a
trailer video. Acceptance: every download link on the page resolves to a file
that exists and, for Linux, one that runs on this machine.

## Done
- Desktop app: glass UI, dark + light themes persisted through settings, player
  glass controls, `nami://` protocol for stream/image proxying.
- `npm test` → 12/12 (media URL builders + playlist rewriting).
- Theme persistence verified live: `pick dark/light/system` → live + stored +
  after-restart match, no console errors.
- `DESIGN.md` written (token system, both palettes, always-dark player).
- Packaging: `electron-builder` 26.18.0 added. `npm run pack:linux` builds
  `dist/NAMI-0.1.0-x86_64.AppImage` (126 MB). Ran it: the real UI booted at
  `nami://app/index.html`, 16 trending cards, no console errors.
- `npm run pack:rpm` (`packaging/rpm/build.sh`, rpmbuild + `packaging/rpm/nami.spec.in`)
  builds `dist/NAMI-0.1.0-x86_64.rpm` (98 MB). Extracted the payload with
  `rpm2cpio | cpio` and ran `opt/nami/nami`: UI booted, 16 cards, theme dark,
  no console errors. `rpm -qip` reports name/version/license/description.
- `npm run pack:win` builds `dist/NAMI-0.1.0-setup.exe` (122 MB) on this Linux
  host with no Wine. `7z l` shows a NSIS-3 Unicode installer holding
  `$PLUGINSDIR/app-64.7z`, which holds `NAMI.exe` (250 MB) and
  `resources/app.asar` (999111 bytes, the same asar the Linux build ships).
  It has not been run on Windows.
- Arch: `packaging/arch/PKGBUILD` + `build-source-tarball.sh` (writes
  `nami-0.1.0.tar.gz`). Both pass `bash -n`. Not built: `makepkg` is not on this
  Fedora host.

## Next
1. Packaging: install `electron-builder`, add build config, produce a Linux
   AppImage and RPM, run the AppImage to prove it launches.
2. Windows: NSIS build on this machine if Wine works; otherwise a GitHub Actions
   workflow. Do not claim a Windows file that does not exist.
3. Landing page in `nami/site/` via the design-taste-frontend skill; downloads
   section lists only artifacts that exist.
4. Trailer video.

## Open questions
- Publish to a public GitHub repo? Needs the user's OK; `nami/` is not a git repo.
- Android: needs a separate mobile project. Not shipped as a fake download.

## Key facts
- `chrome` is not in PATH. Design-skill scripts need `CHROME_PATH`:
  `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.
- `rpmbuild`, `fakeroot`, `ar` present. `appimagetool` absent (electron-builder
  fetches its own).
- Host: Nobara 44 (Fedora-family), x86_64, nn.
