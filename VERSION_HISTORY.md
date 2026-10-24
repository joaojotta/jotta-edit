# Version history — Jotta Edit

## 1.1.6 — HTML and embedded CSS outline (24 Oct 2026)

- Navigate nested HTML elements, IDs and classes in the document outline on desktop and web.
- Show embedded CSS selectors and grouping rules beneath their `<style>` element, including styles inside `<head>`, with original source positions.

## 1.1.5 — Visual conflict resolution (24 Oct 2026)

- Compare the latest external file with your editable buffer, copy individual changes, load the latest version with Undo support, or save a resolved result or separate copy.
- Recheck local desktop and browser saves for newer changes, and retain the saved baseline in dirty recovery sessions.
- Automate Windows portable, Flatpak and AppImage builds and prepare draft releases with downloadable packages and corresponding source.

## 1.1.4 — Document outline and remote connections (24 Oct 2026)

- Navigate Markdown headings, code symbols and CSS selectors from a document outline that follows the focused editor and unsaved edits.
- Monitor desktop remote connections, transfer progress and failures, reconnect sessions and retry supported operations with existing save conflict checks.
- Add sidebar controls, View menu and command palette entries in English and Portuguese, and display version 1.1.4 in the README.

## 1.1.3 — Reliable Markdown export (23 Oct 2026)

- Save Markdown HTML/PDF exports with labelled placeholders for unavailable images and persistent feedback showing the destination and any missing references.
- Keep source documents unchanged and preserve export size limits and open-file protection.
- Refresh the README with the app icon, features and the creator's goal of combining favourite parts of Sublime Text and VS Code.

## 1.1.2 — Markdown export, favourites and direct remote access (23 Oct 2026)

- Export Markdown drafts as styled HTML or PDF, including local images, on desktop and web.
- Save local-folder and remote-server favourites, with optional encrypted desktop credentials.
- Connect directly to FTP, SFTP and SMB servers with bundled clients and browse local folders in the app.
- Improve FTP/SFTP link handling, FTP directory listings and reloading empty or unscanned Explorer folders.
- Update desktop and web versions to 1.1.2; subsequent updates continue with 1.1.3, 1.1.4 and so on.

## 1.1.1 — Markdown (20 Oct 2026)

- Add Markdown formatting tools and a live preview side panel on desktop and web, including safe rendering and local image support.

## 1.1.0 — Remote folders (20 Oct 2026)

- Add desktop FTP, SFTP and SMB folder access through system mounts, with existing editing and workspace features.

## 1.0.2 — Live preview and Explorer file creation (19 Oct 2026)
- Added desktop live preview with updates from unsaved HTML, CSS and JavaScript, including untitled HTML documents.
- Added a persistent System default, Firefox or Chrome preview browser preference.
- Added file and folder creation through the Explorer context menu on folders, the project root and empty space, with protection against overwriting existing entries.
- Disabled text selection outside the editor and editable input fields.

## 1.0.1 — Custom syntax theme editor (18 Oct 2026)
- Added custom theme creation from a built-in syntax palette; live token colour, background and popup editing.
- Themes persist locally, support JSON import/export, rename, reset and delete; built-in themes remain immutable.
- Explorer icon colours still follow the source preset and retain independent manual overrides.

## v1.0.0 — Plain Text word highlighting and formatter width (version unchanged)
- Word-match highlighting for Plain Text is configurable: selection only (default), cursor position or off.
- Prettier print width defaults to no preferred limit, with optional 80/100/120 columns. HTML paragraph prose is preserved instead of being reflowed.
- Word wrap remains display-only and independent of formatting.

## v1.0.0 — Word wrap setting and session recovery (version unchanged)
- Word wrap can be enabled and disabled under Preferences → Editor, with existing Alt+Z and View menu shortcuts unchanged.
- Reopen tab order and active tab along with recovered unsaved documents or edits after restart or normal quit; periodic crash-recovery snapshots are kept locally.
- Preserve the unsaved tab-close confirmation, but do not force save/discard when quitting the application.


## v1.0.0 — Theme-aware Explorer icon colours (18 Oct 2026, version unchanged)
- Added a theme-linked icon palette and optional independent icon palette choice with instant preview.
- Kept custom per-type colour settings as overrides, with Automatic returning to the current palette.
- Original user-supplied SVGs are unchanged; only their CSS mask fill colours change.


## v1.0.0 — Editor palettes and tabbed Preferences (18 Oct 2026)
- Added Sublime Text Mariana Dark, Monokai Dark, Celeste Light, Breakers Light-inspired syntax palettes.
- Added VS Code Dark+/Light+, Monokai Pro Classic and Mariana Pro (Cool/Gray/Warm) palettes.
- Preserved existing theme IDs, live application and the independent UI dark/light mode.
- Grouped Preferences into keyboard-accessible Editor, Themes, Explorer and General tabs.
- Added pointer-drag repositioning by the Preferences title bar.
- Version stays **1.0.0**.


Jotta Edit 1.0.0 is the first final release following the RC and beta development cycle. Historical versions below are retained for reference.

## 1.0.0 — Syntax theme update (version unchanged, 18 Oct 2026)
- Adds independent editor syntax themes with live preview, persistent selection, pt-PT options and existing Jotta Dark/Light defaults.
- Includes palettes inspired by Monokai, One Dark, Dracula, Nord, Tokyo Night, Catppuccin Mocha and Solarized Light.

