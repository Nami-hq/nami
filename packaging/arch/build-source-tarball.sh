#!/usr/bin/env bash
# Pack the project source into packaging/arch/nami-<version>.tar.gz, the file
# PKGBUILD builds from. Run from anywhere; paths are resolved from this script.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$(node -p "require('$root/package.json').version")"
out="$root/packaging/arch/nami-$version.tar.gz"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Archive outside the source tree, and never read the tarball this script writes
# back in: the output lives in the source tree, so tar would grow it on every run.
tar czf "$work/nami-$version.tar.gz" -C "$(dirname "$root")" \
  --transform "s|^$(basename "$root")|nami-$version|" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='.taste-skill' \
  --exclude='.shots' \
  --exclude="nami-$version.tar.gz" \
  --exclude='PKGBUILD' \
  --exclude='*.log' \
  "$(basename "$root")"

mv "$work/nami-$version.tar.gz" "$out"
echo "wrote $out"
tar tzf "$out" | head -5 || true
