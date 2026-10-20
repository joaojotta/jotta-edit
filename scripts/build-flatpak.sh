#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "$(uname -s)" != Linux ]] || [[ "$(uname -m)" != x86_64 ]]; then
  echo 'Jotta Edit currently builds on x86_64 Linux.' >&2
  exit 1
fi
for tool in node npm flatpak flatpak-builder appstreamcli; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; echo 'Arch: sudo pacman -S --needed nodejs npm git base-devel flatpak flatpak-builder appstream' >&2; exit 1; }
done

# Catch unsupported electron-builder keys before installing dependencies or building Vite.
node scripts/validate-build-config.cjs
appstreamcli validate --no-net assets/linux/pt.jotta.edit.metainfo.xml

# Flatpak applications use a runtime and SDK installed from a remote.
# Install for this user only; no root access needed after pacman prerequisites.
if ! flatpak remotes --user --columns=name | grep -qx flathub; then
  echo 'Adding the Flathub user remote...'
  flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
fi
printf '\nInstalling Flatpak 25.08 Platform, SDK and Electron BaseApp (if needed)...\n'
flatpak install --user -y flathub \
  org.freedesktop.Platform//25.08 \
  org.freedesktop.Sdk//25.08 \
  org.electronjs.Electron2.BaseApp//25.08

if [[ ! -f node_modules/electron/package.json ]] || [[ ! -f node_modules/monaco-editor/package.json ]] || [[ ! -f node_modules/vite/package.json ]] || [[ ! -f node_modules/emmet/package.json ]] || [[ ! -f node_modules/prettier/package.json ]] || [[ ! -f node_modules/@prettier/plugin-php/package.json ]] || [[ ! -f node_modules/@fontsource/rubik/package.json ]]; then
  echo 'Installing npm dependencies...'
  npm install --no-audit --no-fund
fi
if [[ ! -x node_modules/electron/dist/electron ]]; then
  echo 'Downloading Electron Linux x86_64 runtime...'
  if [[ ! -x node_modules/.bin/install-electron ]]; then
    echo 'Electron installer missing. Reinstall project dependencies.' >&2
    exit 1
  fi
  ./node_modules/.bin/install-electron --no
fi
npm run install:check
npm run check
npm test
printf '\nBuilding Vite frontend and Flatpak single-file bundle...\n'
npm run dist:flatpak
bash scripts/build-source.sh
printf '\nFlatpak bundle(s):\n'
find release -maxdepth 1 -type f -name '*.flatpak' -print
version="$(node -p 'require("./package.json").version')"
printf '\nTo install:\n  flatpak install --user ./release/Jotta-Edit-%s-linux-x64.flatpak\nTo launch:\n  flatpak run pt.jotta.edit\n' "$version"
