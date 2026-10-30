# Sublime Prototype

A small, from-scratch proof of concept: a Sublime Text-feeling editor built
on Monaco, the open-source editing component that powers VS Code. It is not
a trimmed fork of VS Code itself — no workbench, no extension host, no
textmate-grammar pipeline — just the editing core plus the handful of
Sublime-defining behaviours this prototype set out to demonstrate:

1. Instant startup & large-file speed
2. Distraction-free minimal UI
3. Multiple cursors / multi-select
4. Goto Anything (one box, fuzzy files/symbols/lines)
5. Emmet expansion and inline colour highlighting

## Why Monaco, not a VS Code fork

VS Code's actual repository is the workbench (windows, panels, extension
host, settings sync, marketplace, ...) built *around* Monaco. Forking it to
reach a Sublime-sized app means deleting most of what you forked. Starting
from Monaco directly — the same open-source component, with none of the IDE
scaffolding — gets to "lean, fast, keyboard-first" in a fraction of the code,
and is also exactly what the existing `jotta-edit` project at the repo root
already does. This prototype reuses a few of that project's self-contained,
already-correct utility modules (the fuzzy-match scorer, the symbol-outline
extractor, the Emmet wrapper, CSS colour math) rather than re-deriving
well-tested logic from zero, but the application shell — process structure,
tab/file model, the unified Goto Anything box, distraction-free mode, the
large-file heuristics — is new code written for this prototype.

## How each feature is actually implemented

**Startup.** `electron/main.cjs` creates the `BrowserWindow` and calls
`loadURL` as the very first thing once Electron is ready — before any IPC
handlers are registered — so the renderer starts loading while the (tiny,
synchronous) handler registration finishes on the same tick. There is no
session restore, settings file, or other blocking I/O before the window
exists, unlike heavier editors that read several files before they'll even
paint.

**Large files.** `fs:read-file` reports whether a file is over 2MB; `main.js`
tags that tab `large` and disables minimap, folding and bracket-pair
colourisation for it on activation — the expensive-to-compute decorations,
not the editing itself. Monaco already virtualizes rendering (it only
tokenizes/paints visible lines), so a prototype doesn't need to reimplement
that part; it only needs to stop asking for extra decoration work on files
where that work is wasted.

**Distraction-free mode.** `Shift+F11` toggles a single CSS class
(`body.distraction-free`) that hides the sidebar, tab strip and status bar
and centers the editor in a fixed-width column. No separate "mode" state in
JS — it's a pure CSS concern (`src/style.css`).

**Multiple cursors.** This is almost entirely free from Monaco: Ctrl+D
("add selection to next match"), Alt+click, and column selection are Monaco
defaults. The one deliberate change is `multiCursorModifier: 'ctrlCmd'` in
the editor options, so Ctrl/Cmd+click adds a cursor the way Sublime does
(Monaco's own default binds that gesture to "go to definition," which this
prototype has no language server to serve anyway).

**Goto Anything** (`src/goto-anything.js`) is the one feature with no Monaco
or jotta-edit equivalent to lean on, because jotta-edit — like VS Code —
splits this into separate palettes bound to separate shortcuts (Ctrl+P for
files, Ctrl+G for a line, a document-outline panel for symbols). Sublime
famously unifies all three into one box, disambiguated by a leading
character: `:42` jumps to line 42 of the current file, `@foo` fuzzy-searches
symbols in the current file, anything else fuzzy-searches the open folder's
files (and `path/file.js:42` opens and jumps in one step). That dispatch and
the single-box UI is original to this prototype; it calls into the reused
`fuzzyScore` scorer and `documentOutline` symbol extractor to do the actual
matching.

**Emmet & colour highlighting.** `src/emmet-integration.js` wires the
`emmet` npm package to Tab-expansion using a Monaco context key
(`editor.addAction` with a `precondition`), so Tab only triggers an
expansion when an abbreviation is actually present at the caret — otherwise
it falls through to Monaco's normal indent handling untouched. Colour
highlighting uses Monaco's own `registerColorProvider` API: Monaco renders
the inline swatch and its native colour-picker popup itself; this prototype
only has to find colour literals in the text (`findCssColors`) and format
edited values back (`formatCssColor`).

## What's deliberately out of scope

No extensions/plugins, no build systems, no multi-window session
persistence, no settings UI, no `.sublime-syntax`/textmate grammar loading
beyond what Monaco ships with, no remote files, no Vim mode. These are all
real Sublime features; none of them were in the five requested for this
prototype, and bolting them on would turn "prototype" back into "full
editor."

## Running it

```
cd prototype
npm install
npm run dev        # vite dev server, for iterating on the renderer alone
npm start           # builds the renderer, then launches the real Electron app
```

Requires Node 20.19+/22.12+ (Vite 7's floor) and a machine that can actually
show an Electron window — neither was available in the sandbox this was
built in, so the build was verified up to Vite's module-resolution/transform
stage (1285 modules transformed cleanly) but not run end-to-end. Try it for
real before relying on it.
