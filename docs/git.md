# Git and GitHub workflow

The desktop app can inspect local Git repositories using the Git installed on your computer. Open a repository folder, or a saved file inside one. The status bar shows the current branch; detached checkouts show **Detached HEAD** and a short commit ID. Multiple workspace folders can belong to different repositories. Select a file or folder to switch the branch display to its repository.

## Connect GitHub and clone

Open the Git sidebar and expand **GitHub connection**. Install [GitHub CLI](https://cli.github.com/) (`gh`) on your computer, then choose **Connect GitHub**. The output shows a one-time code; complete authorization in your browser. **Open verification page** opens GitHub's device authorization page if the browser did not open automatically. On success, Jotta configures GitHub CLI as Git's HTTPS credential helper. GitHub CLI manages credential storage; any storage warnings appear in Git output. Jotta does not request or save your password or copy access tokens into editor settings.

The connection uses the active GitHub.com account in GitHub CLI. **Check connection** refreshes its status. **Sign out** signs that account out of GitHub CLI too; it is a shared login. Existing SSH keys, agents and Git Credential Manager setups remain usable for Git operations without connecting through this panel. GitHub Enterprise account management is not included in this release.

Expand **Clone repository** and choose **Load GitHub repositories** to browse repositories your account can access, in pages of 100. Choose a repository, or enter an HTTPS/SSH URL or `owner/repository`. Choose the local parent directory and a new folder name, then **Clone and open**. Existing destination folders are never overwritten. A failed or cancelled clone can leave partial files in its destination; Git output identifies that folder. The editor leaves those files available for inspection. If you changed workspaces during cloning, use **Open cloned repository** when ready.

## Stage and commit

Choose a repository in the Git sidebar. **Staged changes** and **Unstaged changes** are separate lists, and a file can appear in both. Select a file to review that specific difference: staged compares HEAD with the staging area; unstaged compares the staging area with the working file or live editor buffer. **Compare with Git HEAD** remains available for the overall difference.

Use **Stage** / **Unstage**, or **Stage all** / **Unstage all**. Staging saves the selected open documents first through the usual save/conflict checks. Unstaging preserves working files and unsaved buffers. These actions operate on whole files; line and hunk staging are not included.

Enter a commit message and choose **Commit staged changes**. Only staged changes are committed; later edits and other unstaged files remain outside the commit. If staging changed externally since the displayed snapshot, refresh and review it before retrying. Existing hooks and signing settings still apply. If identity is missing, expand **Remote and identity → Commit identity**, enter your name and email, and choose **Save for this repository**; this changes only the repository's local Git configuration.

## Fetch, pull and push

Expand **Remote and identity** to choose an existing **Remote** and check the **Remote branch**. The tracking line shows incoming and outgoing commit counts relative to the configured upstream, based on locally fetched information.

- **Fetch** downloads remote history without updating working files.
- **Pull** updates the current branch using fast-forward only. Save documents and commit or move local changes first, including untracked files. Diverged branches stop with an error instead of starting a merge or rebase. Resolve that situation with your existing Git tools.
- **Push** sends the current local branch to the selected remote branch and sets its upstream. Rejected pushes are reported; this interface never requests force push.

The editor checks that the current branch has not changed before committing, pulling or pushing. Detached HEAD cannot commit, pull or push through these controls. Creating and switching branches, managing remote URLs, interactive merge resolution, rebasing and pull requests remain tasks for external Git tools.

Git output streams progress and errors. **Cancel Git operation** stops the running command and its child processes. Only one write/network operation runs at a time. Cancellation is not an undo: staging, commits or transfers that already completed remain applied. Refresh and review the repository after interruption.

Open **View → Git changes**, select the **Git** sidebar tab or click the branch in the status bar. The Changes sidebar includes modified, added, deleted, renamed, copied, untracked and conflicted paths. Filter by filename or change type. Ignored files are omitted. Explorer and file tabs show corresponding **M**, **A**, **D**, **R**, **C**, **?** or **!** badges; changed directories receive a dot. The existing unsaved-document dot continues to describe edits held in memory.

## Compare with the last commit

Use **View → Compare with Git HEAD** for the active file. The command is also in the command palette and can receive a shortcut in Preferences → Shortcuts. Selecting a file in the staged or unstaged list opens that list's comparison instead, as described above.

The left side shows the file from the last commit (**HEAD**), including changes already staged elsewhere. It is not a comparison against the staging area. The right side uses the live editor buffer when that file is open, including unsaved edits, or the current disk contents otherwise. The header identifies the commit and whether the right side is an editor buffer, working file or deleted file.

Comparisons are read-only. Use **Open working file** to edit normally, or **Close** / **Escape** to return. Deleted-file comparisons show an empty working side without creating a new file or tab. A staged rename uses the old committed path as its baseline. Files absent from HEAD, including untracked files and repositories without commits, compare against an empty baseline. Existing open buffers from deleted files remain available and are identified as editor buffers.

Text comparisons support files up to the existing 5 MB editor limit. Binary files, symbolic links and submodule entries do not support text comparisons. Submodule contents are not scanned as part of their containing repository; open a submodule repository directly to inspect its files. File-mode-only changes may have identical text on both sides.

## Refresh and platform support

Git status refreshes after local watcher notifications, when returning to the app, and periodically while the window is visible. Git metadata directories are included in the existing bounded local watch coverage so external branch changes, commits and index updates are detected. Choose **Refresh Git status** in the sidebar or command palette at any time. Unchanged refreshes preserve the current Changes list.

In Flatpak, Git runs on the host through the same host-tool mechanism used by C/C++ tools. Install Git on the host. Direct desktop builds use Git on PATH. Missing executables and repository errors appear in the Changes sidebar. Git integration is unavailable for remote folders and in the browser edition.

Status and comparison reads keep optional Git index refresh writes and external filesystem-monitor commands disabled. Explicit workflow actions perform the requested changes. Git's normal repository ownership checks remain in effect. GitHub CLI is optional unless using account sign-in and repository browsing. Network commands allow up to ten minutes and can be cancelled; missing tools, authentication failures, signing or hook failures appear in Git output. This workflow is desktop-only; browser and remote-folder adapters do not expose Git writes.

Workflow references: [VS Code source control](https://code.visualstudio.com/docs/sourcecontrol/overview), [Git status porcelain output](https://git-scm.com/docs/git-status#_porcelain_format_version_1) and [Git revision syntax](https://git-scm.com/docs/gitrevisions).
