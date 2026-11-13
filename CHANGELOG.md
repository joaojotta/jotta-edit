# Changelog

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

- Add separate reusable and manual GitHub Actions builds for Windows portable EXE, Flatpak, AppImage and web/PWA deployment ZIP. Validate and test pushes and pull requests, build all targets on `main` and version tags, and collect all downloads plus corresponding source into draft releases. Fix the Windows build command and output path; install Flatpak runtimes from package metadata and verify expected artifacts before upload.
- Initialize local projects, publish new private or public GitHub repositories, and connect existing repositories through new remotes. Upload only the current branch, preserve failed publication state for retry, and set a private GitHub commit identity during initialization when connected. Offer repository-local noreply identity setup and recovery guidance for email privacy, authentication and divergent-history push errors.
- Create and switch local branches from the Git sidebar. Require saved buffers and a clean working tree, reject stale branch reviews and unfinished Git operations, respect linked worktrees, and refresh open files and Explorer after switching.
- Add the desktop Git workflow: GitHub CLI browser sign-in and account status, repository browsing and cloning, per-file and bulk staging/unstaging, exact staged and unstaged diffs, repository commit identity, commits, fetch, fast-forward-only pull and normal push with upstream setup. Stream bounded progress, allow cancellation, preserve unsaved buffers and reject stale staging or concurrent operations. Run tools and credential helpers on the host in Flatpak.
- Widen Preferences and wrap its section tabs on smaller screens so all options remain accessible without horizontal scrolling.
- Use the supplied sidebar icons for Explorer, Git, Problems, Outline and Connections, with translated hover labels and accessible button names.
- Add desktop Git branch display, changed-file and folder badges, a filterable Changes sidebar and read-only comparisons against the last commit (HEAD). Include staged and unstaged changes, unsaved editor buffers, new and deleted files, staged renames, detached HEAD and linked worktrees. Refresh through local watches and bounded polling, and use host Git in Flatpak.
- Fix Flatpak builds hanging in language-server test cleanup: close server input, terminate local server process groups and force-stop unresponsive servers instead of leaving inherited pipes open. Keep the real clangd integration test opt-in; cover stubborn servers and child-process cleanup with deterministic test servers.
- Show Flatpak runtime updates, export and compression output during normal packaging, with elapsed-time messages during quiet stages.
- Add live language-server diagnostics, a filterable Problems sidebar, Go to Definition (F12), Rename Symbol (F2) and Preferences → Language servers for checking availability, configuring commands and restarting optional desktop servers. Apply multi-file renames to undoable, unsaved tabs with version checks; include built-in language diagnostics in desktop and web Problems.
- Watch visible local folders and open files for changes, including atomic replacements. Debounce notifications and use 30-second fallback checks for fully watched local workspaces; retain regular polling when watches are unavailable, for remote folders and in the web app. Release watches while hidden or disabled and on reload or exit.
- Fix restored tab selection when earlier files are missing, and retain syntax highlighting for recovered edits from missing files.
- Speed up session recovery by creating tabs without repeatedly activating editors, laying out panes or loading intermediate image and font previews.
- Let startup continue while the bundled emoji font loads, and read desktop startup settings in parallel.
- Update desktop, web and package metadata to version 1.2.2.

## 1.2.1 — C/C++ tools and console controls (29 Oct 2026)

- Show C/C++ input prompts immediately on Linux without source changes by disabling program stdout/stderr buffering through host `stdbuf`, including in Flatpak; preserve input, EOF, argument boundaries and Stop behavior.
- Type program input directly in the console after its prompt, including in fullscreen. Submit with Enter and close stdin with Ctrl+D or the toolbar's End input button; remove the separate bottom input bar.
- Resize the build panel by dragging its top edge or using the keyboard; remember its height and keep it within the window when resizing or leaving fullscreen.
- Add fullscreen program output with Escape to return, plus independent, saved console text sizing using Ctrl+wheel, Ctrl++/Ctrl+-, Ctrl+0 and toolbar controls. Keep program input available in fullscreen.
- Add desktop C/C++ Build & Run support with installed GCC/G++ or Clang, single-file compilation, CMake/Make project detection, CTest and configurable Make test targets. Save changed project files before building, stream bounded output with clickable compiler diagnostics, accept program arguments and console input, and stop process trees. Include per-project build settings, configurable shortcuts and Flatpak host-tool execution. See [C/C++ setup](docs/c-cpp.md).
- Support C/C++ format on save and Format Document through clang-format, inheriting project styles and applying editor indentation and line-width preferences.
- Add a saved Program output only option to hide build output, commands, input echoes and editor completion messages while keeping program stdout and stderr.
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

