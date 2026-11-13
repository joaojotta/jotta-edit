# Git and GitHub workflow

The desktop app can inspect local Git repositories using the Git installed on your computer. Open a repository folder, or a saved file inside one. The status bar shows the current branch; detached checkouts show **Detached HEAD** and a short commit ID. Multiple workspace folders can belong to different repositories. Select a file or folder to switch the branch display to its repository.

## Current project

Simple actions use the current branch’s configured upstream, or `origin` and the current branch name when no upstream is configured. Manual target selections remain in Advanced.

The Git sidebar opens in a simple mode focused on the repository containing your active file (or your current project folder). It shows the current branch, target, and incoming/outgoing commit counts from the last fetch. **Check for updates** refreshes those counts without changing files.

1. Review the **Changed files** list. Click a file to compare it with the last commit.
2. Enter a **Commit message** and choose **Save and commit all**. This saves open documents, stages all reviewed changed files (including new files), and creates a local commit. The entire displayed repository is used, including when you opened a subfolder. Review `.gitignore` and changes before committing.
3. Choose **Update project** to fetch and integrate the target branch. Saved documents and a clean working tree are required. The app fast-forwards when possible and otherwise creates a merge commit preserving local and remote history. It does not force-push, rebase, stash, or discard changes automatically.
4. Choose **Upload commits** to push the current branch. If GitHub rejects an upload because new commits arrived, use **Update project**, then retry the upload.

When an update stops on conflicts, open each conflicted file using **Open file**, edit and save the combined result, then choose **Mark resolved**. Conflict markers must be removed before a text file can be marked resolved. Once all conflicts are resolved, choose **Finish merge**. **Abort merge** returns to the pre-merge commit and discards edits made to resolve that merge; save any unsaved editor buffers first. Binary, submodule and oversized conflicts may need external Git tools.

Expand **Advanced** for GitHub sign-in, cloning, repository creation, remote and identity settings, branch switching, manual staging, staged-only commits, the original fast-forward-only Pull, and Git output. Advanced also lets you select another repository in a workspace. Sign-in remains optional for repositories already using SSH or an existing credential helper.

## Connect GitHub and clone

