# Remote folders

Use **File → Open Remote Folder…**, the Explorer cloud-folder button or the command palette. Enter an address and choose **Connect**:

```text
ftp://server.example/project
sftp://user@server.example:2222/home/user/project
smb://server.example/share/project
```

FTP, SFTP and SMB connections run directly inside Jotta Edit on Linux, Windows and macOS. The packaged app includes the protocol clients. No KIO, GVfs, Python, mount driver, desktop file manager or desktop portal is used to connect, browse or edit remote folders. Flatpak requires its existing network permission. Rebuild/update an installed Flatpak to use this implementation.

For hosting aliases, you can also connect directly to an address such as `ftp://server.example/public_html`. FTP resolves a selected directory using the server's CWD/PWD response, including aliases whose listing exposes a physical server path.

FTP enters each directory before requesting its listing, including the LIST fallback, and restores the previous working directory afterward. This also supports servers that ignore directory arguments on listing commands.

Expanding an empty or unscanned Explorer folder requests its immediate contents again. Child folders load when expanded, so a cached empty result can recover without reopening the workspace. An intentionally shallow listing does not report the file limit as reached.

The folder opens in the ordinary Explorer. Files are read from the server as needed; the app does not download a project copy or mount a drive. Local **Open Folder** uses an in-app browser with an editable path, home/parent navigation and a hidden-folder option. That browser only sees locations allowed by the app's filesystem permissions; remote connections do not require filesystem grants.

## Signing in

Use **Username** and **Password**, or include the username in the address. The field overrides an address's username. Keep passwords in the Password field. FTP supports anonymous access when the username is empty. SFTP requires a username and password. SMB uses NTLMv2; use `DOMAIN\username` for a domain account or `username` for a local/workgroup account. Include the SMB share name in the address. Custom ports are supported.

Passwords are cleared from the dialog immediately on submission and when closing it. The client retains the password in process memory for the active connection, including SMB authentication. Passwords are never placed in URLs, process arguments, environment variables or error messages. Unless you explicitly select **Save credentials**, closing the application drops the credentials; reconnect after restarting.

## Favourites and saved credentials

Open **File → Favourites…**, the Explorer star button or the command palette to manage local folders and remote servers. Choose **Add current folder**, **Add local folder…** or **Add remote server…**. Local favourites reopen their folder; remote favourites fill the connection dialog with the saved address and username. The welcome screen also shows your first four favourites. Removing a favourite does not delete workspace files.

In **Open Remote Folder**, select **Save to favourites** to remember the address after a successful connection. Select **Save credentials** to also remember the username and password. These options are off by default for a new connection. When reopening a favourite, saved credentials are used inside the desktop process; the password field stays empty. To update them, enter a new password, select **Save credentials** and connect again.

Saved credentials are encrypted with Electron [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), backed by Windows DPAPI, macOS Keychain or the available Linux credential store. On Linux, saving credentials is disabled if the store is unavailable or Electron selects its plaintext fallback. You can still save addresses and enter passwords each time. Flatpak builds include access to Secret Service and KWallet; rebuild an existing installation to apply those permissions. Protection follows the operating system's credential-store guarantees; other software running as the same user may have access depending on the platform.

Choose **Delete credentials** beside a server in Favourites to forget its saved login while keeping its address. Removing the favourite also removes its encrypted credentials. Both actions work even if the credential store is locked or unavailable. Deletion does not disconnect an active session; close the app to end that connection.

Desktop favourites and encrypted credentials are stored in `favourites.json` in the application's per-user data directory. Passwords are never stored as plaintext in settings or browser storage. Writes use a private temporary file and replacement rename. Favourites are separate from recent workspaces, so clearing recents does not remove them.

On the first SFTP connection, the app displays the server's SHA-256 host-key fingerprint. Verify it against a trusted source before choosing **Trust server key**. Approved fingerprints are saved locally and checked on future connections. A changed fingerprint requires explicit approval again. This prompt uses the app interface and does not open an operating-system dialog.

FTP uses the server's plain FTP protocol; choose SFTP when encryption is needed. SMB signing is required, and SMB encryption is negotiated when offered. The bundled SMB client supports SMB 2.1 and 3.x with NTLMv2; Kerberos, DFS referrals and NetBIOS/139 are not supported. Authentication through a desktop credential store or SSH agent is not required or used.

