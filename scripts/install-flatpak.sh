#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
version="$(node -p 'require("./package.json").version')"
bundle="release/Jotta-Edit-${version}-linux-x64.flatpak"
[[ -f "$bundle" ]] || { echo "Bundle missing: $bundle. First run ./scripts/build-flatpak.sh" >&2; exit 1; }
flatpak install --user --reinstall "$bundle"
echo 'Refreshing KDE Open With entry for the current user...'
./scripts/repair-kde-open-with.sh
echo 'Run: flatpak run pt.jotta.edit'
echo 'To make Jotta Edit the default for TXT files: ./scripts/repair-kde-open-with.sh --set-default' 
