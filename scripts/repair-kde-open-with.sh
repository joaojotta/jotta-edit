#!/usr/bin/env bash
# Repair a KDE/GNOME user launcher with an explicit, nonempty Exec command.
# Repair a stale/empty KDE Open With command after Flatpak installation.
# Does not alter the default file associations without --set-default.
set -euo pipefail
app_id='pt.jotta.edit'
if [[ $# -gt 1 ]] || { [[ $# -eq 1 ]] && [[ $1 != '--set-default' ]]; }; then
  echo 'Usage: ./scripts/repair-kde-open-with.sh [--set-default]' >&2
  exit 2
fi
desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
desktop_file="$desktop_dir/$app_id.desktop"
command -v flatpak >/dev/null || { echo 'flatpak is not installed' >&2; exit 1; }
if ! flatpak info --user "$app_id" >/dev/null 2>&1 && ! flatpak info --system "$app_id" >/dev/null 2>&1; then
  echo 'Install Jotta Edit Flatpak first.' >&2
  exit 1
fi
mkdir -p "$desktop_dir"
if [[ -f "$desktop_file" ]]; then
  backup="$desktop_file.bak.$(date +%Y%m%d%H%M%S)"
  cp -- "$desktop_file" "$backup"
  echo "Backed up existing desktop entry to $backup"
fi
cat > "$desktop_file" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Jotta Edit
Comment=Lightweight source code editor
Exec=flatpak run pt.jotta.edit --ozone-platform=x11 %F
TryExec=flatpak
Icon=pt.jotta.edit
StartupWMClass=pt.jotta.edit
X-Flatpak=pt.jotta.edit
DBusActivatable=false
Terminal=false
Categories=Development;TextEditor;
MimeType=text/plain;text/html;text/css;application/javascript;application/json;text/x-python;text/x-php;text/x-csrc;text/x-c++src;
DESKTOP
if command -v desktop-file-validate >/dev/null; then desktop-file-validate "$desktop_file"; fi
if command -v update-desktop-database >/dev/null; then update-desktop-database "$desktop_dir"; fi
if command -v kbuildsycoca6 >/dev/null; then
  kbuildsycoca6 --noincremental >/dev/null 2>&1 || echo 'Warning: KDE cache refresh was not successful. Log out and in if necessary.' >&2
elif command -v kbuildsycoca5 >/dev/null; then
  kbuildsycoca5 --noincremental >/dev/null 2>&1 || true
fi
if [[ ${1:-} == '--set-default' ]]; then
  command -v xdg-mime >/dev/null || { echo 'xdg-mime not found; desktop entry repaired but default was not set.' >&2; exit 1; }
  xdg-mime default "$app_id.desktop" text/plain
  echo 'Jotta Edit is now the default text/plain application for the current user.'
fi
printf 'Created KDE/GNOME launch entry: %s\n' "$desktop_file"
printf 'Exec: flatpak run pt.jotta.edit --ozone-platform=x11 %%F\n'
printf 'If necessary, choose Jotta Edit again in KDE Open With → Other Applications.\n'
printf 'Test with: flatpak run pt.jotta.edit /path/to/file.txt\n'
