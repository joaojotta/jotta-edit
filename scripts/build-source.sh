#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
version="$(node -p 'require("./package.json").version')"
mkdir -p release
archive="$PWD/release/Jotta-Edit-${version}-Source.tar.gz"
# Explicit inputs keep editor workspaces, credentials, caches and binaries out.
tar -czf "$archive" \
  LICENSE THIRD-PARTY-NOTICES.md licenses README.md CHANGELOG.md VERSION_HISTORY.md \
  package.json package-lock.json index.html vite.config.mjs vite.web.config.mjs \
  src electron shared web public assets scripts tests docs .npmrc .gitignore
printf 'Source and build scripts: %s\n' "$archive"
