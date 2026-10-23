# Explorer icon palettes — Jotta Edit 1.0.0

## How it works

The icon artwork in `public/file-icons/` is unchanged. Every Explorer SVG file icon is rendered through a CSS mask and assigned a colour from `src/explorer-icon-palettes.js`.

**Edit → Preferences → Explorer → Explorer icon palette** controls the palette:

- **Follow code syntax theme** (default): maps every existing syntax theme to an appropriate icon palette.
- **Material Icons-inspired**: brighter material-style file-type colour categories.
- **VS Code Seti-inspired (Dark/Light)**: softer, traditional VS Code Explorer colours.
- **Catppuccin Mocha/Latte-inspired**: palette-coordinated pastels for dark/light appearances.
- **Monokai Pro-inspired**: green, cyan, purple, pink and golden accents.
- **Monochrome (interface)**: low-distraction single tone matched to the UI.

Automatic theme family matches include Jotta Dark/Light, VS Code Dark+/Light+, Monokai and Sublime Monokai, Monokai Pro, Catppuccin Mocha, Mariana, Nord, Dracula, One Dark, Tokyo Night, Solarized Light, and the light Sublime variants.

### Priority and compatibility

The colour chosen for an icon follows:

1. **Manual per-file-type colour** (Preferences → Explorer → Explorer icon colours).
2. **Explicit Explorer icon palette**, if chosen.
3. **Syntax theme-based palette**, if the Explorer palette is set to Follow code syntax theme.

Clicking **Automatic** only removes the manual override for the currently selected file type; it does not clear other icon preferences. All values persist in the existing localStorage settings. The Explorer palette preference uses a new key (`jotta.explorerIconPalette`); existing per-type overrides in `jotta.iconColours` are preserved. The selected syntax theme and the application UI theme stay independent.

Auto-selected colours are adjusted, when necessary, to maintain >= 3:1 contrast against Jotta's sidebar in both light and dark UI modes. The app never alters explicitly chosen HEX values. No third-party packages or external network calls are necessary.

### Inspiration and links

- [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) — coloured file/folder icons and configurable palette.
- [vscode-icons](https://github.com/vscode-icons/vscode-icons) — familiar language-specific associations.
- [Catppuccin Icons](https://github.com/catppuccin/vscode-icons) — matching dark/light flavour palettes.
- VS Code's built-in **Seti** icon theme — a traditional editor file icon appearance.

Colour assignments are original Jotta Edit adaptations inspired by these schemes. No third-party icon artwork is bundled, and colours are not claimed to be exact copies.
