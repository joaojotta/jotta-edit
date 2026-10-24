<p align="center">
  <img src="assets/icon.png" alt="Jotta Edit app icon" width="128" height="128">
</p>

<h1 align="center">Jotta Edit</h1>

<p align="center">
  <strong>Version 1.1.6</strong> &nbsp;·&nbsp; HTML and embedded CSS outline
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
| **Tabs & split editing** | Work with multiple files in two resizable panes and compare a document with its saved version. |
| **Visual conflict resolution** | Compare external file changes with your edits, copy individual changes, and save your chosen result with another check for newer changes. |
| **Quick navigation** | Jump to files or lines, switch languages and find commands through the command palette. |
| **Document outline** | Filter and jump between Markdown headings, JavaScript/TypeScript symbols, PHP/Python declarations, HTML elements and CSS selectors, including CSS inside HTML `<style>` blocks, from the sidebar. |
| **Project search & replace** | Search across files and unsaved drafts, preview replacements and choose which files to change. |
| **Code assistance** | Use syntax highlighting, automatic language detection, multiple cursors, Emmet expansion and optional language-server completion on desktop. |
| **Formatting** | Format code with Prettier, enable format on save and choose your indentation and line-width preferences. |
| **File Explorer** | Create, rename and organise files and folders with context actions, drag-and-drop moves and recoverable deletion. |

## Write, preview & export

- **Markdown workspace** — Write with a live, resizable preview and formatting tools for headings, emphasis, links, images, code, lists, checklists and tables.
- **HTML & PDF export** — Turn Markdown drafts into styled documents with local images included. Desktop saves PDFs directly; the web edition uses the browser print dialog.
- **Desktop live preview** — Preview HTML, CSS and JavaScript changes in your browser as you type, including unsaved edits. Preview saved PHP files with a local PHP runtime.

## Make it yours

- **Custom themes** — Choose syntax palettes inspired by familiar editors, create your own, and import or export theme files.
- **Independent interface colours** — Personalise light and dark modes, panel colours, accents and Explorer icon palettes.
- **Colour tools** — Edit colours with the built-in mixer and display colour values as inline swatches or coloured backgrounds.
- **Personal preferences** — Adjust editor and interface fonts, word wrap, minimap and project-specific editing settings. Use the interface in **English** or **Portuguese (Portugal)**.

## Keep your work close

- **Session recovery** — Restore your tabs, unsaved drafts and pending edits when you reopen the app.
- **Local history** — Browse saved versions, compare them with your current draft and restore changes with Undo support.
- **Recent workspaces & favourites** — Return to recent projects and save favourite local folders or remote servers.
- **Remote folders** — Edit directly over **FTP, SFTP or SMB** on desktop, with optional encrypted credential saving and checks for server-side changes before saving.
- **Connection activity** — See server state, transfer progress and failed operations in the Connections sidebar. Reconnect sessions and retry supported operations without leaving the editor. See [sidebar panels](docs/sidebar-panels.md).

## Desktop or browser

**Linux** ships as a Flatpak or AppImage. **Windows** ships as a portable executable: **no installation required**.

The **web edition** is an installable, offline-capable app with browser workspaces, folder and ZIP import/export, and direct local file or folder access where the browser supports it.

## Build packages on GitHub

The [desktop workflow](.github/workflows/build-desktop.yml) builds x64 Windows portable EXE, Linux Flatpak and Linux AppImage packages, plus a source archive.

- **Try a build:** push the workflow to your default branch, open **Actions → Build desktop packages → Run workflow**, and select a branch. Download the packages from **Artifacts** on the completed run (kept for 14 days).
- **Prepare a release:** commit the desired version and push a matching tag, for example `git tag v1.1.6` followed by `git push origin v1.1.6`. The workflow checks that the tag matches `package.json`, builds the packages, and attaches them to a **draft** GitHub Release. Review the draft under **Releases** and publish it when ready. Re-running the workflow can replace assets in an existing draft; published releases are left intact.

GitHub Actions must be enabled for the repository. The workflow uses GitHub's built-in token; no personal access token is required. Windows packages are unsigned unless you configure code signing.

For local builds, use Node.js 24, run `npm ci` and `npx --no-install install-electron --no`, then `npm run dist:windows` on Windows, `npm run dist:appimage` on Linux, or `bash scripts/build-flatpak.sh` for Flatpak (including runtime setup). `npm run dist:linux` builds both Linux formats once the Flatpak prerequisites are installed. Outputs go to `release/`.