- Replace the row of editor action icons with one compact ellipsis menu on desktop and web, leaving more room for file tabs. Keep Split editor, Compare with saved version, Markdown preview, Live Preview, Format document, Quick open and Command palette together, with icons and shortcut hints.
- Support keyboard navigation, Escape dismissal, checked view states and focus restoration. Preserve existing keyboard shortcuts and the desktop Live Preview browser chooser; keep unavailable web actions disabled.
- Update desktop, web and package metadata to version 1.1.9.

## 1.1.8 — Navigation, settings and Markdown improvements (25 Oct 2026)

- Group the web toolbar into workspace, Import and file-save controls. Show the workspace name, unsaved status and a primary Save or Download file action that follows the file's save destination. Keep Save As, download copies and workspace ZIP export available, with keyboard-accessible menus and a responsive layout.
- Add independent Markdown preview text sizing with Ctrl++/Ctrl+-, Ctrl+0, Ctrl+wheel and header controls. Remember the size, include it in settings transfers, and scale headings and code without changing export styling.
- Extend Ctrl+P into Go to Anything: fuzzy file and draft matching, `:42` or `:42:8` for a position, `@name` for document symbols, and `file.css:42` to open a file at a line. Ignore stale symbol lookups after edits or navigation.
- Remember separate last-used Open File and Open Folder locations in the desktop picker, filter files and folders as you type, and open validated multi-file selections with range selection and visible-file selection controls. Keep native browser multi-file selection and directory memory where available.
- Automatically refresh visible Explorer folders and open files on desktop and web. Reload clean documents as undoable edits while preserving split-pane views; keep dirty buffers under the existing conflict checks. Preserve buffers when files are renamed or deleted externally, pause checks in hidden windows and dialogs, and use slower checks for connected remote folders. Toggle this in Preferences → Explorer.
- Make breadcrumb folders clickable on desktop and web: browse their immediate contents, open files and reveal folders in Explorer, including local, browser and connected remote workspaces.
- Add preview and pinned tabs. Single-click an Explorer or breadcrumb file to preview it; double-click, edit, save or pin to keep it. Replace only clean previews in the same editor pane, preserve files visible in another pane, and restore pinned tabs across restarts.
- Add named colour favourites with editable names and preserved opacity, plus the 12 most recently applied colours. Keep older saved colours, show transparency on a checkerboard, and synchronise favourites and recents across split editor panes.
- Export and import global settings as JSON from Preferences → General on desktop and web, including custom themes, interface and Explorer colours, colour favourites, fonts and editor preferences. Validate and review imports before applying, preserve open documents and project overrides, and exclude credentials, server favourites and workspace paths.
- Update desktop, web and package metadata to version 1.1.8.

## 1.1.7 — Global theming, colour favourites and in-app file picker (25 Oct 2026)

