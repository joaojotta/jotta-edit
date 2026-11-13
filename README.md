<p align="center">
  <img src="assets/icon.png" alt="Jotta Edit app icon" width="128" height="128">
</p>

<h1 align="center">Jotta Edit</h1>

<p align="center">
  <strong>Version 1.3.2</strong> &nbsp;·&nbsp; Simpler project Git workflow
</p>

<p align="center">
  <strong>A focused editor for code, Markdown and web projects.</strong>
</p>

<p align="center">
  Linux &nbsp;·&nbsp; Windows &nbsp;·&nbsp; Web
</p>

<p align="center">
  <a href="https://edit.jotta.pt/">Open the web app</a>
</p>

---

## The idea

Jotta Edit is a personal code editor created by **João Jotta**. Its goal is to bring together the things he likes most about **Sublime Text** and **VS Code**, in an editor shaped around his own everyday workflow.

## Code with familiar tools

| Feature | What you can do |
| :--- | :--- |
| **Tabs & split editing** | Preview files with one click, keep them by editing or double-clicking, pin frequently used tabs, and work in two resizable panes with saved-version comparisons. |
| **Visual conflict resolution** | Compare external file changes with your edits, copy individual changes, and save your chosen result with another check for newer changes. |
| **Git and GitHub** | Update the current project through Save and commit all, Update project and Upload commits. Merge divergent changes and resolve text conflicts in the editor. Advanced contains GitHub sign-in, repository setup, cloning, branches and manual staging. Includes private commit email setup, branch and file badges, progress and cancellation. Uses installed desktop/Flatpak host tools and existing credentials. See [Git workflow](docs/git.md). |
| **Editor actions** | Use the **…** menu at the right of the tabs for Split editor, Compare, previews, Format document, Quick open and Command palette. Keyboard shortcuts remain available. |
| **Multiple project folders** | Add up to 20 local, browser or remote roots to one workspace. Search and replace across them, retain per-folder preferences and restore the folder list on restart. |
| **Quick navigation** | Use Ctrl+P for files, `:line`, `@symbol` or `file:line`; browse clickable breadcrumbs, reveal folders in Explorer and find commands through the command palette. |
| **Document outline** | Filter and jump between Markdown headings, JavaScript/TypeScript symbols, PHP/Python declarations, HTML elements and CSS selectors, including CSS inside HTML `<style>` blocks, from the sidebar. |
| **Project search & replace** | Search across files and unsaved drafts, preview replacements and choose which files to change. |
| **Code assistance** | Use syntax highlighting, automatic language detection, multiple cursors, Emmet expansion, inline diagnostics, Go to Definition and Rename Symbol. Inspect the Problems sidebar and configure optional desktop language servers in Preferences. See [language tools](docs/language-tools.md). |
| **C/C++ builds & tests** | Build and run single files with GCC/G++ or Clang, build CMake/Make projects, run CTest or Make test targets, and inspect compiler output in the desktop Build & Run panel. See [C/C++ setup and usage](docs/c-cpp.md). |
| **Formatting** | Format code with Prettier, enable format on save and choose your indentation and line-width preferences. |
| **File Explorer** | Create, rename and organise files and folders with context actions, drag-and-drop moves and recoverable deletion. External changes refresh automatically; clean files reload while unsaved edits remain protected. |

## Write, preview & export

- **Markdown workspace** — Write with a live, resizable preview and formatting tools for headings, emphasis, links, images, code, lists, checklists and tables.
- **HTML & PDF export** — Turn Markdown drafts into styled documents with local images included. Desktop saves PDFs directly; the web edition uses the browser print dialog.
- **Desktop live preview** — Preview HTML, CSS and JavaScript changes in your browser as you type, including unsaved edits. Preview saved PHP files with a local PHP runtime.

## Make it yours

- **Custom themes** — Choose syntax palettes inspired by familiar editors, create your own, and import or export theme files.
- **Independent interface colours** — Personalise light and dark modes, panel colours, accents and Explorer icon palettes.
- **Colour tools** — Edit colours with the built-in mixer, save named favourites with opacity, reuse recent colours, and display colour values as inline swatches or coloured backgrounds.
- **Portable settings** — Export or import themes, colours, fonts and global editor preferences from Preferences → General. Review imports before applying; open documents and project settings are preserved. See [settings and colour favourites](docs/settings-transfer.md).
- **Image viewer** — Open PNG, JPEG, GIF, WebP, AVIF, BMP, ICO and SVG in tabs, with transparency, animation and image zoom. Switch SVG between preview and editable code. Raster images are read-only; images support up to 20 MB and editable SVG up to 5 MB.
- **Font previews** — Open TTF, OTF, WOFF and WOFF2 files up to 20 MB in read-only tabs. Try custom sample text, inspect letters and numbers, and adjust the preview size without changing the font file.
- **Keyboard shortcuts** — Record custom command shortcuts in Preferences → Shortcuts, detect conflicts, reset bindings and transfer them with your settings.
- **Personal preferences** — Adjust editor and interface fonts, word wrap, minimap and project-specific editing settings. Use the interface in **English** or **Portuguese (Portugal)**.

