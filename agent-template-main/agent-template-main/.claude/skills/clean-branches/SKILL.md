---
name: clean-branches
description: Delete all merged branches from the repo — both remote and local. Checks each non-main branch against main, merges any unmerged ones first (after confirmation), then deletes all. Use when user says "clean up branches", "delete merged branches", "prune branches", or invokes /clean-branches.
---

# Clean Branches

Deletes all non-main branches, merging any unmerged ones first.

## Steps

### 1. Discover branches

```bash
git fetch --prune origin
git branch -a
```

List all remote branches (from `mcp__github__list_branches` if available) and all local branches.

### 2. Classify each branch

For each non-main branch, check if it has unmerged commits:

```bash
git log main..origin/<branch> --oneline
```

- **0 commits ahead of main** → already merged or superseded → safe to delete
- **1+ commits ahead of main** → unmerged → must merge first

### 3. Merge unmerged branches

For each branch with unmerged commits:
- Show the user the diff stat: `git diff main...origin/<branch> --stat`
- Confirm there are no merge conflicts: `git merge-tree $(git merge-base main origin/<branch>) main origin/<branch>`
- Create a PR using `mcp__github__create_pull_request` (base: `main`, head: `<branch>`)
- Review the diff via `mcp__github__pull_request_read` with method `get_diff`
- If code compiles and no features are removed, merge via `mcp__github__merge_pull_request` with `merge_method: "squash"`

### 4. Delete branches

**Remote deletion** — use `git push origin --delete <branch>`. If that returns a 403 (environment proxy blocks it), note that the user must delete from the GitHub web UI (Branches tab or the closed PR's "Delete branch" button).

**Local deletion** — after remote is handled:
```bash
git branch -d <branch>   # safe delete (refuses if unmerged)
git branch -D <branch>   # force delete (use only after confirming merged)
```

Skip deleting the currently checked-out branch. Switch to `main` first if needed:
```bash
git checkout main
```

### 5. Report

Print a summary table:

| Branch | Action taken |
|--------|-------------|
| `feat/xyz` | Merged (PR #N) + deleted |
| `fix/abc` | Already merged + deleted |
| `feature/old` | Deleted (0 commits ahead of main) |

If any remote deletions failed due to 403, list them explicitly so the user can delete them manually.

## Constraints

- Never delete `main`
- Never delete a branch with uncommitted local-only changes
- If `git push --delete` fails with 403, do not retry — the proxy blocks it. Report the branch name so the user can delete it via GitHub UI.
- The GitHub MCP server does not have a delete_branch tool — remote deletion must go through `git push origin --delete`
