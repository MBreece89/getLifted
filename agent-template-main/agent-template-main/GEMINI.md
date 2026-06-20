<!-- AUTO-GENERATED from AGENTS.md by scripts/sync-agent-config.sh — DO NOT EDIT. Edit AGENTS.md and re-run the script. -->

# AGENTS.md — <PROJECT_NAME>

> **Canonical, vendor-neutral instructions for any coding agent.** This is the
> single source of truth. Per-tool adapters (`CLAUDE.md`, `GEMINI.md`,
> `.cursor/rules/`, `.cursor/mcp.json`) are generated from this file by
> `scripts/sync-agent-config.sh` — **edit this file, then run the script.** Do not
> edit the generated adapters by hand; they carry an AUTO-GENERATED banner.
>
> Template note: replace placeholders (`<PROJECT_NAME>`, `<STACK>`,
> `<PROD_DOMAIN>`, `<PKG_MGR>`) with this project's specifics, then delete this note.

<PROJECT_NAME> is <ONE_LINE_DESCRIPTION>. Stack: **<STACK>**. Package manager:
**<PKG_MGR>**. Production: **<PROD_DOMAIN>**.

## Working agreements

- **Scope discipline.** A unit of work edits only its assigned paths. Anything
  outside scope is flagged and split into its own unit, never done silently.
- **Verify by running code.** Confirm changes with the dev tools / tests, not by
  assertion.
- **Small, focused changes.** No drive-by refactors inside a feature change.
- **Branch + PR flow.** Work on a branch; open a PR; after a merge, delete the
  head branch (`.claude/hooks/delete-branch.sh <branch>` automates this).

## Commands

```bash
<PKG_MGR> install            # deps
<PKG_MGR> run build          # build      (adjust to this repo's actual scripts)
<PKG_MGR> test               # tests
<PKG_MGR> run lint           # lint
<PKG_MGR> run typecheck      # types

# dev-team harness (tooling, isolated from the product build):
cd agents && npm install && npm run test:agents

# first-time setup:
bash scripts/install-hooks.sh   # pre-commit adapter-drift check
```

## Playbooks (skills)

Reusable procedures live in `.claude/skills/<name>/SKILL.md` as plain markdown —
**any** agent can read and follow one on request ("follow the `tdd` skill").
Claude Code additionally auto-triggers them and exposes them as `/<name>`.

- **Planning / specs** — `grill-me`, `grill-with-docs`, `to-prd`, `to-issues`, `idea-to-pr`, `prototype`
- **Build / quality** — `tdd`, `diagnose`, `review`, `improve-codebase-architecture`, `setup-pre-commit`
- **Workflow** — `status`, `handoff`, `zoom-out`, `triage`, `prod-triage`, `work-issues`, `clean-branches`, `git-guardrails-claude-code`
- **Meta** — `write-a-skill`, `setup-matt-pocock-skills`, `graphify`, `caveman`

Triage roles map to this repo's labels in
[docs/agents/triage-labels.md](docs/agents/triage-labels.md).

## Roles (subagents)

Six roles live in `.claude/agents/<name>.md`. In Claude Code they are native
subagents (in the picker, invocable by name); in any other tool, adopt the role by
reading its file and following it.

| Role | Responsibility |
|---|---|
| `explorer` | OPEN, token-frugal discovery: roam wide, then hand back a bounded, scoped plan. |
| `developer-supervisor` | Decompose a task into disjoint-scope units; drive assign → verify → escalate. |
| `developer` | Implement ONE fixed-scope unit; self-verify; flag out-of-scope work. |
| `verifier` | Run unit + regression checks on only the changed modules; leave no test files. |
| `remediator` | Turn a failing check into a scoped fix, then re-verify. |
| `utility-reviewer` | Extract repeated terminal work into reusable `devtools/` scripts. |

The same roles run programmatically from `agents/dev-team/` (Agent SDK harness) —
see its README. Per-project test targeting: `agents/dev-team/modules.config.ts`.

## OPEN vs CLOSED modes

Two ways to run the agents, used together:

- **CLOSED** (default execution engine) — bounded: known goal, fixed scopes, a
  verification standard at each step. Cheap, repeatable, honest. This is the
  supervisor → developer → verifier → remediator loop.
- **OPEN** (discovery front-end) — exploratory: roam wide to find what you didn't
  know to look for. Powerful but token-hungry, so here it is deliberately
  **token-frugal**: the `explorer` runs breadth-first and read-mostly on a cheap
  model, then **crystallizes** its findings into bounded, scoped candidates.

