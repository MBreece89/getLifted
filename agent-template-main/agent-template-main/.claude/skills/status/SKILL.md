---
name: status
description: A prioritized triage of everything that needs the user's attention on this repo — open PRs (with check + review + mergeability state), open issues, failing CI, and review requests. Surfaces "act now" items above "just FYI". Use when the user wants a status report, a standup/inbox view, asks "what needs my attention", "what's open", "where do things stand", "any PRs or issues", or invokes /status.
---

# Status

Produce a single scannable report of what's open and, more importantly, **what
needs the user's attention right now**. The value is the triage, not a raw dump:
rank actionable items above passive ones.

> Note: Codex has a built-in `/status` (account/system info). If typing
> `/status` doesn't reach this skill, invoke it by name ("run the status skill")
> or with a natural-language trigger ("what needs my attention").

## 1. Establish context

```bash
gh repo view --json nameWithOwner,defaultBranchRef -q '{repo: .nameWithOwner, default: .defaultBranchRef.name}'
gh api user -q .login        # the current user's handle, for "@me" filters
```

- Not in a git repo, or no GitHub remote → say so plainly and stop (there's
  nothing to report). Offer to look at local branch state instead.
- Record the login as `ME` and the default branch (usually `main`).

## 2. Gather (run these in parallel)

Use `--json` so you can triage on real fields, not scraped text. Prefer plain
`gh` here (JSON must stay parseable); the compact `rtk gh` views are fine for
anything you echo verbatim to the user.

```bash
# Open PRs with everything needed to triage them
gh pr list --state open --limit 50 \
  --json number,title,author,isDraft,reviewDecision,mergeable,createdAt,updatedAt,headRefName,labels,statusCheckRollup

# Open issues
gh issue list --state open --limit 50 \
  --json number,title,author,assignees,labels,createdAt,updatedAt,milestone

# PRs specifically waiting on ME to review
gh pr list --state open --search "review-requested:@me" --json number,title,author

# CI health on the default branch (latest runs)
gh run list --branch <default> --limit 10 \
  --json workflowName,status,conclusion,headBranch,event,createdAt,databaseId

# Dev-team supervisor heartbeat (local; written by a live agents run)
cat agents/dev-team/.supervisor-status.json 2>/dev/null
```

If `gh run list` errors (no Actions configured), skip CI silently.

### Supervisor heartbeat

The dev-team supervisor (`agents/dev-team`) writes a snapshot to
`agents/dev-team/.supervisor-status.json` on every run + dev-agent lifecycle
transition. It is the source of truth for "how many dev agents are running /
idle". Interpret it:

- **File missing** → no supervisor run has ever been recorded. Report
  "Supervisor: idle (no recorded run)".
- **`running: true` and `updatedAt` within ~2 min** → a run is **live**. Report
  the dev-agent tally and `currentTask`.
- **`running: true` but `updatedAt` is stale (older than ~2 min)** → the run
  likely **crashed mid-flight** (heartbeat went silent). Flag it under "Needs
  your attention" as a possibly-hung supervisor, and note any non-zero
  `live`/`idleNotClosed` as leaked agents.
- **`running: false`** → idle; show the **last run's** final tally (created ==
  released, live 0) as a one-liner.

`idleNotClosed > 0` is a red flag in any state — it means an agent was minted
but never let go (the fresh-per-work design should keep this at 0).

## 3. Triage

Sort each item into one of two buckets. **"Act now" always prints first.**

**Act now** (anything true → it's actionable):
- PR authored by `ME` that is **mergeable, not draft, checks green, and
  `reviewDecision` is `APPROVED` or empty** → ready to merge.
- PR with `statusCheckRollup` containing a **FAILURE / ERROR** → broken, fix it.
- PR with `mergeable: "CONFLICTING"` → needs a rebase/conflict resolution.
- PR where **`ME` is requested as reviewer** (from the review-requested query).
- PR with `reviewDecision: "CHANGES_REQUESTED"` authored by `ME`.
- A **failing latest CI run on the default branch** (`conclusion: failure`).
- Issue **assigned to `ME`** with a priority/urgent label (e.g. `bug`, `p0`,
  `security`) — flag these specially.
- A **supervisor heartbeat that is `running: true` but stale** (hung run), or
  any snapshot with **`idleNotClosed > 0`** (leaked dev agent).

**Open / FYI** (everything else):
- Draft PRs, PRs awaiting *others'* review, issues not assigned to `ME`.
- Anything stale: open & `updatedAt` older than ~14 days → tag `(stale Nd)`.

Compute "age" from `createdAt` and "idle" from `updatedAt` in days for display.

## 4. Report

Print in this order. Keep it tight — one line per item, newest/most-urgent
first. Use counts in headers so the user gets the shape at a glance.

```
# Status · <owner/repo> · <default branch>

## ⚠️  Needs your attention (<n>)
- PR #123  Ready to merge · checks green, approved        (Title) · 2d
- PR #119  ❌ checks failing (build)                      (Title) · 5d
- PR #117  ⚠️  merge conflict — needs rebase               (Title) · 1d
- PR #108  👀 review requested from you · @author         (Title) · 3h
- CI       ❌ main: "test" workflow failing               (run 99) · 1h
- Issue #66 🔴 assigned to you · security                 (Title) · 4d

## 🔀 Open PRs (<n>)
- #115  draft · @author                                   (Title) · 6d
- #112  awaiting review (@reviewer)                        (Title) · 2d (stale 16d)

## 🐛 Open issues (<n>)
- #64  bug · unassigned                                    (Title) · 1d
- #58  enhancement                                         (Title) · 9d

## 🤖 Supervisor (dev-team)
- run active · task feat::regression::… · live 1 · created 6 · released 5 · idle 0
  # or, when idle:    idle · last run: created 6 · released 6 · live 0
  # or, when absent:  idle (no recorded run)

## ✅ Nothing else flagged
```

Rules for the report:
- If a bucket is empty, print the header with `(0)` and a one-line "all clear",
  or omit "Needs your attention" entirely and lead with a ✅ if truly nothing is
  actionable.
- Make `#<number>` references real — the terminal links them.
- Don't editorialize or suggest fixes unless asked; this is a dashboard. End by
  offering to act on the top item ("Want me to merge #123 / look at #119's
  failure / start #66?").
- Never take an action (merge, close, comment) from this skill — it's read-only.
  Surfacing is the whole job; acting is a separate, explicit request.
