# GitHub sync in Jotta Edit 1.1.0

Open the **Git** button beside Explorer or **File → GitHub sync**.

1. Choose **Create a token…** and create a fine-grained personal access token. Select the repository owner, only the repositories you want to use, an expiry date, and **Contents: Read and write**. Editing workflow files may also require **Workflows: Read and write**. Organization approval or branch rules may restrict updates.
2. Paste the token into the password field and choose **Connect GitHub**. The app validates the account and lists repositories. You can also enter `owner/repository` manually, then **Load branches**.
3. Choose a branch. The repository needs an initial commit; create it with a README on GitHub if it is empty.
4. Use **New checkout…** to select a desktop folder or create a browser workspace. You may also review the currently open folder. Desktop folders must not contain `.git`; use a separate folder from any existing Git checkout.
5. **Review changes** fetches the branch and compares it with the last synchronized version and your saved workspace. Save or discard open workspace edits before reviewing/syncing. Click a path to preview the GitHub and local versions. Images and other binary files are included and identified as binary.
6. Incoming files apply on **Pull updates** or **Commit & sync selected**. Select outgoing files to commit; tracked edits are selected initially, while new files require selection. Choose **Keep local version** or **Use GitHub version** for every conflict.
7. Enter a commit message and choose **Commit & sync selected** to create a commit and push it to the selected branch. **Pull updates** applies incoming changes and keeps local edits uncommitted. A branch selection change is reviewed against the previous synchronized content.

The app uses GitHub's Git database API, including a non-forced branch update. It does not install Git, change Git credentials, initialize `.git`, or modify a separate Git checkout. Sync is explicit: local saves do not automatically publish code. Repository settings and the last synchronized file hashes are stored locally; tokens remain in memory only and are cleared on disconnect or app exit/reload.

## Limits and recovery

- GitHub.com, initialized repositories, existing branches and regular files are supported. Symlinks, submodules, unsafe paths and case-colliding paths are rejected. Protected branches may require a different branch or workflow outside this first integration.
- A workspace supports up to 2,000 files, 5 MiB per file and 40 MiB total. Incomplete GitHub trees are rejected. New generated directories such as `node_modules`, `vendor`, `dist`, `web-dist`, `release`, and `build` are excluded; files already tracked by the baseline or remote are still considered. This is a managed sync workflow, not a full `.gitignore` or Git CLI implementation. If a limit is exceeded, the error identifies the path and whether the cause is file size, total size or file count. Choose a smaller workspace or keep large untracked build outputs outside the source folder; tracked files are never silently excluded.
- Browser sync applies batches atomically in IndexedDB. Use a browser-managed checkout, then Export ZIP if you need an external copy; direct browser folder workspaces are not sync targets in this release.
- Desktop sync stages new files and recovery copies before applying updates. A failed write rolls back the batch. If rollback fails, the error identifies the `.jotta-sync-*` folder containing recovery files; retain it until recovery is complete.
- If files change after review, refresh before retrying. Remote branch changes cause the push to fail without force-pushing. If the commit succeeded but the local update did not, the status explicitly reports that the commit was pushed; refresh and complete the local update.
- Incoming edits update clean open tabs. Edits made while a sync finishes remain in the editor; saves and session recovery continue to work normally.

## Validation

Unit tests use a simulated GitHub API and temporary local folders. UI checks use simulated GitHub responses and real browser storage. No test uploads user code, connects a real account, or pushes to a live repository.

References: [fine-grained tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [Git database API](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database), [Git references](https://docs.github.com/en/rest/git/refs), [browser CORS support](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests).
