# Changelog

## 0.0.1 — First prototype

- Monaco-based editor shell: tabs, a collapsible folder sidebar, status bar.
- Goto Anything (Ctrl+P): one input, three modes by leading character — `:line`, `@symbol`, or fuzzy file search (with an optional `:line` suffix to jump after opening).
- Multiple cursors via Monaco's defaults, with `multiCursorModifier: 'ctrlCmd'` so Ctrl/Cmd+click adds a cursor, Sublime-style.
- Distraction-free mode (Shift+F11): hides the sidebar, tabs and status bar and centers the editor column.
- Large-file handling: files over 2MB disable minimap, folding and bracket-pair colourisation on activation.
- Emmet abbreviation expansion on Tab, gated by a Monaco context key so normal indentation is untouched when there's no abbreviation at the caret.
- Inline CSS colour highlighting and editing via Monaco's native `registerColorProvider`.
- Status bar redesigned off VS Code's blue accent to a neutral dark grey; the language label is now a button that opens a fuzzy-filtered language-mode switcher.
- Rubik set as the default UI font (chrome only, not the editor font), with a Preferences panel (Ctrl+,) to switch to any font already installed on the system.
- Flatpak packaging: electron-builder config, AppStream metainfo, and `scripts/build-flatpak.sh` to install the Flatpak runtime/SDK and produce a `.flatpak` bundle.

### Known limitations

- No extensions/plugins, build systems, multi-window session persistence, settings file (font preference lives in `localStorage`), remote files, or Vim mode.
- Flatpak icons under `assets/icons/` are placeholders borrowed from the parent `jotta-edit` project — replace before any real distribution.
- Built and `node --check`-verified in a sandbox without a usable Electron GUI or a Node version new enough for Vite 7; a real `npm install && npm start` run on an actual machine is still needed.
