#!/usr/bin/env bash
# Build a Fedora-family RPM from the already-built Electron tree.
#
#   npm run pack:linux        # produces dist/linux-unpacked and the AppImage
#   packaging/rpm/build.sh    # produces dist/NAMI-<version>-x86_64.rpm
#
# electron-builder's own rpm target needs its bundled fpm, whose ruby links
# libcrypt.so.1. Fedora 44 ships libxcrypt (libcrypt.so.2) only, so that path
# fails. rpmbuild does the same job with what the system already has.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$(node -p "require('$root/package.json').version")"
arch="x86_64"
name="NAMI-$version-$arch"
unpacked="$root/dist/linux-unpacked"
topdir="${NAMI_RPM_TOPDIR:-/tmp/opencode/nami-rpmbuild}"

command -v rpmbuild >/dev/null || { echo "rpmbuild is not installed" >&2; exit 1; }
[ -x "$unpacked/nami" ] || { echo "run 'npm run pack:linux' first: $unpacked/nami is missing" >&2; exit 1; }

rm -rf "$topdir"
mkdir -p "$topdir"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

tar czf "$topdir/SOURCES/nami-$version-app.tar.gz" -C "$unpacked" .
install -m644 "$root/packaging/rpm/nami.desktop" "$topdir/SOURCES/nami.desktop"
install -m644 "$root/build/icon.png" "$topdir/SOURCES/nami.png"
sed "s/@VERSION@/$version/g" "$root/packaging/rpm/nami.spec.in" > "$topdir/SPECS/nami.spec"

rpmbuild --define "_topdir $topdir" -bb "$topdir/SPECS/nami.spec"

rpm_path="$(find "$topdir/RPMS" -name '*.rpm' | head -1)"
cp "$rpm_path" "$root/dist/$name.rpm"
echo "wrote $root/dist/$name.rpm"
