#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "$(uname -s)" != Linux ]] || [[ "$(uname -m)" != x86_64 ]]; then
  echo 'This prototype currently builds Flatpaks on x86_64 Linux only.' >&2
  exit 1
fi
for tool in node npm flatpak flatpak-builder; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; echo 'Arch: sudo pacman -S --needed nodejs npm git base-devel flatpak flatpak-builder appstream' >&2; exit 1; }
done

if command -v appstreamcli >/dev/null; then
  appstreamcli validate --no-net assets/linux/dev.prototype.SublimeEditor.metainfo.xml
fi

# Flatpak apps run against a runtime + SDK installed from a remote, plus the
# Electron2 BaseApp electron-builder wraps the bundle in. Installed once,
# per-user, no root needed after the pacman/apt line above.
if ! flatpak remotes --user --columns=name | grep -qx flathub; then
  echo 'Adding the Flathub user remote...'
  flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
fi
printf '\nInstalling Flatpak 25.08 Platform, SDK and Electron BaseApp (if needed)...\n'
flatpak install --user -y flathub \
  org.freedesktop.Platform//25.08 \
  org.freedesktop.Sdk//25.08 \
  org.electronjs.Electron2.BaseApp//25.08

if [[ ! -d node_modules ]]; then
  echo 'Installing npm dependencies...'
  # electron's own package.json pulls in @electron/node-gyp from a git URL
  # (used only for rebuilding native modules, which this project doesn't
  # need). npm 12+ refuses git dependencies by default (EALLOWGIT) unless
  # explicitly allowed; --allow-git=root would not be enough since this one
  # isn't declared in *this* package.json, only transitively.
  npm install --allow-git=all
fi

printf '\nBuilding the renderer and the Flatpak bundle...\n'
npm run dist:flatpak

printf '\nFlatpak bundle(s):\n'
find release -maxdepth 1 -type f -name '*.flatpak' -print
version="$(node -p 'require("./package.json").version')"
printf '\nTo install:\n  flatpak install --user ./release/Sublime-Prototype-%s-linux-x86_64.flatpak\nTo launch:\n  flatpak run dev.prototype.SublimeEditor\n' "$version"
