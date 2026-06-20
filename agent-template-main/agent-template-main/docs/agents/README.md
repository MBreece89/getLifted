# Agents & Skills index

What this template ships, and how Claude Code discovers each piece.

## Native subagents (`.claude/agents/*.md`)

Auto-discovered by Claude Code — they appear in the agent picker and can be
invoked by name. They mirror the roles in the `agents/dev-team/` harness so the
same process is available interactively.

| Agent | Role |
|---|---|
| `explorer` | OPEN, token-frugal discovery: roams wide (read-mostly, cheap model), then hands back a bounded, scoped plan. The front-end to the closed loop. |
| `developer-supervisor` | Decomposes a task into disjoint-scope units; drives assign → verify → escalate; sequences the others. |
| `developer` | Implements ONE fixed-scope unit; self-verifies; flags out-of-scope work instead of doing it. |
| `verifier` | Runs unit + regression checks on only the changed modules; leaves no test files behind. |
| `remediator` | Turns a failing check into a scoped fix, then re-verifies. Never weakens a test to pass. |
| `utility-reviewer` | Extracts repeated terminal work into reusable `devtools/` scripts. |

### OPEN → CLOSED

`explorer` is the **OPEN** mode (wide discovery); the other five are the **CLOSED**
engine (bounded, verified execution). Explore cheaply to produce a scoped plan, then
let the closed loop execute it. The `discoveryToTasks` bridge
(`agents/dev-team/exploration.ts`) turns a discovery report into closed tasks;
`grill-with-docs` → `to-prd` → `to-issues` → `idea-to-pr` are the interactive
crystallization path. See AGENTS.md → "OPEN vs CLOSED modes".

## Skills (`.claude/skills/<name>/SKILL.md`)

Auto-discovered; invoke with `/<name>`. Curated dev set:

- **Planning / specs** — `grill-me`, `grill-with-docs`, `to-prd`, `to-issues`, `idea-to-pr`, `prototype`
- **Build / quality** — `tdd`, `diagnose`, `review`, `improve-codebase-architecture`, `setup-pre-commit`
- **Workflow** — `status`, `handoff`, `zoom-out`, `triage`, `prod-triage`, `clean-branches`, `git-guardrails-claude-code`
- **Meta** — `write-a-skill`, `setup-matt-pocock-skills`, `graphify`, `caveman`

`skills-lock.json` records each skill's upstream source so they can be updated.

## The dev-team harness (`agents/dev-team/`)

A programmatic Agent SDK process (the same roles, run from the CLI):

```bash
cd agents
npm install          # one-time
npm run test:agents  # offline eval — no network, no tokens
npm run dev:real     # one safe scratch task via the live SDK
npm run dev:team     # parallel lanes (concurrency demo)
npm run dev:issues   # triage open GitHub issues (dry-run; add --live)
npm run dev:explore -- "goal"  # OPEN discovery (Haiku) → scoped plan; add --run to execute it
```

Per-project test targeting is configured in `agents/dev-team/modules.config.ts`.

## MCP servers (`.mcp.json`)

`github` is wired by default (token via `${GITHUB_TOKEN}`). See
`.mcp.example.json` for opt-in `supabase` / `vercel` blocks.

## Triage vocabulary

`docs/agents/triage-labels.md` maps the canonical triage roles to your tracker's
actual label strings — edit it to match your repo.
