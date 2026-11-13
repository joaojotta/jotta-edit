# Version history — Jotta Edit

## 1.3.4 — Faster startup (13 Nov 2026)

- Reduce startup work by loading Markdown rendering/export libraries on demand and discovering system fonts when Settings opens.
- Read recovered session files in batches of four while preserving tab order, selection, and unsaved buffers.
- Update desktop, web and package metadata to version 1.3.4.

## 1.3.3 — Automatic releases (13 Nov 2026)

- Verify all five expected release downloads before publication, include SHA-256 checksums, and link the release from the Actions run summary.
- Automatically publish GitHub Releases for matching version tags after all app builds and source uploads succeed. Keep incomplete uploads in draft and preserve already published releases.
- Update desktop, web and package metadata to version 1.3.3.

## 1.3.2 — Simpler project Git workflow (13 Nov 2026)

- Focus the Git sidebar on the current project with Check for updates, Save and commit all, Update project and Upload commits. Move repository setup, cloning, branch tools, manual staging and detailed output into Advanced.
- Fetch and merge divergent remote changes from the app, preserving both histories. Open conflicted files, mark saved resolutions, finish or abort a merge with stale-state and unsaved-buffer checks.
- Refresh editor files and Explorer after updates and merge operations. Keep existing remote authentication and never force-push or automatically discard local changes.
- Fix fast remote transfers losing visible byte progress inside the throttle interval, which could fail the SFTP integration test in GitHub Actions. Keep first and final counts visible and throttle operations independently.
- Fix Flatpak CI metadata composition with SDK 25.08 by building on Ubuntu 24.04 with flatpak-builder 1.4+ and host AppStream compose support. Check the toolchain early in CI and local packaging instead of failing at export.
- Update desktop, web and package metadata to version 1.3.2.

## 1.3.1 — WebDAV connections (12 Nov 2026)

- Add desktop WebDAV connections over HTTP/HTTPS alongside FTP, SFTP and SMB, with Basic/Digest authentication, saved favourites, remote Explorer operations and guarded saves.
- Update desktop, web and package metadata to version 1.3.1.

## 1.3.0 — Compact editor interface (12 Nov 2026)

- Apply the approved compact layout with shorter tabs, a slimmer toolbar and status bar, tighter Explorer rows and a vertical sidebar icon rail.
- Move file-path navigation into the bottom-left status bar after the branch indicator, separated by a subtle divider, and open folder menus upwards, freeing the row below the tabs for the editor.
- Combine the desktop application menu with the custom title bar. Keep native window frames and compact the web workspace toolbar.
- Preserve existing interface colours, syntax themes, icon palettes and saved typography preferences. Scale compact controls with interface text size.
- Update desktop, web and package metadata to version 1.3.0.

## 1.2.2 — Git review, language tools and faster startup (1 Nov 2026)

- Add separate GitHub Actions builds for Windows, Flatpak, AppImage and web/PWA, with checks on pushes and pull requests, verified downloadable artifacts and draft releases containing all packages and corresponding source.
- Initialize projects, publish new GitHub repositories with private visibility by default, connect existing remotes, and create or switch local branches. Include private GitHub commit identity setup and guidance for rejected pushes while preserving local files and history.
- Add GitHub connection and cloning, staged and unstaged diffs, staging, commits, fetch, fast-forward pull and push, alongside Git branch and changed-file badges. Include progress, cancellation and host tools in Flatpak.
- Add live language-server diagnostics, a Problems sidebar, Go to Definition, Rename Symbol and desktop language-server settings.
- Refresh local folders through filesystem notifications with polling fallbacks, and restore sessions faster without blocking on the emoji font.
- Fix selected-tab recovery and preserve syntax highlighting for edits recovered from missing files.
- Prevent language-server cleanup from holding Flatpak builds open, and show packaging progress during runtime updates, export and compression.
- Update desktop, web and package metadata to version 1.2.2.

## 1.2.1 — C/C++ tools and console controls (29 Oct 2026)

- Drag the build panel's top edge to resize it, with keyboard controls and a saved height.
- Build, run and test local C/C++ files and CMake/Make projects with installed native tools, per-project settings, console input and clickable compiler diagnostics.
- Format C/C++ on save or with Format Document using clang-format and the project's style.
- Show only program output with a saved console filter, and expand the console to fullscreen while keeping input available.
- Resize output text independently with Ctrl+wheel, Ctrl++/Ctrl+-, Ctrl+0 and toolbar controls; remember the selected size.
- Update desktop, web and package metadata to version 1.2.1.