- Derive the interface's own colours (background, panels, sidebar, borders, accent, text) from the selected code syntax theme, unless overridden in Interface colours. Themes now re-colour the whole window, not just the editor.
- Split the custom syntax Theme editor and Interface colours sections out of the Themes tab into their own Theme Editor tab in Preferences.
- Keep favourite colour swatches square, with separate, centred remove buttons.
- Increase the inline colour selection swatches in CSS by 3px and reduce their horizontal spacing by 3px on each side.
- Disable Monaco's built-in CSS/HTML property-hover documentation and native colour decorator, which stacked unrelated MDN reference text under the colour tool's swatch on hover. The in-editor colour tool is unaffected.
- Add CSS code completion inside embedded `<style>` blocks in HTML documents (Monaco's bundled HTML language worker had no embedded-CSS awareness at all).
- Open File now browses through the same in-app folder browser as Open Folder on desktop, instead of the native OS file dialog. The web build keeps its native picker.
- Add a Database file icon for `.sql`, `.sqlite` and `.db` files, with a matching Explorer icon colour and preferences entry.
- Animate the Explorer sidebar with a 100ms collapse/expand transition, reclaiming its space for the editor and restoring its saved width; dragging its splitter to resize is unaffected.
- Fix the vertical alignment of the unsaved-changes dot next to the file name in tabs by drawing it as a circle instead of a text glyph.
- Add Open File and Open Folder buttons to the Explorer toolbar on desktop and web. Place the Explorer label and Search control in a row above the action icons, with Refresh aligned at the right.
- Update desktop, web and package metadata to version 1.1.7.

## 1.1.6 — HTML and embedded CSS outline (24 Oct 2026)

- Add HTML document outlines with nested elements, IDs and classes on desktop and web.
- Include CSS selectors and grouping rules from embedded `<style>` blocks, including those inside `<head>`, with navigation and current-section highlighting at their original HTML source positions. Ignore comments and script contents, tolerate incomplete edits, and keep the existing outline size and entry limits.
- Update desktop, web and package metadata to version 1.1.6.

## 1.1.5 — Visual conflict resolution (24 Oct 2026)

- Add visual conflict resolution on desktop and web: compare the latest file with your editable buffer, copy individual changes, load the latest file with Undo support, save the resolved result or preserve a copy with Save As. Check on save and when returning to the app, and expose Compare with latest file in View and the command palette.
- Guard local desktop saves and recheck staged browser writes against newer external changes. Preserve the saved baseline in dirty recovery sessions so restarting does not silently approve external edits.
- Add GitHub Actions builds for x64 Windows portable EXE, Linux Flatpak and AppImage packages, with downloadable artifacts and draft releases for matching version tags.
- Add AppImage and combined Linux build commands, and include the desktop workflow in source archives.

## 1.1.4 — Document outline and remote connections (24 Oct 2026)

- Add a Document outline sidebar for Markdown headings, JavaScript/TypeScript symbols, PHP/Python function and class declarations, and CSS/SCSS/Less selectors. Follow the focused editor and unsaved edits, filter entries, highlight the current section and jump to its source line.
- Add a desktop Remote connections sidebar with server state, queued operations, upload/download byte progress, verification phases and recent failures. Reconnect an existing session without re-entering its credentials, retry downloads and listings, and retry saves through the editor's existing conflict checks.
- Expose both panels through sidebar controls, the View menu and command palette, with English and Portuguese labels. Keep Explorer, Search, Outline and Connections as separate sidebar views; the browser build includes the document outline.
- Update desktop and web version metadata and release filenames to 1.1.4, and display the version prominently in the GitHub README.

## 1.1.3 — Reliable Markdown export (23 Oct 2026)

- Export HTML and PDF even when individual images are missing, inaccessible or too large. Keep available images, insert labelled placeholders for unavailable ones, and report their references without changing the Markdown source.
- Keep export progress, the saved destination, image warnings and errors visible below the Markdown toolbar. Log export failures for diagnosis.
- Refresh the README with the app icon, feature highlights and the creator's Sublime Text / VS Code inspiration.

## 1.1.2 — Markdown export, favourites and direct remote access (23 Oct 2026)

- Open the desktop Markdown export Save dialog before preparing content or reading images. Start in the document's folder (Documents for unsaved or remote drafts), preserve cancellation, and recheck open-file protection before writing.

- Match Flatpak installation scripts and printed instructions to the generated `linux-x86_64.flatpak` bundle name.

- Export the active Markdown draft as styled HTML or PDF from its toolbar, File menu or command palette on desktop and web. Embed local images, preserve section links and keep source buffers unchanged. Desktop PDF saves directly; web PDF uses the browser print dialog.

- Add local-folder and remote-server favourites from the File menu, Explorer star button, command palette and welcome screen. Optionally save remote credentials with system encryption; delete credentials separately or remove the entire favourite. Keep local favourites available in the browser build.

- Reload cached empty Explorer folders when expanded, including `public_html`. Fetch immediate contents without scanning unrelated subfolders, keep child folders available for later expansion, and show when no visible entries were returned.

- Enter FTP folders before requesting MLSD/LIST listings, so servers that ignore listing path arguments show the actual `public_html` contents. Restore the previous FTP working directory after each listing.

- Open FTP directory aliases such as `public_html` when the server exposes an inaccessible physical link target or omits the target. Verify the accessible alias with CWD/PWD and keep file operations inside the FTP workspace.

- Keep folders such as `public_html` visible when they are FTP/SFTP links. Resolve in-workspace link targets, use FTP LIST metadata when needed, and show unavailable links with a reason. Preserve later sibling folders after the Explorer file limit and load unscanned folders when expanded.

- Disable electron-builder dependency rebuilds for all desktop targets. SSH2 uses its JavaScript fallback when the optional `cpu-features` addon is unavailable, so AppImage and Flatpak packaging do not require compiling it.

- Connect to FTP, SFTP and SMB servers directly with bundled protocol clients on all desktop platforms. Open the server folder in the Explorer without KIO, GVfs, native mount tools or a desktop portal.
- Replace the native folder picker with an in-app browser with an editable path, home/parent navigation and hidden-folder controls.
- Verify SFTP server fingerprints in the app, keep connection passwords in memory unless explicitly saved with system encryption, and support SMB domain usernames. Cancel and time out stalled connections and filesystem operations.
- Route remote Explorer operations, project search, Markdown assets and guarded saves through the direct connection. Stage saves beside the destination, check for server edits, replace and verify the result. Move deleted remote entries into the workspace's `.jotta-trash` folder.

## 1.1.1 — Markdown (20 Oct 2026)

- Add a live, resizable Markdown preview and icon formatting tools on desktop and web, including headings, emphasis, links, images, code, quotes, lists, checklists and tables. Formatting edits are undoable; the existing formatter also supports Markdown.
- Give `.md` and `.markdown` files their own Markdown icon in the Explorer and tabs, with a separate file-type colour setting and support across icon palettes. Use the supplied `markdown-preview.svg` for both Markdown preview controls.
- Sanitize preview HTML, keep scripts and unsafe links inactive, support workspace images and HTTPS images, and keep preview controls separate from desktop Live Preview.
- Update the desktop and web version to 1.1.1.

## 1.1.0 — Remote folders (20 Oct 2026)

- Use the supplied cloud folder icon for remote connections.
- Open FTP, SFTP and SMB folders through the desktop's mounted filesystem, with connection and mounted-folder choices in the File menu and Explorer.
- Use existing Explorer operations, save commands, project search, local history and recent workspaces with accessible mounted folders. Authentication stays with the operating system.
- Protect remote saves with staged, flushed writes, server-content checks and verification; failed or stale saves keep editor buffers unsaved.
- Keep version 1.1.0 across About, package metadata and release filenames.

## 1.0.2 — Live preview and Explorer file creation (19 Oct 2026)

### Web file saving (20 Oct 2026)

- Open and save individual local files through native browser file pickers where supported. Retain file handles and recovery copies across reloads, request access before formatting, and reject writes when the file changed outside the editor.
- Add web Save and Save As buttons and a visible destination label. Browser workspaces save internally; imported standalone files and Save As in unsupported browsers download copies, with clear status messages. Give independently imported files unique identities, even when names match.
- Cancelled pickers and failed writes preserve editor changes; edits made during Save As remain unsaved in the rebound buffer. Prevent Save As from overwriting another open tab, abort failed file writes, and ask before leaving the web app with unsaved changes.

### Recent workspaces and project settings (20 Oct 2026)

- Reopen up to 20 recent workspaces from File → Recent Workspaces, the command palette or the welcome screen. Remove individual entries or clear the list without deleting files. Failed opens preserve the current workspace; switching keeps open buffers and unsaved edits.
- Enable project-specific indentation, tab width, word wrap, format-on-save and formatting width in Preferences → Editor. Turning the option off restores global defaults. Settings stay on this device and do not create files in the project.
- Browser workspaces retain directory handles for reopening, distinguish native folders with identical names and keep older open tabs connected to the correct folder. Empty browser workspaces remain distinct.

### Local history (20 Oct 2026)

- Capture local versions before and after saves on desktop and web. Browse a file’s versions from File → Local History or the command palette, compare with the current buffer and restore as an undoable, unsaved edit. Back up the working buffer before restoration.
- Preserve history across Explorer renames and moves. Retain up to 30 versions per file for 30 days, with 300 versions and 20 MB overall, for files up to 1 MB. Desktop history stays in app data; web history stays in browser storage. History failures do not block file saves and are reported in the status bar.

### Split editor and saved-version comparison

- Split the editor into two resizable panes with independent file selectors, cursor positions and scrolling. Open tabs and Explorer selections in the focused pane; shared files stay synchronized. Toggle with Ctrl+\ or View → Split Editor.
- Compare the current document with a read-only snapshot of its saved version, navigate changes and edit the working copy. Save, undo, formatting and colour tools act on the working copy. Available on desktop and web.

### Project search and replace

- Added a search sidebar with literal text, case-sensitive and whole-word matching, line previews and per-file selection in desktop and web versions. Search uses unsaved editor contents.
- Preview replacement lines before applying changes as unsaved editor edits, then undo the batch or save the changed files. Reject stale previews before modifying any document.
- Open project search with Ctrl+Shift+F, replacement with Ctrl+Shift+H, or the Explorer search button.

### Licence

- Show the full GNU General Public License name, version 2 or later and SPDX identifier in a dedicated About paragraph, in English and Portuguese.

- Changed original application code to GNU GPL version 2 or later (GPL-2.0-or-later), with the later-version option for Apache-2.0 compatibility. Preserve required third-party notices, use CC0 for AppStream metadata, and update About dialogs and package metadata.

### Flatpak metadata

- Include validated AppStream metadata so KDE Discover identifies the bundle as Jotta Edit, developed by João Jotta, under the application licence. Ship the licence text and validate metadata during Flatpak builds.

### Preferences

- Removed the formatting and Live Preview explanatory notes from Preferences.

### Colour display

- In background colour mode, open the picker only from the # or colour function name; clicking numeric values places the caret for normal editing.

- Added an Editor preference to switch between colour squares and highlighting colour values with their own background, with readable text and the existing colour picker. The choice persists in desktop and web versions.

### Web downloads and unavailable actions

- Added Download file in the web toolbar, File menu and command palette to download the current editor contents, including unsaved edits. Workspace Save and project ZIP export remain available.
- Disabled desktop-only live preview controls in the web toolbar, Tools menu and Preferences; omit preview commands from the web command palette and disable the browser selection popup.

### Live preview

- Show PHP runtime errors in local previews and a readable error page for empty HTTP failures, instead of leaving the browser blank.

- Show full preview startup errors in a dialog, including PHP/Flatpak runtime diagnostics, instead of a truncated remote-method error in the status bar.
- Fixed PHP preview selection, including index.php projects. Execute saved PHP through an installed PHP runtime, preserve form submissions and session cookies, and report missing PHP clearly.

- Added a desktop Live Preview toolbar button and Tools menu commands for static web projects, including untitled HTML.
- Reload previews as HTML, CSS and JavaScript change in the editor, without saving.
- Added a persistent browser choice in Preferences → General: System default, Firefox or Chrome, using the supplied icons.
- Keep the Preferences and toolbar browser icons synchronized with the saved browser choice; use default-browser.svg for System default and light icons in dark mode.

### Explorer file and folder creation

- Use the supplied right/down SVG arrows for Explorer folders and load moved interface icons from ui-icons. Keep Refresh aligned at the right of the Explorer header.

- Added New File and New Folder to the right-click menu on Explorer folders, the project root and empty Explorer space.
- Created files open in the editor; created folders appear immediately. Existing entries are never overwritten.
- Supported desktop projects, browser-managed workspaces (including empty folders) and browser native-folder access.

### Tabs, browser selection and menus

- Right-click the preview toolbar button to choose System default, Firefox or Chrome; the choice also updates Preferences and persists across restarts.
- Added file-type icons before tab names, using the selected theme and icon palette colours.
- Switch an open application menu by hovering over another menu heading; close menus when the pointer leaves the menu area.

### Trash

- Fixed Linux/Flatpak Trash handling by using host desktop Trash helpers, verifying that items leave their original location and reporting failures in a dialog. Added Delete-key support for focused Explorer entries.

- Desktop Explorer deletion moves files and folders to the operating-system Trash or Recycle Bin. Trash failures preserve the original files.
- Browser workspaces preserve deleted entries in the project's hidden .jotta-trash folder, with original-path metadata, because browser APIs cannot access system Trash.

### Interface selection

- Disabled text selection in application menus, sidebars and other interface elements while preserving selection in the editor and input fields.

## 1.0.1 — Syntax theme designer and Web/PWA edition (18 Oct 2026)

### Web/PWA edition

- Added a browser target sharing the desktop editor, syntax themes, custom theme editor and formatting.
- Added browser-managed offline projects (IndexedDB), native folder access where permitted, session restoration, local folder/ZIP import and ZIP project backup.

### Syntax theme designer

- Editable, persistent copies of all built-in Monaco themes with the shared colour mixer and live preview.
- Rename, reset, delete, import and export custom theme JSON. The built-in themes remain unchanged.
- Explorer icon colours continue to follow the theme's source palette unless explicitly overridden.

### Web startup hotfix

- Export `projectSearch` correctly as `searchProject` in the browser adapter, preventing an `Uncaught ReferenceError` at startup. Added an executable adapter-exports regression test.

## 1.0.0 — Final release, editor preferences and desktop integration (18 Oct 2026)

### Plain Text highlights and configurable formatter width

- Preferences → Editor: match Plain Text words only when selected (default), when cursor is inside a word, or never.
- Preferences → Editor: formatting print width defaults to no preferred limit (Prettier internally uses 10,000 columns), optionally 80/100/120 columns.
- HTML formatting uses `proseWrap: 'never'` to preserve existing paragraph text instead of inserting line breaks; visual word wrap is independent.

### Word wrap and recoverable editing session

- Added a Word Wrap checkbox to Preferences → Editor, synchronized with View → Toggle Word Wrap and Alt+Z. Monaco wraps to the available editor width.
- Preserve open tab order, selection, unnamed drafts, and unsaved changes to named files on restart or normal exit.
- Store recovery snapshots in the per-user Electron app data directory, using delayed writes during editing and an awaited atomic final write on exit. Prevent closing when the backup write fails.
- Recover dirty buffers from files that have disappeared as new untitled documents. Continue to support older path-only session files and the existing confirmation when *closing one tab*.

### Windows test compatibility fix

- Skip the Linux-only Bash/Flatpak integration execution on Windows, where `bash` may not be installed.
- Keep a platform-independent test of the KDE launcher command and opt-in TXT association; Linux still runs the full integration test.
- This removes the test-suite failure that previously stopped the Windows portable build before packaging.

### Automatic Explorer icon colours

- Added Explorer icon palettes that follow the selected syntax highlighting theme by default.
- Added an optional independent Explorer icon palette selector in Preferences → Explorer, with a live icon preview.
- Included locally-defined colours inspired by VS Code Seti, Material Icons, Catppuccin Mocha/Latte, Monokai Pro, plus matching palettes for Jotta, Nord, Dracula, One Dark, Tokyo Night, Mariana and Solarized.
- Kept the user's supplied SVG shapes and custom per-icon colour overrides; Automatic resets one icon to its resolved palette default.
- Kept icons at least 3:1 contrast against the sidebar, including when syntax and UI themes have opposite light/dark modes.
- No third-party icon artwork or dependencies added.

### Editor palettes and tabbed Preferences

- Added Sublime Text Mariana Dark, Monokai Dark, Celeste Light, Breakers Light-inspired syntax palettes.
- Added VS Code Dark+/Light+, Monokai Pro Classic and Mariana Pro (Cool/Gray/Warm) palettes.
- Preserved existing theme IDs, live application and the independent UI dark/light mode.
- Grouped Preferences into keyboard-accessible Editor, Themes, Explorer and General tabs.
- Added pointer-drag repositioning by the Preferences title bar.

### Syntax theme library

- Separate Monaco code syntax palette from the app's dark/light UI theme, while preserving **Follow interface (Jotta)** as the default.
- Add 8 popular-inspired palettes (Monokai, One Dark, Dracula, Nord, Tokyo Night, Catppuccin Mocha, Solarized Light), alongside Jotta Dark/Light.
- Add a live theme selector and syntax colour preview in Preferences; store the choice and translate its labels to pt-PT.
- Retain local theme definitions, without new runtime dependencies or third-party theme assets.

### Desktop integration repair

- Refresh the KDE Plasma user desktop entry after Flatpak installation, ensuring a nonempty `Exec=` and `%F` file arguments.
- Add optional `--set-default` to the KDE repair command (never changes TXT default automatically).
- Refresh KDE application cache after repair and document direct Flatpak launch diagnostics.

### Final release

- Sidebar toggle icon correction (same version): uses the supplied fold/unfold SVGs according to Explorer visibility, with live tooltips and dark/light adaptation.
- Promoted RC2 to version 1.0.0.
- Applied the latest Jotta Edit application icon to Linux, Windows and the interface.
- Simplified About: removed the application ID and domain namespace; added **Developed by João Jotta**.
- Kept Windows as a single portable executable and Linux as a Flatpak; artifact filenames now derive from package version.
- Preserved RC2 editing, Explorer, colour mixer and localisation features.

## 1.0.0_RC2 — Explorer file operations, draggable colour picker and language detection (18 Oct 2026)

- Saturation and lightness sliders, draggable colour editor, colour controls in unsaved documents.
- Context menu rename and permanent delete with app-themed confirmation; drag-and-drop moves inside Explorer, with no destination overwrite.
- Updates paths of open documents after rename/move; prompts to save unsaved changes first.
- Conservative text-based language detection for unsaved documents; new SVG and folder-add icons.

## 1.0.0_RC — Release Candidate / Windows single-file portable app (18 Oct 2026)

- Replaced the Windows NSIS installer target with electron-builder `portable` x64.
- Build output is `Jotta-Edit-1.0.0_RC-Windows-x64-Portable.exe`, one distributable executable with no installation step.
- The PowerShell build script now checks for the generated executable and prints its path.
- No change to the Linux Flatpak distribution model.

## 0.0.13 — Release Candidate / Explorer folders, icon colours and interface font (18 Oct 2026)

- Updated 15 user-supplied SVG file icons and the new refresh SVG.
- Folder/file icons have better text spacing and optional per-type colours, chosen with the existing CSS colour popup.
- Hide subfolders from Explorer with a close control, or close the root folder without closing open documents. Refresh restores hidden subfolders.
- Rubik becomes the bundled default interface font; the UI font can be changed independently to an installed system font.

## 0.0.12 — Release Candidate: localisation, tag matching, icons and inline colours

- Restored inline colour selectors and fixed placement.
- Added Sublime-style paired tag name underline (HTML/XML/PHP).
- Added pt-PT translation and live language preference.
- Double-click tab strip to make a new file; refreshed icons and app branding.

## 0.0.11 — Release Candidate: colour picker icons and Windows LSP test

- Restore interactive Monaco-positioned colour squares; unify monochrome icon colour and action SVGs.
- Wait for LSP subprocess teardown before removing test workspace on Windows.

## 0.0.10 — Explorer polish, aligned colour swatches and interface updates

### Release Candidate: aligned colour swatches and Explorer-only zoom

- The floating colour chips have been replaced with Monaco injected text tokens that stay aligned as editor typography changes.
- Explorer folders remain yellow, while the bottom shortcut icons adapt to the theme.
- Ctrl+Plus/Minus, Ctrl+0 and Ctrl+wheel operate on Explorer font/icon size when Explorer is targeted.
- Reclassified the former 1.0.10 development build as 0.0.10 beta.

### Explorer and UI polish

- Added supplied SVG folder, HTML, CSS, image, text and generic-file icons to Explorer.
- Added SVG icons for PHP, JavaScript, JSON and font file types.
- Added matching icons to the Explorer Open File / Open Folder buttons and the Open Folder action.
- Implemented themed application menus, adapting live to dark and light modes.
- Added hidden dotfile/dotfolder toggle (View menu and Preferences), refreshed live.
- Made the Original and Selected colour preview halves equal width.
- Reduced colour-token decoration to one injected spacer so colour chips reserve visual space.
- Normalised release references across Flatpak/Windows scripts and README.
- Removed obsolete literal `1.0.9` test expectations, replaced chip-offset assertion with checks for the current layout.

## 1.0.9 — Startup diagnostics

- Protected Monaco wheel listener from nullable editor DOM node during startup.
- Forwarded error-level renderer messages to the launch terminal.
- Preserved X11-first Flatpak launch settings.

## Testing notes

`npm run check`, `npm test`, and `npm run build:web` are the project checks. The full Electron desktop launch, Flatpak packaging, Windows portable EXE and visual layout should be verified on their respective platforms.

## Known limitations

- Hidden-file toggle checks dot-prefixed names. Windows Hidden attribute handling is not implemented separately.
- Native/custom window frame preference still requires a restart.
- The bundle contains source code, not prebuilt installers.

See [VERSION_HISTORY.md](VERSION_HISTORY.md) for the full historical version list.
