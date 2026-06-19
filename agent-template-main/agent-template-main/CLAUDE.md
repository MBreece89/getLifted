# <PROJECT_NAME> — Claude Code

The project's instructions are vendor-neutral and live in **AGENTS.md** (the
single source of truth, shared across all agent tools). It is imported below, so
everything there applies here too. Only Claude-Code-specific mechanics are added
in this file.

@AGENTS.md

## Claude Code specifics

These leverage Claude Code features beyond the portable baseline in AGENTS.md:

- **Skills** auto-trigger from `.claude/skills/` and are invocable as `/<name>`.
- **Subagents** in `.claude/agents/` appear in the agent picker and can be
  delegated to by name (`developer`, `verifier`, `remediator`, …).
- **Hooks** in `.claude/hooks/` run automatically (e.g. post-merge branch cleanup
  via `delete-branch.sh`). See `.claude/settings.json`.
- **MCP** servers are read from `.mcp.json` and approved on first use.

> This file intentionally stays thin: edit **AGENTS.md** for anything that should
> apply regardless of tool, then run `scripts/sync-agent-config.sh` to refresh the
> other tools' adapters.