## 1.2.0 — Image and font previews, extended zoom and colour emoji (28 Oct 2026)

- Open PNG, JPEG/JFIF, GIF/APNG, WebP, AVIF, BMP, ICO and SVG images in desktop and web tabs, including connected remote folders. Preserve GIF animation and transparency; add fit-to-pane, actual-size and image zoom controls, Ctrl++/Ctrl+-, Ctrl+0 and Ctrl+wheel. Raster images are read-only and web downloads preserve their original bytes.
- Switch SVG tabs between the rendered image and editable source code. Keep unsaved edits when switching views, preview the current code safely as an image, and use the existing guarded save and session recovery flows.
- Preview TTF, OTF, WOFF and WOFF2 font files in read-only desktop and web tabs, including remote folders. Type custom sample text, inspect letters and numbers, change preview size with controls or Ctrl++/Ctrl+-, Ctrl+0 and Ctrl+wheel, and download the original font in the web app. Release loaded fonts when leaving the preview and report corrupt or unsupported files.
- Raise the editor and Markdown preview font-size limit to 72px, Explorer to 48px and interface to 32px. Keep the current default sizes and include the expanded range in settings transfers.
- Bundle Noto Color Emoji for offline emoji rendering, including ☕, with emoji glyphs taking priority over monochrome symbols in editor and interface fonts.
- Add Preferences → Shortcuts on desktop and web: record and assign command shortcuts, detect conflicts, unassign bindings and reset individual commands or all shortcuts. Apply changes immediately, update menu and toolbar hints, and include overrides in validated settings transfers.
- Add multiple project folders with File → Add Folder to Workspace and a matching Explorer button, plus Add Remote Folder to Workspace on desktop. Keep up to 20 separate roots, search and replace across all folders, preserve per-folder editor preferences, refresh each root and restore the folder list with the session. Removing a root preserves open documents; overlapping roots and cross-root moves are rejected.
- Update desktop, web and package metadata to version 1.2.0.

## 1.1.9 — Compact editor actions menu (27 Oct 2026)

- Give file tabs more room by collecting editor tools in one ellipsis menu on desktop and web.
- Keep familiar icons and shortcut hints, keyboard menu navigation and the desktop Live Preview browser chooser.

## 1.1.8 — Navigation, settings and Markdown improvements (25 Oct 2026)

- Simplify the web toolbar with grouped actions, workspace and Import menus, clear unsaved status, and a Save/Download file button that follows the current file's destination.
- Resize Markdown preview text with the usual zoom shortcuts, Ctrl+wheel or header buttons; remember its size separately from the editor.
- Use Ctrl+P for files, `:line`, `@symbol` and `file:line` navigation.
- Remember picker folders, filter entries as you type and open multiple selected files.
- Refresh Explorer automatically and reload clean files without losing cursor positions or Undo. Preserve unsaved edits and buffers whose files disappeared.
- Browse folders from clickable breadcrumbs or reveal them in Explorer.
- Preview files with one click, keep them with a double-click or an edit, and pin frequently used tabs. Pinned tabs remain pinned after reopening the app.
- Name and rename favourite colours, preserve their opacity, and reuse recently applied colours from the colour editor popup.
- Export and import themes, colours, fonts and global editor preferences from Preferences → General without replacing open documents or project settings.

## 1.1.7 — Global theming, colour favourites and in-app file picker (25 Oct 2026)

- Pick a syntax theme and the whole interface follows its colours, not just the editor; explicit Interface colour overrides still win.
- Move the custom Theme editor and Interface colours into their own Preferences tab, separate from quick theme selection.
- Remove unrelated documentation text that appeared when hovering the colour tool.
- Get CSS suggestions while typing inside `<style>` blocks in HTML.
- Open File now uses the same in-app folder browser as Open Folder on desktop.
- Add a Database file icon for SQL and database files.
- Smooth, animated sidebar show/hide and fixed tab dot alignment. Add Open File and Open Folder buttons at the top of Explorer, below its label, Search and right-aligned Refresh control.

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
