# Language tools

Open **View → Problems** (**Ctrl+Shift+M**) to inspect errors, warnings and information in open documents. Filter by message, source or filename, and select a problem to jump to its location. The panel includes Monaco's built-in JavaScript/TypeScript, JSON, CSS and HTML diagnostics on desktop and web.

Use **Go → Go to Definition** (**F12**) or **Go → Rename Symbol** (**F2**) in an editor. These commands also appear in the command palette, the editor context menu and Preferences → Shortcuts. F2 in Explorer continues to rename files.

## Optional desktop language servers

Install a language server using your operating system's or language's package manager, then open **Preferences → Language servers**. The page shows whether each executable is available and whether a server has started. Select an executable, enter arguments, enable or disable servers and choose **Apply language servers**. Applying changes restarts running servers and resynchronizes open documents; it does not download software. **Check availability** refreshes the status. Hover over a status to inspect a startup error.

| Language | Default command |
| --- | --- |
| Python | `pylsp` |
| PHP | `intelephense --stdio` |
| Go | `gopls serve` |
| Rust | `rust-analyzer` |
| C / C++ | `clangd --background-index` |
| Ruby | `solargraph stdio` |
| Lua | `lua-language-server` |

Executables and arguments have separate fields; executable paths can contain spaces. Quote arguments containing spaces. Commands are launched directly. For a Node-based server on Windows, you can select `node.exe` and supply the server's JavaScript entrypoint in Arguments.

In Flatpak, availability checks and server processes run on the host using the existing host-tool permission. Configure paths visible to the host. Connected remote folders do not launch language servers. External language-server document synchronization supports text up to one million UTF-16 code units; larger files remain editable with their existing syntax highlighting. Diagnostics and navigation depend on the installed server's capabilities. JavaScript/TypeScript and web-language tools continue to use Monaco's built-in services.

The desktop settings are stored in the existing user-data `lsp.json` configuration. Machine-specific server commands are not included in global settings exports.

## Diagnostics and rename safety

Saved local documents synchronize with their language server after typing pauses, so diagnostics do not require saving or requesting completion. Closed documents are released. Versioned diagnostics from older edits are discarded, and changing a buffer clears its previous external diagnostics while the server catches up.

Rename Symbol synchronizes open buffers first and checks every returned edit before applying it. Affected files open as tabs, their models retain Undo, and **nothing is written to disk until you save**. Existing guarded saves still check for external changes. A rename is rejected if a buffer changes while the result is being prepared, a server supplies unsupported file operations, ranges overlap or the edit would exceed tab or recovery limits. Use Undo in each affected tab to reverse its changes.

## File refresh

The existing **Preferences → Explorer → Automatically refresh folders and clean files** setting controls both watchers and polling. Desktop watches workspace roots, expanded local directories and parents of open files. Watching the parent directory catches applications that save by replacing a file. Notifications are combined before refreshing; clean buffers reload, while dirty buffers retain the existing conflict-review behavior.

Quiet, fully watched local workspaces receive fallback checks every 30 seconds. Failed or unsupported watches retain 2.5-second checks; connected remote workspaces keep 10-second checks, and the browser retains its existing polling. Returning to the app performs a fresh check. Hidden windows and disabled refresh release local watches. Watch coverage is bounded to 256 directories; larger sets keep regular polling as a fallback.

Implementation references: [Language Server Protocol](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) and [Node filesystem watch caveats](https://nodejs.org/api/fs.html#caveats).

## Integration checks

The regular test suite uses deterministic test servers, including servers that ignore shutdown or leave children holding pipes. It does not require an installed C/C++ language server. To additionally test the installed `clangd`, run `JOTTA_LSP_INTEGRATION=1 node --test tests/lsp.test.cjs`. Availability checks and server shutdown have time limits so an external tool cannot leave the build waiting indefinitely.
