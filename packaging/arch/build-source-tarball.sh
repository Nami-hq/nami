#!/usr/bin/env bash
# Pack the project source into packaging/arch/nami-<version>.tar.gz, the file
# PKGBUILD builds from. Run from anywhere; paths are resolved from this script.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
version="$(node -p "require('$root/package.json').version")"
out="$root/packaging/arch/nami-$version.tar.gz"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Archive outside the source tree, so the growing tarball is never read back.
tar czf "$work/nami-$version.tar.gz" -C "$(dirname "$root")" \
  --transform "s|^$(basename "$root")|nami-$version|" \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.taste-skill' \
  --exclude='*.log' \
  "$(basename "$root")"

mv "$work/nami-$version.tar.gz" "$out"
echo "wrote $out"
tar tzf "$out" | head -5 || true
