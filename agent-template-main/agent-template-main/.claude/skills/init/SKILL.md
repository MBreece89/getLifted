---
name: init
description: Initialize a project that has just imported the agent-template. Fills in AGENTS.md/CLAUDE.md placeholders, configures template-lock.json with the correct upstream remote, gitignores the AI tooling, adds deployignore rules, runs scripts/install-hooks.sh, and guides the user through remaining setup. Use when the user says "init", "initialize the template", "set up the template", or invokes /init in a project that still contains <PROJECT_NAME> or other unfilled placeholders.
---

# Init — Template Initialization

Runs once after a project imports agent-template. Fills placeholders, wires the upstream sync, keeps AI tooling out of git and off production servers, and installs hooks.

## Step 1 — Collect project details

Ask the user (or infer from the repo) for:

| Placeholder | What to ask |
|---|---|
| `<PROJECT_NAME>` | What is the project called? |
| `<ONE_LINE_DESCRIPTION>` | One sentence: what does it do? |
| `<STACK>` | Tech stack (e.g. "Next.js, TypeScript, Postgres") |
| `<PKG_MGR>` | Package manager: npm / pnpm / yarn / bun |
| `<PROD_DOMAIN>` | Production URL (or "TBD" if not yet deployed) |
| `<PLATFORM>` | Deploy platform (e.g. "Vercel", "Railway", "TBD") |
| Template upstream URL | The GitHub URL of the agent-template repo (e.g. `https://github.com/org/agent-template.git`) |

Detect what you can automatically:
- `<PKG_MGR>`: check for lockfiles (`bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm)
- Template URL: check `git remote -v` for a remote named `template`; fall back to asking

Ask about any remaining unknowns in a single consolidated question rather than one at a time.

## Step 2 — Fill placeholders in AGENTS.md

Replace all occurrences of each placeholder with the collected values.
Also delete the template note block (lines starting with `> Template note:` through the blank line after it) — both instances.

Verify with `grep -n "PROJECT_NAME\|ONE_LINE_DESCRIPTION\|STACK\|PKG_MGR\|PROD_DOMAIN\|PLATFORM" AGENTS.md` — should return nothing.

## Step 3 — Fill placeholders in CLAUDE.md

Same replacements for any placeholders present in CLAUDE.md.

## Step 4 — Create / update template-lock.json

If `template-lock.json` doesn't exist, create it. If it exists, update `upstream.remote` and `upstream.branch`.

```json
{
  "upstream": {
    "remote": "<TEMPLATE_UPSTREAM_URL>",
    "branch": "main"
  },
  "inherit": [
    ".claude/agents",
    ".claude/hooks",
    ".claude/skills",
    ".github/workflows/template-sync.yml",
    ".github/workflows/skill-updates.yml",
    "agents/dev-team",
    "scripts/sync-from-template.sh",
    "scripts/install-hooks.sh",
    "docs/agents"
  ],
  "exclude": [
    "AGENTS.md",
    "CLAUDE.md",
    "CONTEXT.md",
    ".mcp.json",
    "agents/dev-team/modules.config.ts",
    ".claude/settings.json",
    ".claude/settings.local.json"
  ]
}
```

## Step 5 — Gitignore the AI tooling

The agent-template infrastructure is **developer tooling only** — it should never appear in the project's git history or be deployed to production. It lives locally on each developer's machine and is re-synced from the template on demand.

Append this block to `.gitignore` (create the file if it doesn't exist):

```gitignore
# ── Agent-template infrastructure ─────────────────────────────────────────────
# Developer-only AI tooling. Never commit or deploy. Each developer runs
# /init (or scripts/sync-from-template.sh --update) to hydrate these locally.
.claude/
agents/
template-lock.json
scripts/sync-from-template.sh
scripts/sync-agent-config.sh
scripts/check-skill-updates.sh
scripts/pre-commit
# ──────────────────────────────────────────────────────────────────────────────
```

**What stays in git** (needed for CI or team setup):
- `.github/workflows/` — GitHub Actions must be committed to run
- `scripts/install-hooks.sh` — team members run this after cloning
- `AGENTS.md`, `CLAUDE.md` — project docs, owned by the project

## Step 6 — Deployignore the AI tooling

Prevent the tooling from reaching production servers. Apply to whichever deploy platforms are detected:

**Vercel** — append to `.vercelignore` (create if missing):
```
.claude/
agents/
template-lock.json
scripts/
```

**Docker** — append to `.dockerignore` (if a `Dockerfile` exists):
```
.claude/
agents/
template-lock.json
scripts/
```

**Railway / Render / Fly** — if a config file exists (`railway.toml`, `render.yaml`, `fly.toml`), note to the user that these platforms respect `.gitignore`, so Step 5 already covers them.

Detect which of the above apply by checking for the relevant config files. Only touch files that exist or are needed.

## Step 7 — Install git hooks

```bash
bash scripts/install-hooks.sh
```

Report what was installed. If it fails, show the error and tell the user to run it manually after fixing permissions.

## Step 8 — Verify the sync script works

```bash
bash scripts/sync-from-template.sh
```

- If it exits 0 with no drift: done.
- If it reports drift: run `bash scripts/sync-from-template.sh --update` to resolve it.
- If it fails with an auth error: the `TEMPLATE_SYNC_TOKEN` secret is missing — note this for the user (see Step 9).

## Step 9 — Remaining checklist

Report which of these still need the user's attention:

- [ ] **GitHub secret** — add `TEMPLATE_SYNC_TOKEN` (fine-grained PAT with read access to the template repo) to this repo's Actions secrets so the weekly sync CI job can authenticate
- [ ] **`.env` / `.env.local`** — copy `.env.example` if present and fill in real credentials
- [ ] **`.mcp.json`** — update with any project-specific MCP servers (the file is excluded from template sync, so edits are safe)
- [ ] **`agents/dev-team/modules.config.ts`** — configure test-targeting for this project's module layout
- [ ] **Team onboarding** — other developers need to run `/init` (or `bash scripts/sync-from-template.sh --update`) after cloning to hydrate the gitignored AI tooling locally
- [ ] **Deploy** — if `<PROD_DOMAIN>` was left as "TBD", come back and fill it in once the project is deployed

## Step 10 — Commit

Only commit project-owned files — the gitignored tooling must not be staged:

```bash
git add AGENTS.md CLAUDE.md .gitignore .vercelignore .dockerignore
git status  # verify .claude/ and agents/ are NOT listed as staged
```

Commit message:
```
chore: initialize agent-template for <PROJECT_NAME>
```

---

## Why the tooling is gitignored

The skills, subagents, hooks, and dev-team harness are **local AI developer tooling**, analogous to `.cursor/` or IDE config. They augment the development experience but are not part of the product:

- **Not product code** — nothing in `.claude/` or `agents/dev-team/` runs at runtime or is imported by the application
- **Synced, not owned** — these files are vendored from agent-template; committing them creates drift and merge conflicts when the template updates
- **Per-developer setup** — each developer hydrates them locally via `/init` or `sync-from-template.sh --update`; the `.github/workflows/` files handle CI without needing the full tooling tree committed

The one exception is `.github/workflows/` — those must be committed because GitHub reads them from the repo to schedule Actions runs.
