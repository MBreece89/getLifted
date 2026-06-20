---
name: idea-to-pr
description: Turn a raw idea into vetted, shipped code through one tracking issue and a PR per phase. Vets the idea (grill-with-docs), specs it into a tracking GitHub issue (to-prd → to-issues), then for each vetted phase builds code + unit tests + validation + secure source scan (tdd → security-review) and opens a PR for human approval. Ticks the phase checkbox on each merge and closes the issue when the final PR merges. Use when the user has an idea and wants the full idea → issue → PR pipeline with human approval gates.
---

# idea-to-pr

A **thin orchestrator**. It conducts skills you already have — it does not re-implement them.
The work lives in `/grill-with-docs`, `/to-prd`, `/to-issues`, `/tdd`, `/security-review`.
Two human gates: **scope** (before any code) and **each PR** (before merge). Everything between is autonomous.

## Operating rules

- **Delegate, never duplicate.** Prefer the project skills above. If one is not installed this
  session, fall back: `/grill-with-docs`→`/grill-me`→`autopilot`'s critic; `/tdd`→`bugfix`/`autopilot`;
  `/security-review`→`security-review` SDK skill + `pnpm typecheck && pnpm lint`.
- **Issue/PR tooling is environment-dependent.** Use `gh` CLI when present (local), otherwise the
  GitHub MCP tools (`mcp__github__issue_write`, `create_pull_request`, `merge_pull_request`,
  `subscribe_pr_activity`, …) on Claude Code on the web. Detect, don't assume.
- **One epic issue, one PR per phase.** Small reviews; the issue is the single source of truth.
- **A merge to the production branch is a live deploy.** This repo auto-deploys to production via
  Vercel's Git integration on every push/merge to the default branch (`main`, a.k.a. `master`) — see
  the Deployment section of `CLAUDE.md`. So merging any phase PR ships that phase to real users
  immediately. Phase PRs must base on the production branch, and the merge gate (Gate 2) is also a
  **release gate**: never self-merge, and after a merge confirm the deploy is healthy (Stage 4).
- **Stop the moment the user redirects.** Gates are real stops — do not proceed past one unanswered.
- Track the whole run as a todo list and keep it live.

## Workflow

### 0 — Capture
Restate the idea in one sentence and confirm it back. If it is one line with no constraints,
ask 2–3 scoping questions (who is it for, what's in/out, any deadline). Do not over-interrogate.

### 1 — Vet  (`/grill-with-docs`)
Stress-test the idea against `CONTEXT.md`, `docs/prd.md`, and `docs/adr/`. Kill bad assumptions,
surface domain-language mismatches, and let the skill update `CONTEXT.md` / add ADRs as needed.
Output: a vetted concept with explicit non-goals and the domain terms it touches.

### 2 — Spec  (`/to-prd` → `/to-issues`)
Synthesize the vetted idea into a PRD, then break it into **vertical-slice phases** (each phase ships
end-to-end: schema → service → route → web → test). Create **one tracking GitHub issue** containing:
- the PRD summary and non-goals,
- a `- [ ]` checkbox per phase,
- label `ready-for-agent` (see `docs/agents/triage-labels.md`).

> **⛔ GATE 1 — scope.** Post the phase plan and ask the user to approve before any code is written.
> Use `AskUserQuestion` if a phase boundary is ambiguous. Do not start phase 1 until approved.

### 3 — Build loop  (per phase, in order)
For each unchecked phase:
1. **Branch** off the **production branch** (`main`) for this phase, so the PR diff is just that slice
   and the merge can deploy cleanly.
2. **`/tdd`** — red → green → refactor. Real unit tests first; one vertical slice only.
3. **Validate** — `pnpm typecheck && pnpm lint && pnpm test` (or the project's `rtk`-wrapped forms).
   All green before proceeding.
4. **`/security-review`** — secure source scan of the phase diff. Treat findings as blocking;
   fix and re-scan until clean. On the web, also consider `mcp__github__run_secret_scanning`.
5. **Open a PR** for this phase.
   - Body links the tracking issue (`Refs #<issue>`).
   - On the **final** phase only, use `Closes #<issue>` so merge auto-closes it.
   - Title: `phase N/<total>: <slice name>`.

> **⛔ GATE 2 — each PR (also a release gate).** The PR is the approval point, and because a merge to
> `main` auto-deploys to production via Vercel, merging is shipping. Do **not** self-merge. Call out in
> the PR/handoff that merging deploys to prod. Offer to `subscribe_pr_activity` so review comments and
> CI wake the session; address feedback by pushing fixes (per the harness PR-activity rules), not by
> narrating each round. If the user has you merge, prefer merging when you can watch the deploy.

### 4 — Close & confirm the release
On each phase-PR **merge** (= a production deploy):
1. Tick that phase's checkbox in the tracking issue.
2. **Confirm the release is healthy** — the merge triggered a Vercel prod deploy. Sanity-check it
   (e.g. `/verify` against the deployed change, or a quick health check). If the deploy looks broken,
   say so immediately and propose a revert PR rather than starting the next phase.
3. Start the next phase.

When the **final** phase PR merges, `Closes #<issue>` closes the epic automatically — verify it closed,
confirm the final deploy is healthy, and post a one-line wrap-up (phases shipped, PR links, deploy
status). If sub-issues were used instead, close each.

## Definition of done
Every phase has a merged PR; each merge produced a healthy production deploy; the tracking issue is
closed; `CONTEXT.md`/ADRs reflect any decisions made during vetting. No phase ships without unit tests,
green validation, and a clean security scan.
