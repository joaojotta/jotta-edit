#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
for cmd in node npm; do command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }; done
node scripts/check-node-version.cjs
npm install --no-audit --no-fund
npm run check:web
npm test
npm run build:pwa
bash scripts/build-source.sh
printf '\nWeb/PWA files are ready in %s/web-dist/\n' "$PWD"
if command -v zip >/dev/null 2>&1; then
  mkdir -p release
  version="$(node -p 'require("./package.json").version')"
  archive="$PWD/release/Jotta-Edit-${version}-Web-PWA-DEPLOY.zip"
  rm -f "$archive"
  ( cd web-dist && zip -q -r "$archive" . )
  printf 'UPLOAD THIS DEPLOY ZIP, NOT THE SOURCE ZIP: %s\n' "$archive"
else
  printf 'To generate a one-click deployment ZIP, install the zip command.\n'
fi
printf 'Upload the CONTENTS of web-dist/ to the website (not web/ or src/).\n'