## 1.0.0 — Final release (18 Oct 2026)
- Sidebar toggle icon correction (same version): uses the supplied fold/unfold SVGs according to Explorer visibility, with live tooltips and dark/light adaptation.
- Finalized package and About version at 1.0.0.
- Replaced all application logo assets with the updated Jotta Edit icon, including Windows `.ico` and Flatpak icons.
- About dialog now credits **Developed by João Jotta**; app ID and namespace are hidden from the dialog.
- Preserved the features from RC2 and configured release artifact names to follow `package.json`.


## 1.0.0_RC2 — Explorer file operations, draggable colour picker and language detection (18 Oct 2026)
- Saturation and lightness sliders, draggable colour editor, colour controls in unsaved documents.
- Context menu rename and permanent delete with app-themed confirmation; drag-and-drop moves inside Explorer, with no destination overwrite.
- Updates paths of open documents after rename/move; prompts to save unsaved changes first.
- Conservative text-based language detection for unsaved documents; new SVG and folder-add icons.

## 1.0.0_RC — Release Candidate / Windows portable distribution (18 Oct 2026)
- Windows builds use a single portable executable instead of an NSIS installation wizard.
- The portable EXE self-extracts its runtime to a temporary folder at launch; settings remain in Windows user profile.
- Updated CI artifacts, Windows build instructions and release metadata. Linux packaging remains Flatpak.

## 0.0.13 — Release Candidate / Explorer folders, icon colours and interface font (18 Oct 2026)
- Updated 15 user-supplied SVG file icons and the new refresh SVG.
- Folder/file icons have better text spacing and optional per-type colours, chosen with the existing CSS colour popup.
- Hide subfolders from Explorer with a close control, or close the root folder without closing open documents. Refresh restores hidden subfolders.
- Rubik becomes the bundled default interface font; the UI font can be changed independently to an installed system font.

## 0.0.12 — Release Candidate / tag pairing, colour indicators, icons and pt-PT (18 Oct 2026)

- Inline colour indicators with a click target adjacent to each source colour literal.
- Matching HTML/XML/PHP tag names are underlined on opening and closing tags; bracket characters are not underlined.
- Double-click blank tab strip to add a document.
- UI localisation for Portuguese (Portugal) and English, auto-detect OS language, live preference.
- Imported 13 matching file icons; new application logo across Flatpak, Windows executable and shortcuts.

## 0.0.11 — Release Candidate / colour controls, icons and Windows tests (18 Oct 2026)
- Restored visible, clickable colour squares anchored using Monaco's scrolled character coordinates, with reserved space before colour literals and no negative CSS positioning hacks.
- Unified monochrome Explorer icons for both themes, including file/folder actions.
- Replaced tab action glyphs with consistent SVGs and vertically centred the light/dark theme button.
- Fixed Windows LSP integration test teardown by awaiting language-server termination and retrying temporary directory cleanup when Windows holds a file handle briefly.

## 0.0.10 — Release Candidate / Explorer and colour indicators (18 Oct 2026)
- Replaced floating Monaco colour widgets with inline injected coloured squares aligned to the text. The indicators do not alter file contents and open the existing colour editor when clicked.
- Kept Explorer folder icons yellow in both themes.
- Made Explorer footer file/folder icons light in dark mode and dark in light mode.
- Added separate persistent Explorer font/icon zoom: Ctrl+Plus, Ctrl+Minus, Ctrl+0 (while focused/hovered) and Ctrl+wheel over Explorer.
- Retained the themed menus, Explorer SVG file-type icons, hidden-file toggle, and equal-width colour preview introduced in the former `1.0.10` snapshot.
- Updated Linux/Windows script release references and tests for release candidate numbering.

## Earlier development snapshots (former version numbers)

- **1.0.10** — Explorer & UI polish: themed menus, SVG icons, hidden-file toggle and updated colour picker. Subsequently renumbered to `0.0.10` beta.
- **1.0.9** — Startup guards, diagnostic error forwarding and Flatpak X11 launch configuration.
- **1.0.8** — Approved colour-picker layout with HEX/RGBA/HSL/CMYK and preset colours; Flatpak display-backend changes.
- **1.0.7** — Flatpak interaction, KDE Open With and renderer hit-testing fixes.
- **1.0.6** — UI font-size preferences independent of code font-size, Ctrl+wheel zoom and colour editor refinements.
- **1.0.5** — Inline CSS colour indicators and selection improvements.
- **1.0.4** — Colour editor and Windows build/font adjustments.
- **1.0.3** — Colour picker fixes.
- **1.0.2** — Windows/Flatpak project packaging.
- **1.0.1** — Flatpak build corrections.
- **1.0.0** — Jotta Edit name and desktop/editor preferences foundation.

### Pre-renaming: Slate Editor 0.1.x
- The Slate Editor prototypes introduced Monaco, Electron, Flatpak packaging, Emmet expansion, formatting and icon/window features before the application was renamed Jotta Edit.

> Entries for older snapshots are summaries of the previously distributed build names and project history, not independently verified release notes or GUI regression guarantees.