Open the Git sidebar and expand **Advanced → GitHub connection**. Install [GitHub CLI](https://cli.github.com/) (`gh`) on your computer, then choose **Connect GitHub**. The output shows a one-time code; complete authorization in your browser. **Open verification page** opens GitHub's device authorization page if the browser did not open automatically. On success, Jotta configures GitHub CLI as Git's HTTPS credential helper. GitHub CLI manages credential storage; any storage warnings appear in Git output. Jotta does not request or save your password or copy access tokens into editor settings.

The connection uses the active GitHub.com account in GitHub CLI. **Check connection** refreshes its status. **Sign out** signs that account out of GitHub CLI too; it is a shared login. Existing SSH keys, agents and Git Credential Manager setups remain usable for Git operations without connecting through this panel. GitHub Enterprise account management is not included in this release.

## Publish a project

Open a local project folder, then expand **Advanced → Publish project to GitHub** in the Git sidebar. Select the project folder. If it is inside an existing repository, the picker identifies that repository's full root: publishing includes its committed history, not just the selected subfolder.

For a folder without Git, choose **Initialize Git**. This creates a `main` branch without staging or committing files. If GitHub is connected, initialization sets that account's GitHub `noreply` email and profile name as this repository's commit identity. Otherwise configure **Remote and identity → Commit identity** before committing. Review the changed files and `.gitignore`, stage the files you want to upload, and commit them through the existing controls.

To create a **new** GitHub repository, connect GitHub, enter a repository name and a new remote name (normally `origin`), and choose **Create repository and publish**. Visibility defaults to **Private**; choosing **Public** makes the repository visible to everyone. Jotta creates an empty repository under the connected personal account, adds the remote, then pushes only the reviewed current branch and sets its upstream. Other branches and tags stay local. Publishing requires saved documents, a clean working tree and at least one commit on a branch. Review the committed files and history first: files already committed remain in history even if you later add them to `.gitignore`.

To connect a repository that **already exists**, use **Remote and identity → Connect existing repository**. Enter an unused remote name and an HTTPS/SSH URL or `owner/repository`, then choose **Add remote**. Existing remotes are never replaced. Choose **Fetch** to inspect incoming commit counts, then **Pull** when a fast-forward is possible or **Push** to upload your branch. Unrelated or divergent histories need review with external Git tools.

If creation succeeds but the first push fails, the new GitHub repository and any added remote are kept. The output identifies its URL. Correct the reported problem and use **Push** to retry. If creation itself is interrupted, check GitHub before retrying because the remote request may already have completed.

## Branches

Expand **Branches**, enter a **New branch name** and choose **Create and switch branch** to branch from the current commit. Or choose an existing **Local branch** and **Switch branch**. The editor refreshes clean open documents and Explorer after the switch. A detached checkout can create or switch to a branch too.

Save documents and commit or move all local changes first, including untracked files. An in-progress merge, rebase or cherry-pick blocks branch operations. Jotta checks the reviewed branch and commit before acting, never forces a checkout, and respects branches already checked out in other worktrees. There is no branch deletion or implicit checkout of a remote branch.

Expand **Clone repository** and choose **Load GitHub repositories** to browse repositories your account can access, in pages of 100. Choose a repository, or enter an HTTPS/SSH URL or `owner/repository`. Choose the local parent directory and a new folder name, then **Clone and open**. Existing destination folders are never overwritten. A failed or cancelled clone can leave partial files in its destination; Git output identifies that folder. The editor leaves those files available for inspection. If you changed workspaces during cloning, use **Open cloned repository** when ready.

## Stage and commit

Choose a repository in the Git sidebar. **Staged changes** and **Unstaged changes** are separate lists, and a file can appear in both. Select a file to review that specific difference: staged compares HEAD with the staging area; unstaged compares the staging area with the working file or live editor buffer. **Compare with Git HEAD** remains available for the overall difference.

Use **Stage** / **Unstage**, or **Stage all** / **Unstage all**. Staging saves the selected open documents first through the usual save/conflict checks. Unstaging preserves working files and unsaved buffers. These actions operate on whole files; line and hunk staging are not included.

Enter a commit message and choose **Commit staged changes**. Only staged changes are committed; later edits and other unstaged files remain outside the commit. If staging changed externally since the displayed snapshot, refresh and review it before retrying. Existing hooks and signing settings still apply. If identity is missing, expand **Remote and identity → Commit identity**, enter your name and email, and choose **Save for this repository**; this changes only the repository's local Git configuration.

Choose **Use GitHub private email** to obtain the connected account's `id+login@users.noreply.github.com` address and save it for future commits in this repository. An existing commit name is preserved; if missing, the GitHub profile name is used. Global Git settings and existing commit history are unchanged. If GitHub rejects a push with `GH007`, setting the identity fixes future commits, but you must review and correct the email in already-created unpublished commits with external Git tools before retrying. Jotta does not silently rewrite history or change GitHub privacy settings.

## Fetch, pull and push

Expand **Remote and identity** to choose an existing **Remote** and check the **Remote branch**. The tracking line shows incoming and outgoing commit counts relative to the configured upstream, based on locally fetched information.

- **Fetch** downloads remote history without updating working files.
- **Pull** updates the current branch using fast-forward only. Save documents and commit or move local changes first, including untracked files. Diverged branches stop with an error instead of starting a merge or rebase. Resolve that situation with your existing Git tools.
- **Push** sends the current local branch to the selected remote branch and sets its upstream. Rejected pushes are reported; this interface never requests force push.

The editor checks that the current branch has not changed before committing, pulling or pushing. Detached HEAD cannot commit, pull or push through these controls. Replacing or removing remotes, rebasing and pull requests remain tasks for external Git tools. Text merge conflicts can be resolved through the simple workflow above. Rejected pushes show recovery guidance for private commit emails, authentication problems and divergent histories; existing local commits are kept.

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

Workflow references: [GitHub repository creation](https://cli.github.com/manual/gh_repo_create), [Git branch switching](https://git-scm.com/docs/git-switch), [GitHub commit email](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address), [Git status porcelain output](https://git-scm.com/docs/git-status#_porcelain_format_version_1) and [Git revision syntax](https://git-scm.com/docs/gitrevisions).
