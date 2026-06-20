---
name: work-issues
description: Scan the repo's open GitHub issues and drive every actionable one end to end — branch → code + unit tests → validate → security scan → PR → CI → merge → close — then leave the working tree clean (back on main, branches pruned, nothing uncommitted). Use when the user says "work the issues", "clear the issue backlog", "ship all the open issues", or invokes /work-issues. This is the autonomous, merge-included sibling of idea-to-pr (which starts from a single idea and stops at human gates).
---

# work-issues

A **thin orchestrator** that empties the open-issue backlog autonomously. It
discovers issues, triages them into what an agent can safely action, then runs the
full **idea → dev → unit test → security → PR → merge → deploy** loop per issue and
finishes with a **clean working tree**. It conducts skills you already have — it
does not re-implement them.

The work lives in `/triage` (`agents/dev-team/issuesTask.ts`), `/tdd`,
`/security-review`, `/review`, and `/clean-branches`. The CLOSED engine
(`agents/dev-team/`) is the execution muscle: the supervisor runs developers on the
**minimal model first and escalates quality only on retry** (`modelLadder`), and
verifies each change with targeted unit + regression tests before a PR is opened.

## ⚠️ This skill merges (and a merge ships)

Unlike `idea-to-pr`, the user has asked for this to be **autonomous through merge**.
A merge to the production branch is a **live deploy** (Vercel Git integration on
push to `main`/`master` — see `CLAUDE.md` → Deployment). So this skill ships code to
real users without a per-PR human stop. That power is bounded by **hard gates** that
must ALL be green before any merge:

1. The issue carries the **`ready-for-agent`** label (fully specified, agent-safe).
2. The change has **real unit tests** and `verify` (typecheck + tests) is green.
3. The **security scan is clean** (findings are blocking — fix and re-scan).
4. **CI is green** on the PR, and branch protection (if any) is satisfied.

Anything that fails a gate is **not merged** — it is left as an open PR with the
blocker called out, relabeled `ready-for-human`, and reported at the end.

> Tip: to stop before merging (review-only), run with `--no-merge` — every issue
> gets a PR but the merge/deploy step is skipped and handed to a human.

## When to refuse outright

- An issue is **security-labeled / CRITICAL** → do NOT auto-work it. Surface it
  immediately (the triage step already speaks it aloud) and leave it for a human.
- An issue is `ready-for-human`, `needs-info`, `wontfix`, or `needs-triage` →
  out of scope for autonomous work; leave it.
- The repo has **uncommitted changes** at start → stop and ask; never work on a
  dirty tree.

## Tooling detection (don't assume)

Use the `gh` CLI when present (local); otherwise the GitHub MCP tools
(`mcp__github__issue_write`, `create_pull_request`, `merge_pull_request`,
`subscribe_pr_activity`, `run_secret_scanning`, …) on Claude Code on the web.
Detect once up front and use that path throughout.

## Workflow

Track the whole run as a live todo list (one todo per issue + the final cleanup).

### 0 — Preflight
- Confirm a clean tree (`git status --porcelain` empty) and that you are on the
  production branch (`main`). If dirty, stop and ask.
- `git fetch --prune origin` so branch/CI state is current.

### 1 — Discover & triage
Run the triage pass to classify every open issue:
```bash
cd agents && npm run dev:issues          # DRY RUN — print the plan, no spend
cd agents && npm run dev:issues -- --live  # LIVE — apply triage labels via gh
```
(Or follow `/triage` interactively.) Critical/security issues are announced and
spoken aloud here — **leave those for a human**.

From the result, build the **work set**: only issues now labeled `ready-for-agent`.
List them back to the user with the plan. If the work set is empty, say so and stop.

### 2 — Plan scopes (disjoint where possible)
For each work-set issue, name the **scope** (the few repo-relative paths it should
touch). Issues with **disjoint scopes** can run on parallel lanes; issues whose
scopes overlap must be **serialized** to avoid clobbering. Group accordingly.

### 3 — Work loop (per issue)
For each issue, in dependency order (parallel lanes for disjoint scopes):
1. **Branch** off the production branch: `git switch -c issue-<n>-<slug>`.
2. **`/tdd`** — red → green → refactor. Real unit tests first; one vertical slice
   matching the issue scope only. No drive-by refactors.
3. **Validate** — `sh agents/dev-team/devtools/dev verify` (typecheck + tests,
   failures-only). All green before proceeding.
4. **`/security-review`** — scan the diff. Findings are **blocking**: fix and
   re-scan until clean. On the web, also consider `run_secret_scanning`.
5. **Open a PR** based on the production branch. Body: `Closes #<n>` so the merge
   auto-closes the issue. Title: `fix #<n>: <issue title>`.
6. **Wait for CI** — `subscribe_pr_activity` (web) or poll `gh pr checks <pr>`.
   Address failures by pushing fixes, not by narrating each round.

> The supervisor's `modelLadder` already does the quality escalation *inside* a
> task (cheap model first, stronger on retry). At the issue level, if a slice
> repeatedly fails verification or security, **stop escalating compute** — relabel
> the issue `ready-for-human`, leave the PR open with the blocker, and move on.

### 4 — Merge gate (all hard gates green) → deploy
When tests, security, and CI are all green for an issue's PR:
- **Merge** (`gh pr merge <pr> --squash --delete-branch`, or
  `mcp__github__merge_pull_request` + branch delete). The merge auto-closes the
  issue (`Closes #<n>`) and **triggers a production deploy**.
- **Confirm the release is healthy** — sanity-check the deploy (a quick health
  check or `/verify` against the shipped change). If it looks broken, say so
  immediately and open a **revert PR** rather than continuing.
- Tick the issue's todo.

If a gate is NOT green: leave the PR open, relabel the issue `ready-for-human`,
record the blocker, and continue with the rest.

### 5 — Finish: leave the working tree clean
After the work set is exhausted:
- `git switch main && git pull --ff-only` — back on an up-to-date production branch.
- Prune merged branches (`/clean-branches`, or the post-merge
  `.claude/hooks/delete-branch.sh`): no stale local/remote heads remain.
- Remove harness scratch if any: `agents/dev-team/.scratch/`,
  `agents/dev-team/.run-state.json`, `.exploration/`.
- Confirm `git status --porcelain` is **empty** and no work-set branches survive.

## Definition of done
Every `ready-for-agent` issue is either: **merged** (with unit tests, green
validation, clean security scan, green CI, and a healthy deploy) and **closed**, or
left as an **open PR relabeled `ready-for-human`** with its blocker recorded.
Security/critical issues were left for a human. The tree is clean: on `main`,
up to date, no leftover branches, nothing uncommitted. End with a one-line wrap-up:
issues shipped (with PR links), issues parked for humans, and deploy status.
