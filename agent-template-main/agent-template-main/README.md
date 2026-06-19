# agent-template

A reusable starting point for projects driven by **AI coding agents**. It bundles
a curated set of skills, scoped agent roles, MCP wiring, hooks, and a multi-agent
dev harness — vendor-neutral by design (one canonical `AGENTS.md`), with Claude
Code, Codex, Cursor, and Gemini CLI all wired in out of the box.

It combines the best pieces of three working projects into one template:

- **Native subagents** (`.claude/agents/`) — the supervisor/developer/verifier/
  remediator/utility-reviewer roles, visible in the agent picker.
- **Curated skills** (`.claude/skills/`) — planning, TDD, diagnosis, triage,
  review, and workflow skills, invocable with `/<name>`.
- **dev-team harness** (`agents/dev-team/`) — a programmatic Agent SDK process
  with change-targeted verification, an enforced verify→fix loop, and parallel
  concurrency lanes.
- **MCP** (`.mcp.json`) — `github` ready; `supabase`/`vercel` opt-in.
- **Hooks & settings** (`.claude/`) — post-merge branch cleanup, sensible perms.
- **Tool-agnostic by design** — `AGENTS.md` is the canonical instruction set;
  Claude Code, Codex, Cursor, and Gemini CLI all get it (no vendor lock-in).

## What Claude Code auto-discovers

| Piece | Location | How it's seen |
|---|---|---|
| Skills | `.claude/skills/<name>/SKILL.md` | `/<name>` and automatic triggering |
| Subagents | `.claude/agents/<name>.md` | the agent picker / by name |
| MCP servers | `.mcp.json` | approved on first use |
| Permissions & hooks | `.claude/settings.json` | applied automatically |

See [docs/agents/README.md](docs/agents/README.md) for the full catalog.

## Works across agent tools (no lock-in)

`AGENTS.md` is the **single source of truth**. Each tool gets it through a thin
adapter — generated, so they can't drift:

| Tool | Adapter | How |
|---|---|---|
| Claude Code | `CLAUDE.md` | imports `AGENTS.md` via `@AGENTS.md` + Claude extras |
| Codex | — | reads `AGENTS.md` natively |
| Cursor | `.cursor/rules/agents.mdc`, `.cursor/mcp.json` | generated |
| Gemini CLI | `GEMINI.md` | generated |

Edit `AGENTS.md`, then run `scripts/sync-agent-config.sh` to refresh the adapters
(`--check` fails on stale ones — wire it into CI / a pre-commit hook). The skills
and subagent roles are plain markdown, so any agent can read and follow them; only
auto-triggering, the subagent picker, hooks, and computer-use are Claude-specific.

## Start a new project from this template

```bash
# 1. Copy the template into a new project (no git history)
scripts/init-template.sh ~/Documents/GitRepos/my-new-project "My New Project"

# 2. Open the new project in Claude Code and follow the printed checklist:
#    - set GITHUB_TOKEN (and any opt-in MCP env vars)
#    - install the harness:  cd agents && npm install
#    - run the offline eval:  npm run test:agents
```

Then fill in the placeholders (`<PROJECT_NAME>`, `<STACK>`, `<PROD_DOMAIN>`, …) in
`AGENTS.md`, `CONTEXT.md`, and `.claude/skills/prod-triage/SKILL.md`, describe your
module layout in `agents/dev-team/modules.config.ts`, and run
`scripts/sync-agent-config.sh` to refresh the per-tool adapters.

## Layout

```
AGENTS.md          ← canonical, vendor-neutral instructions (edit this)
CLAUDE.md          Claude Code adapter (imports AGENTS.md) + Claude extras
GEMINI.md          Gemini CLI adapter      (generated)
.cursor/
  rules/agents.mdc Cursor rule             (generated)
  mcp.json         Cursor MCP              (generated from .mcp.json)
CONTEXT.md         durable project context
.claude/
  agents/      native subagents (UI-visible)
  skills/      curated dev skills
  hooks/       delete-branch.sh (post-merge cleanup)
  settings.json
.mcp.json          github (active)            ← canonical MCP list
.mcp.example.json  supabase / vercel (opt-in)
agents/dev-team/   Agent SDK harness (tooling, isolated from any product build)
docs/agents/       agents+skills index, triage labels
scripts/
  init-template.sh      scaffold a new project
  sync-agent-config.sh  regenerate tool adapters from AGENTS.md
```
