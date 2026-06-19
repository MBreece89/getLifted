#!/usr/bin/env bash
# init-template.sh — scaffold a new project from this template.
#
#   scripts/init-template.sh <dest-dir> ["Project Name"]
#
# Copies the template (skills, subagents, MCP wiring, hooks, docs, and the
# dev-team harness) into <dest-dir>, substitutes the project name, initializes a
# fresh git repo, and prints a post-setup checklist. Source files (node_modules,
# .git, harness scratch/run-state) are not copied.
set -euo pipefail

DEST="${1:-}"
NAME="${2:-}"

if [[ -z "$DEST" ]]; then
  echo "usage: scripts/init-template.sh <dest-dir> [\"Project Name\"]" >&2
  exit 2
fi

# Resolve the template root (this script lives in <root>/scripts/).
SRC="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -e "$DEST" && -n "$(ls -A "$DEST" 2>/dev/null || true)" ]]; then
  echo "error: destination '$DEST' exists and is not empty" >&2
  exit 1
fi

mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
[[ -z "$NAME" ]] && NAME="$(basename "$DEST")"

echo "Scaffolding '$NAME' into $DEST …"

# Copy everything except VCS, dependencies, and harness runtime artifacts.
if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude '**/.scratch/' \
    --exclude '**/.run-state.json' \
    --exclude '**/.supervisor-status.json' \
    "$SRC"/ "$DEST"/
else
  cp -R "$SRC"/. "$DEST"/
  rm -rf "$DEST/.git" "$DEST/node_modules" "$DEST/agents/node_modules" \
         "$DEST/agents/dev-team/node_modules"
  find "$DEST" -type d -name .scratch -exec rm -rf {} + 2>/dev/null || true
  find "$DEST" \( -name .run-state.json -o -name .supervisor-status.json \) -delete 2>/dev/null || true
fi

# Don't ship the template's own README/init script into the new project.
# Drop the template's own README + this init script, but KEEP sync-agent-config.sh
# (the new project needs it to regenerate adapters when it edits AGENTS.md).
rm -f "$DEST/README.md" "$DEST/scripts/init-template.sh"

# Substitute the project name in the canonical + templated docs. Pass the name via
# the environment so perl treats it as a literal replacement (no regex/metachar
# surprises if the name contains slashes, ampersands, etc.).
for f in "$DEST/CLAUDE.md" "$DEST/AGENTS.md" "$DEST/CONTEXT.md" "$DEST/docs/agents/triage-labels.md"; do
  [[ -f "$f" ]] && NAME="$NAME" perl -pi -e 's/<PROJECT_NAME>/$ENV{NAME}/g' "$f"
done

# Regenerate the per-tool adapters from the (now name-substituted) AGENTS.md so
# GEMINI.md / .cursor/* are consistent in the new project from the first commit.
[[ -x "$DEST/scripts/sync-agent-config.sh" ]] && ( cd "$DEST" && scripts/sync-agent-config.sh >/dev/null )

# Install git hooks (pre-commit: adapter drift check).
[[ -x "$DEST/scripts/install-hooks.sh" ]] && ( cd "$DEST" && bash scripts/install-hooks.sh )

# Seed the template-inheritance manifest so future template updates flow in via
# `scripts/sync-from-template.sh` (and the Template-sync workflow). Project-owned
# files are listed in exclude[] and never overwritten by a sync.
cat > "$DEST/template-lock.json" <<'JSON'
{
  "version": 1,
  "upstream": {
    "repo": "phix/agent-template",
    "remote": "https://github.com/phix/agent-template.git",
    "branch": "main"
  },
  "inherit": [
    ".claude/agents",
    ".claude/skills",
    ".claude/hooks",
    "scripts/sync-agent-config.sh",
    "scripts/install-hooks.sh",
    "scripts/pre-commit",
    "scripts/check-skill-updates.sh",
    "scripts/sync-from-template.sh",
    ".github/workflows/ci.yml",
    ".github/workflows/skill-updates.yml",
    ".github/workflows/template-sync.yml",
    "agents/dev-team",
    "agents/package.json",
    "agents/package-lock.json",
    "agents/tsconfig.json",
    "agents/vitest.config.ts"
  ],
  "exclude": [
    "agents/dev-team/modules.config.ts",
    "agents/dev-team/node_modules",
    "agents/dev-team/.scratch",
    "agents/dev-team/.run-state.json"
  ]
}
JSON

# Fresh git history.
( cd "$DEST" && git init -q && git remote add template https://github.com/phix/agent-template.git \
    && git add -A && git commit -qm "Initial commit from agent-template" )

cat <<EOF

✅ Scaffolded '$NAME'.

Next steps:
  1. cd "$DEST"
  2. Set env/secrets (gitignored): create .env / .env.local with at least
       GITHUB_TOKEN=...                      # for the github MCP server
       # SUPABASE_* / VERCEL_* if you enable those in .mcp.json
  3. Install git hooks (if not already done by this script):
       bash scripts/install-hooks.sh
  4. Install + smoke-test the dev-team harness:
       cd agents && npm install && npm run test:agents
  5. Open the project in Claude Code and confirm:
       - the 6 subagents appear in the agent picker
       - skills resolve via /<name>
       - .mcp.json prompts to approve 'github'
  6. Fill in placeholders (<STACK>, <PROD_DOMAIN>, …) in CLAUDE.md / AGENTS.md /
     CONTEXT.md and .claude/skills/prod-triage/SKILL.md, and describe your module
     layout in agents/dev-team/modules.config.ts.
  7. Template inheritance is wired (template-lock.json + 'template' remote). To pull
     later template updates:  bash scripts/sync-from-template.sh --update
     For the weekly auto-PR (.github/workflows/template-sync.yml), add a repo secret
     TEMPLATE_SYNC_TOKEN — a PAT with read access to phix/agent-template.
EOF