The intended flow is **OPEN → CLOSED**: explore cheaply, produce a scoped plan,
then let the closed engine execute it under its usual guarantees. The
`discoveryToTasks` bridge (`agents/dev-team/exploration.ts`) converts a discovery
report into closed tasks; the `grill-with-docs` → `to-prd` → `to-issues` skills are
the interactive crystallization path. Entry point: `npm run dev:explore -- "goal"`
(add `--run` to execute the discovered plan).

**Budget note (Pro plan):** the limit is *tokens*, not dollars — `maxBudgetUsd` is
inert. Frugality comes from model tiering (Haiku for breadth → stronger model for
execution), bounded `maxTurns`, read-mostly roaming, and `rtk`. Keep OPEN runs
short and let CLOSED do the heavy lifting.

**Quality ladder (minimal first, escalate on need):** the supervisor takes an
optional `modelLadder` (cheapest-first model ids). Every task — including each
dispatched fix-task — starts on the **minimal** model (`modelLadder[0]`); each
*retry* climbs one rung, so easy work stays cheap and only a struggling task pulls
in a stronger (more expensive) model. The top rung repeats once reached, and a
`quality_escalation` bus message marks each bump. Omit the ladder to keep the
runner's single configured model for every attempt. The real entry points
(`realTask`, `exploreTask` CLOSED phase) wire `haiku → sonnet → opus` by default.

## MCP / external tools

`.mcp.json` is the canonical MCP server list (`github` active; `supabase`/`vercel`
opt-in in `.mcp.example.json`). All credentials come from the environment via
`${VAR}` — never hard-coded. The sync script mirrors this to `.cursor/mcp.json`.

## Secrets

Local secrets go in `.env` / `.env.local` (gitignored). Never commit tokens.
MCP servers and the harness read credentials from the environment via `${VAR}`.

## Deployment

> Template note: describe this project's deploy (e.g. "a merge to `main`
> auto-deploys to <PROD_DOMAIN> via <PLATFORM>"). The `prod-triage` skill and the
> post-merge branch-cleanup hook assume a merge-to-main → deploy flow.

## Tool portability — what's generated, what's tool-specific

This repo is designed to avoid lock-in to any single agent tool.

| Tool | Adapter | Notes |
|---|---|---|
| **Claude Code** | `CLAUDE.md` (`@AGENTS.md` import) | Deepest integration: skills auto-trigger, native subagents, hooks, `.mcp.json`. |
| **Codex** | none needed | Reads `AGENTS.md` natively. |
| **Cursor** | `.cursor/rules/agents.mdc`, `.cursor/mcp.json` | Generated from this file + `.mcp.json`. |
| **Gemini CLI** | `GEMINI.md` | Generated copy of this file. |

**Claude-only features** (degrade gracefully elsewhere — replace with the tool's
own equivalent if you switch): skill auto-triggering, native subagent picker,
`.claude/hooks/`, and computer-use. The *content* of skills/roles is plain
markdown, so nothing important is trapped — any agent can read and follow it.

Regenerate adapters after editing this file: `scripts/sync-agent-config.sh`
(use `--check` in CI / pre-commit to fail on stale adapters).

## Template inheritance — staying in sync with agent-template

A project scaffolded from (or adopted into) this template keeps inheriting the
template's **shared infra** — subagents, skills, hooks, the `agents/dev-team`
harness core, `scripts/`, and the workflows — without re-copying by hand.

- **What flows in vs what stays local.** `template-lock.json` lists the inherited
  paths (`inherit[]`) and the project-owned files that must never be overwritten
  (`exclude[]` — `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `.mcp.json`,
  `agents/dev-team/modules.config.ts`, settings). Edit *those* for project specifics.
- **Pull updates:** `bash scripts/sync-from-template.sh` (report drift) or
  `--update` (write the changes). It fetches the `template` remote and makes the
  inherited files match upstream.
- **Automatic:** `.github/workflows/template-sync.yml` runs weekly and opens a
  *Template sync* PR when the template moves (needs a `TEMPLATE_SYNC_TOKEN` repo
  secret with read access to the private template — see the workflow header).
- **The one rule that keeps this painless:** treat inherited files as vendored —
  **don't hand-edit** `.claude/skills/*`, the harness core, hooks, etc. downstream.
  Put all project-specific behavior in the excluded/owned files. To intentionally
  own a shared file, add it to `exclude[]`.