## Editing and saving

Remote folders support Explorer listing, file tabs, project search, create/rename/move commands, Markdown images and local history. Static HTML Live Preview can read remote assets; local PHP execution and external language servers require a local workspace. The 5 MiB file limit and an 8,000-file limit per Explorer scan still apply. Reaching the file limit keeps later sibling folders visible; expanding an unscanned folder loads it separately. FTP and SFTP directory/file links resolve within the open workspace, so hosting aliases such as `public_html` can be browsed and edited. FTP uses LIST metadata when MLSD omits a link target. If a directory target is still missing or names an inaccessible physical server path, FTP verifies the alias with CWD/PWD and uses its accessible FTP path. Unresolvable, cyclic and outside-workspace links remain visible with an explanation. Open a link directly as the connection address to use its target as the workspace root. Source links themselves cannot be renamed or deleted. SMB reparse points remain unsupported. Inaccessible folders stay listed with their access error.

**Save** checks the current server content against the last saved text, uploads a uniquely named staging file beside the destination, checks again for server edits, renames it over the destination, and reads it back to verify the result. SFTP uses the OpenSSH POSIX rename extension for replacement; a server lacking this extension reports a save error and retains the original file. SMB uses exclusive creation, write-through staging and replacement rename. FTP relies on its server's rename behavior. These checks do not provide server-side locking against concurrent writers.

Failed writes, stale files, unsupported replacement renames and verification errors leave the buffer unsaved. An interrupted connection can fail after the server accepted a write; reconnect and inspect the server version before retrying. The app never deletes the destination to work around a failed replacement. Server durability follows the protocol and server behavior; FTP and SFTP completion is not a guarantee of disk flush. SFTP preserves file mode bits when staging; FTP/SMB permissions follow server defaults and ACL inheritance.

Remote **Delete** moves the entry into `.jotta-trash` inside the workspace with a unique prefix. It does not call system Trash or permanently delete the entry. Restore an item by moving it back and removing the prefix, using hidden files in the Explorer or another client. This requires rename permission and permission to create the trash directory. Local deletion still uses system Trash.

Connections time out after 45 seconds; individual filesystem operations after 30 seconds. Cancel closes the pending connection and ignores late responses. Remote paths remain stable for tabs, history and recent workspaces when reconnecting to the same address and username. After restarting, reconnect using **Favourites** or **Open Remote Folder** before opening those files. Saved credentials are used only when reopening the corresponding favourite.

## Web/PWA

Browsers cannot directly connect to these protocols. The remote command is hidden in the web app. Use the desktop build for direct server access. Browser **Open Folder** continues to use browser filesystem permissions. Local favourites are available in the browser and retain workspace identifiers; reopening may require granting folder access again. Remote favourites and credential saving require the desktop build.

## Implementation references

The app bundles [basic-ftp](https://github.com/patrickjuchli/basic-ftp), [ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client) and [smb3-client](https://github.com/euricojardim/smb3-client). The SMB adapter extends the pinned client's signed/encrypted wire operations for exclusive staging, reparse-point metadata and replacement rename. These clients are runtime dependencies included in the desktop package, not host tools.

## Validation

If an FTP folder expands with no contents and no error, run `node scripts/diagnose-ftp.cjs` from the source directory. Enter the full folder address (for example `ftp://server.example/public_html`) and credentials at its prompts. The password prompt is hidden. This read-only diagnostic compares MLSD, LIST, NLST, the application filesystem and Explorer filters. Its report contains counts and numeric error codes, without paths, filenames or credentials. Share the report to identify which layer loses the entries.

`npm test` includes a real loopback SFTP server and filesystem/UI regression tests. Optional loopback FTP and SMB integration tests use Python development fixtures, which are excluded from application runtime requirements:

```sh
python3 -m pip install --target /tmp/jotta-protocol-test-libs pyftpdlib impacket
JOTTA_PROTOCOL_TEST_PYTHONPATH=/tmp/jotta-protocol-test-libs node --test tests/direct-remote-folders.test.cjs
```

These fixtures bind only to `127.0.0.1` and use temporary files and fixed test credentials. They verify listing, reads, staged replacement saves, creation, rename, recoverable deletion, stale-content rejection and failed authentication. They do not connect to personal servers.