## Keep your work close

- **Session recovery** — Restore your tabs, unsaved drafts and pending edits when you reopen the app.
- **Local history** — Browse saved versions, compare them with your current draft and restore changes with Undo support.
- **Recent workspaces & favourites** — Return to recent projects and save favourite local folders or remote servers.
- **Remote folders** — Edit directly over **FTP, SFTP, SMB or WebDAV** on desktop, with optional encrypted credential saving and checks for server-side changes before saving.
- **Connection activity** — See server state, transfer progress and failed operations in the Connections sidebar. Reconnect sessions and retry supported operations without leaving the editor. See [sidebar panels](docs/sidebar-panels.md).

## Desktop or browser

**Linux** ships as a Flatpak or AppImage. **Windows** ships as a portable executable: **no installation required**.

The **web edition** is an installable, offline-capable app with browser workspaces, folder and ZIP import/export, and direct local file or folder access where the browser supports it.

## Build packages on GitHub

The [Build all packages workflow](.github/workflows/build-desktop.yml) validates the desktop and web source, runs the test suite on Linux, and builds the following downloads:

| Workflow | Artifact | Contents |
| --- | --- | --- |
| [Build Windows](.github/workflows/windows.yml) | `package-windows-x64` | Windows portable EXE |
| [Build Flatpak](.github/workflows/flatpak.yml) | `package-flatpak-x86_64` | Linux Flatpak bundle |
| [Build AppImage](.github/workflows/appimage.yml) | `package-appimage-x86_64` | Linux AppImage |
| [Build Web](.github/workflows/web.yml) | `package-web-pwa` | Verified web/PWA deployment ZIP |
| Build all packages | `package-source` | Corresponding source and build scripts |

- **Automatic builds:** pushes to `main` build all four targets. Pull requests targeting `main` run checks, tests and the web build; desktop packaging runs after merging.
- **Try a build:** commit and push the workflows, open **Actions → Build all packages → Run workflow**, and select a branch. Each individual build workflow also has its own **Run workflow** button. Download the packages from **Artifacts** on the completed run (kept for 14 days). Individual workflows check and build their target; the all-packages workflow also runs the full test suite.
- **Prepare a release:** commit the desired version and push a matching tag, for example `git tag v1.3.2` followed by `git push origin v1.3.2`. The all-packages workflow checks that the tag matches `package.json`, builds every target, and attaches the four downloads and source archive to a **draft** GitHub Release. Review the draft under **Releases** and publish it when ready. Re-running the workflow can replace assets in an existing draft; published releases are left intact. Manual builds produce artifacts without creating a release.

Extract the `Jotta-Edit-<version>-Web-PWA-DEPLOY.zip` from the web artifact and upload its contents to your web host. It includes the compiled `index.html`, assets, fonts, manifest and offline worker. The workflow produces a deployable ZIP; it does not need hosting credentials. See [web deployment](docs/web-app.md).

GitHub Actions must be enabled for the repository. Builds use Node.js 24, locked npm dependencies and GitHub's built-in token; no personal access token is required. Only the draft-release job requests write access. Windows packages are unsigned unless you configure code signing. Flatpak installs the runtime, SDK and BaseApp versions declared in `package.json`; AppImage builds run independently of Flatpak.

For local builds, use Node.js 24, run `npm ci` and `npx --no-install install-electron --no`, then `npm run dist:windows` on Windows, `npm run dist:appimage` on Linux, or `bash scripts/build-flatpak.sh` for Flatpak (including runtime setup). `npm run dist:linux` builds both Linux formats once the Flatpak prerequisites are installed. Outputs go to `release/`.

Flatpak packaging prints its runtime, export and compression progress, plus an elapsed-time message during quiet stages. The standard build tests do not launch your installed `clangd`; optional real-server checks are described in [language tools](docs/language-tools.md#integration-checks).
