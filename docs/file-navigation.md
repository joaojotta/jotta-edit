# File navigation

## Go to Anything

Use **Ctrl+P** for fuzzy file matching and open drafts. Enter `:42` or `:42:8` to jump within the focused editor, `@name` to search its document symbols, or `file.css:42` / `file.css:42:8` to open a matching file at that position. Line and column numbers are one-based and clamp to the document. Symbol navigation shares the document outline's supported languages and size limits. Ctrl+G and the command palette continue to work.

## File picker

Desktop Open File and Open Folder remember separate last-browsed folders on this device. A missing remembered location falls back to Home. Type into **Filter files and folders** to narrow the current listing without another filesystem request.

In Open File, click files to toggle selection, Shift-click to select a range, use **Select visible files** or **Clear selection**, then choose **Open selected files**. Double-click a file to open it immediately. Each selected file is validated before opening the batch. Navigating into another folder clears the selection; filtering keeps selected files included in the selection count. A batch supports up to 50 files within the existing 50-tab recovery limit. Cancel and failed validation preserve the editor's current documents.

The web edition keeps its native multi-file picker and browser-managed directory memory where supported. Browsers control filesystem permissions and picker availability. Remembered desktop directories are excluded from settings exports.

## Automatic refresh

**Preferences → Explorer → Automatically refresh folders and clean files** is enabled by default and is included in settings exports. The visible app checks the project root and expanded folders without rescanning closed subtrees. It checks local work about every 2.5 seconds and remote work less frequently; large sets of expanded folders are checked in bounded batches. Returning to the app requests a fresh check. Hidden pages and open dialogs pause polling.

Changes to a clean open file reload as an undoable edit, preserving cursor and scroll positions in both panes. Undo makes the restored old contents unsaved against the new disk version. Dirty files keep their buffers and saved baselines; external changes enter the existing conflict-review flow. Save still performs its own fresh conflict checks.

Files renamed or deleted externally disappear from Explorer, while their open buffers remain as unsaved **Missing** tabs. Use Save As to preserve a copy. Permission failures and disconnected servers leave buffers and existing folder listings intact. Automatic refresh does not infer that a new filename belongs to an old tab.

## Breadcrumbs and tabs

The path above the editor follows the focused pane. Click a folder to browse its immediate contents. Select a subfolder to navigate deeper, use **Parent folder** to go back, or **Reveal in Explorer** to expand and focus that folder. Opening a contents popup does not change the workspace. Revealing a folder outside the current workspace opens that folder in Explorer and preserves open tabs.

Breadcrumb browsing respects the hidden-file preference, shows access errors and works with local desktop folders, browser workspaces and connected remote folders. Workspace breadcrumbs stop at the workspace root. Standalone browser files show their filename because opening a file does not grant access to its parent folder. Navigate the popup with Tab or arrow keys and close it with Escape.

Single-click a file in Explorer or a breadcrumb popup to open an italic **preview tab**. Another preview in that editor pane replaces it after the new file loads successfully. Double-click its file or tab, edit it, save it, or use **Keep preview tab open** in the command palette to keep it open. File pickers, search results and explicit open commands open permanent tabs. Dirty, pinned and shared files are never discarded by preview navigation.

Hover over a tab to show its pin button. Pinned tabs stay at the start of the tab strip and remain pinned across restarts, including pinned unsaved drafts. Click the pin again to unpin without closing the file, or use **Toggle pin on active tab** in the command palette. Closing a pinned tab explicitly still works and uses the existing unsaved-changes prompt.

Each split pane can own a preview. If a preview is also visible in the other pane or a comparison, it becomes permanent instead of being replaced. Recovery keeps preview files as regular tabs; it restores pinning and unsaved contents.

## Multiple project folders

Use **File → Add Folder to Workspace…** or the Explorer's Add Folder button to retain the current roots while adding another folder. Desktop also has **File → Add Remote Folder to Workspace…** for FTP, SFTP and SMB. **Open Folder…** replaces the root list while preserving open documents. A workspace supports up to 20 non-overlapping roots.

With multiple roots, Explorer shows each folder as a separate expandable row. Hover for its full path. Quick Open and project-search results include the folder name; search and replacement use all roots, including unsaved buffers. Replacements retain the existing preview, Undo and guarded-save behavior. An inaccessible root leaves other roots usable, and partial search results are labelled.

Select a file to use its folder's editor preferences. Split panes keep their own wrapping and indentation settings. The root list and selected folder are restored with the editing session. Use a root row's remove button to remove that folder from Explorer; its open documents remain available. Root rows cannot be renamed, deleted or dragged as ordinary entries. Moves between separate roots are rejected.

Browser folder permissions remain subject to browser approval. The receiving root's retained directory handle is used for file operations, even when another folder is active. Workspace paths remain excluded from global settings exports.

## Keyboard shortcuts

Open **Preferences → Shortcuts**, or use **Keyboard shortcuts** in the Edit menu or command palette. Filter by command name, select its shortcut field and press the desired combination, then click **Assign**. A conflict identifies the command already using that combination and prevents assignment. Use **Unassign**, **Reset**, or **Reset all shortcuts** to change the defaults. Escape cancels a recording; Tab moves to the next control.

Shortcuts apply immediately and persist on this device. Menu, command-palette and toolbar hints follow assigned bindings. Ctrl represents the primary command modifier (⌘ on macOS); modifier-only keys, ordinary typing and AltGraph/composition are not recorded as commands. The editor manages Jotta Edit's command bindings; additional Monaco editing shortcuts remain available unless a command takes that combination. Browsers and operating systems can reserve some key combinations.

Overrides are included in settings exports and validated for command names, key combinations and conflicts before import. Folder paths and recovery content are not included.
