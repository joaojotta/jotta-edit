# Jotta Edit 1.1.2 — offline-first browser edition

This is a **separate deployment target** sharing Jotta Edit's Monaco editor, themes,
custom theme editor, Emmet, Prettier, Explorer icons, settings, and tab recovery.
It does not replace or alter the Linux Flatpak or Windows Electron targets.

## Build and run

Use **Node.js 22.12+** (Node 24 recommended):

```bash
npm install --no-audit --no-fund
npm run check:web
npm test
npm run dev:web
```

The development server displays its local URL, usually `http://127.0.0.1:5173/`.

Build deployable static files:

```bash
npm run build:pwa
npm run preview:pwa
```

Only the compiled **`web-dist/`** folder is deployable. The `web/index.html` source has no direct stylesheet links: Vite generates hashed CSS and JavaScript files and inserts the references during `npm run build:pwa`. The build now checks that these stylesheet and script files actually exist. The `./scripts/build-web.sh` script also generates `release/Jotta-Edit-1.1.2-Web-PWA-DEPLOY.zip` when the `zip` utility is installed; upload/extract that ZIP at the site root. **Do not upload the project source ZIP or `web/` directly.**

The deployable **`web-dist/`** folder includes its entry `index.html`,
prebundled JS/CSS, Monaco workers, fonts, icons, manifest and an offline service
worker. Upload the **contents** of `web-dist/` to the document root of
`https://edit.jotta.pt/` or another dedicated HTTPS origin. Web asset URLs are relative so the build can also be served below a subdirectory, provided the complete output folder is uploaded intact.

For a single command that installs dependencies, tests and produces `web-dist/`, use
`./scripts/build-web.sh` on Linux. The desktop build scripts are unchanged.

## Workspace operations

- **New workspace** creates a private IndexedDB project in the browser.
- **Open folder** uses `showDirectoryPicker()` when available, giving direct
  read/write access to a user-selected folder after permission is granted.
  File renaming and moves may require copy/delete, which is not atomic; folder
  rename/move is intentionally blocked in native mode to avoid data loss.
- **Import folder** copies a selected folder into a browser-managed workspace.
  On browsers without native directory access, Open Folder also imports a copy.
- **Import ZIP** creates a new offline workspace from text and binary files;
  the browser must support the archive's compression method. Nested paths are
  validated to prevent traversal.
- **Export ZIP** downloads a full backup including binary assets. If any file
  cannot be read, the export is cancelled rather than producing a misleading
  incomplete backup. The ZIP writer itself uses the widely-supported uncompressed
  ZIP format.
- **Open file** uses the native file picker where supported. Save writes back to the selected local file; file handles and recovery copies survive reloads. The browser may ask for access again. If a file changed outside the editor, Save refuses to overwrite it; use Save As or close and reopen it.
- **Save / Save as…** are available in the web toolbar, File menu and keyboard shortcuts. Save As chooses a local destination where supported; elsewhere it asks for a filename and downloads a copy. Standalone files imported through the fallback picker also download on Save. Download completion is controlled by the browser.
- The toolbar identifies **Local file**, **Local folder**, **Browser storage**, or **Download copy**. Ordinary browser-workspace saves stay in IndexedDB; use Download file or Export ZIP for an external backup.
- The browser asks before leaving with unsaved editor changes. Recovery snapshots remain local to this browser profile.
- Explorer rename/delete/move persist in the selected workspace backend. Desktop-specific native window controls and LSP executables are not
  available in the browser.

## Offline availability and data protection

On a secure origin (HTTPS or localhost) the installed service worker caches
all generated application assets. Reload once online after deployment, then
try disconnecting your network and reopening the app. Local code, themes and
session snapshots live in browser storage; Monaco, Prettier and Rubik fonts do
not require network access at runtime.

**Important:** Browser storage is device- and browser-profile-specific and
may be evicted, especially on iOS/iPadOS. Browser-managed workspaces do not
automatically sync with disk, iCloud, SMB or SFTP. **Export ZIP backups
regularly**, especially before clearing site data or changing devices. A
browser may request fresh access to a previously selected local folder.

In this edition, projects/files are limited to about **5 MB per file**,
**40 MB per ZIP backup**, **2,000 files per ZIP**, and **8,000 visible Explorer
entries**. Larger file imports are reported and require user confirmation to
skip. Some third-party or system keyboard shortcuts cannot be overridden by a
web page. The browser editor has no bundled OS language-server processes;
Monaco's in-browser language intelligence continues to work.

SMB and SFTP servers require an authorised Files-provider integration or a
future authenticated backend. There is **no embedded remote server access** in
this initial offline-first version.

## Installing on a tablet

From HTTPS in Safari on iPad: Share → Add to Home Screen → Open as Web App.
On desktop Chromium: use the browser's Install action. Mobile WebKit and Monaco
text selection/keyboard handling need physical-device testing before production use.

## Troubleshooting: page has no styling

Check the deployed page source or browser Network tab. The *compiled* `index.html` must include
`<link rel="stylesheet" ... href="./assets/...css">` and a module script referencing
`./assets/...js`. If it instead references `../src/web-entry.js`, the unbuilt source was deployed.

Ensure `web-dist/assets/` was uploaded as well as `web-dist/index.html`. Missing CSS/JS requests must return HTTP 200 with CSS/JavaScript content types (not a 404 page). Run
`npm run verify:pwa` locally to check the build before uploading. If an older version remains,
reload online or remove the previous service worker for the site from the browser's Application/Storage tools.
Do not clear browser site data without exporting your offline projects first.
