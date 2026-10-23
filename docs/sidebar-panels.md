# Document outline and remote connections

Use the **Outline** and **Connections** controls below the Explorer toolbar, **View → Document outline / Remote connections**, or the command palette. Explorer, project Search and these panels share the sidebar; choosing one replaces the current sidebar view. The sidebar's existing resize and show/hide controls still apply.

## Document outline

Outline follows the document in the focused editor, including either pane of a split editor and unsaved changes. Click an entry to jump to its source position. Its line number appears at the right; the current section is highlighted. Type in **Filter outline** to narrow the list, or use **Refresh outline** to request a fresh outline. Arrow keys, Home and End move between focused outline entries; Enter activates a focused entry.

Supported documents:

- Markdown: ATX (`# Heading`) and setext headings, with heading levels shown by indentation. Fenced/indented code and front matter are excluded.
- JavaScript and TypeScript: functions, methods, classes and other symbols provided by the language service.
- PHP and Python: named function and class declarations, excluding comments and quoted strings.
- CSS, SCSS and Less: selectors and grouping rules such as media queries, including nested selectors.

Outline works on desktop and in the web app. It displays up to 1,000 entries and supports documents up to 2 MiB. Unsupported documents and documents without entries show an explanation. Editing or switching documents invalidates old results, so a late outline response cannot navigate to an outdated position.

## Remote connections (desktop)

Connect normally through **Open Remote Folder…** or Favourites. The Connections panel lists servers and their connection state, followed by recent file activity. It shows queued/running operations, downloaded/uploaded bytes, save verification phases, completed work and failures. Progress reflects data moving through the protocol client; a save is complete only after its server checks, replacement and verification finish. A connected state describes the current transport, not a continuous server health check.

**Reconnect** reuses the credentials already held by that desktop session and preserves its workspace paths and open buffers. It opens the connection dialog so changed SFTP host keys can still be verified. Reconnect is disabled while that server has pending file operations. If an initial connection failed before a session was created, the button opens the ordinary connection dialog for another attempt. After restarting the app, use Favourites or Open Remote Folder as usual.

Failed file reads and folder listings offer **Retry**. Reads reopen the text file or focus its existing tab without replacing unsaved text; listings reload the requested folder and refresh the current Explorer. **Retry save** saves the affected open buffer through the ordinary save path, including checks for server edits. A stale or ambiguous save remains unsaved until you compare/reload and resolve the conflict. Closing a tab does not leave behind a replayable copy of its contents; reopen the file before retrying its save.

Create, move and trash failures remain visible for review in Explorer; they are not replayed automatically because the server might already have applied them. **Dismiss** removes a failed activity entry. **Clear completed** removes completed entries while preserving failures and pending work. The panel retains the latest 60 finished operations plus ongoing operations for the current app session. Its state contains server addresses, workspace paths and progress metadata, never passwords or file contents; credentials continue to follow the existing connection and Favourites rules.

The web build hides Connections because browsers cannot directly connect to FTP, SFTP or SMB.

## Validation

Tests cover Markdown/code/CSS parsing, outline limits and stale results, exclusive sidebar views, operation state transitions, byte progress, sanitized failures, bounded activity history, reconnect and retry behavior. A local SFTP fixture exercises real streamed downloads, guarded uploads and reconnects. Desktop smoke checks exercise the actual Monaco JavaScript worker, CSS outline, heading navigation and the connection panel using an isolated app profile.
