#!/usr/bin/env bash
# Pack the project source into packaging/arch/nami-<version>.tar.gz, the file
# PKGBUILD builds from. Run from anywhere; paths are resolved from this script.
#
# The archive is reproducible: member order and timestamps are fixed and no
# owner ids are stored, so the same tree always gives the same sha256. The
# PKGBUILD records that hash, and the release workflow rebuilds the same bytes,
# so the two never drift apart.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$(node -p "require('$root/package.json').version")"
out="$root/packaging/arch/nami-$version.tar.gz"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Archive outside the source tree, and never read the tarball this script writes
# back in: the output lives in the source tree, so tar would grow it on every run.
# gzip -n leaves the filename and mtime out of the gzip header too.
tar cf - -C "$(dirname "$root")" \
  --transform "s|^$(basename "$root")|nami-$version|" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='.taste-skill' \
  --exclude='.shots' \
  --exclude="nami-$version.tar.gz" \
  --exclude='PKGBUILD' \
  --exclude='*.md' \
  --exclude='*.log' \
  --sort=name \
  --mtime='UTC 2020-01-01' \
  --owner=0 --group=0 --numeric-owner \
  "$(basename "$root")" | gzip -9n > "$work/nami-$version.tar.gz"

mv "$work/nami-$version.tar.gz" "$out"
echo "wrote $out ($(sha256sum "$out" | cut -d' ' -f1))"
tar tzf "$out" | head -5 || true
