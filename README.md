# NAMI

A glass anime player for [ani-cli](https://github.com/pystardust/ani-cli). NAMI browses, searches and plays
anime through the ani-cli already on your machine, in a desktop window instead of a terminal.

Episode lists, subtitles and a player styled after iOS 26 Liquid Glass, in a light and a dark theme you
switch in settings.

## What it needs

NAMI drives ani-cli and yt-dlp; it does not bundle them. Install both and put them on your `PATH`:

- [ani-cli](https://github.com/pystardust/ani-cli)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)

On Linux the AppImage also needs the usual Chromium runtime libraries (`gtk3`, `nss`, `alsa-lib`,
`libnotify`, `xdg-utils`, `at-spi2-core`).

## Download

Grab the files from the [latest release](https://github.com/nami-hq/nami/releases/latest), or read the
[landing page](https://nami-hq.github.io/nami/).

| Platform | Artifact |
| --- | --- |
| Windows 10/11 (64-bit) | `NAMI-0.1.0-setup.exe` |
| Any Linux | `NAMI-0.1.0-x86_64.AppImage` (make it executable and run) |
| Fedora | `NAMI-0.1.0-x86_64.rpm` (install with `dnf`) |
| Arch | `PKGBUILD` + `nami-0.1.0.tar.gz` (build with `makepkg`) |

There is no Android build. NAMI is a desktop player, and ani-cli does not run on a phone as it is.

## Development

```bash
npm install
npm start        # run the app
npm test         # node --test
```

## Packaging

```bash
npm run pack:linux   # AppImage in dist/
npm run pack:rpm     # Fedora RPM in dist/ (needs rpmbuild)
npm run pack:win     # NSIS installer in dist/ (best run on Windows)
bash packaging/arch/build-source-tarball.sh   # Arch source tarball
```

Tagging a release (`git tag v0.1.0 && git push origin v0.1.0`) runs
`.github/workflows/release.yml`, which builds the Windows and Linux artifacts
and attaches them to the GitHub Release.

## Licence

MIT. See `LICENSE`.

NAMI hosts nothing: video comes from ani-cli, and poster art is fetched from the source site.
