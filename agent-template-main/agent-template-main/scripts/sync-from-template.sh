#!/usr/bin/env bash
# sync-from-template.sh — inherit the shared agent-template files into THIS repo.
#
# This is the downstream half of template inheritance: a child project runs it to
# pull the template's shared infra (subagents, skills, hooks, harness core, scripts,
# workflows) from the upstream template repo. Project-owned files (AGENTS.md,
# CLAUDE.md, CONTEXT.md, .mcp.json, modules.config.ts, settings) are NEVER touched.
#
# Usage:
#   bash scripts/sync-from-template.sh             # report drift; exit 1 if any
#   bash scripts/sync-from-template.sh --update    # write inherited files from upstream
#   bash scripts/sync-from-template.sh --update --ci
#       CI mode: same as --update but writes .template-sync-summary.md and always
#       exits 0 (the workflow opens a PR when that summary file exists).
#
# Reads template-lock.json (a default is created on first run if absent):
#   upstream.remote / upstream.branch — where to inherit from
#   inherit[] — repo-relative files/dirs tracked from the template
#   exclude[] — paths under inherit[] that stay project-owned (never written)
#
# Drift = an inherited file whose content differs from the template's. The fix is
# always "make it match the template", which is what enforces the one rule that
# keeps inheritance painless: DON'T hand-edit inherited files — put project-specific
# behavior in the excluded/owned files instead. To intentionally own a shared file,
# add it to exclude[].
#
# Requires: git, jq. Auth: your git credentials must be able to read the upstream
# (in CI, see .github/workflows/template-sync.yml for the private-repo token note).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

LOCK="template-lock.json"
SUMMARY_FILE="$REPO_ROOT/.template-sync-summary.md"
REMOTE_NAME="template"

DEFAULT_REMOTE="https://github.com/phix/agent-template.git"
DEFAULT_BRANCH="main"

UPDATE=0
CI_MODE=0
for arg in "$@"; do
  case "$arg" in
    --update) UPDATE=1 ;;
    --ci)     CI_MODE=1 ;;
  esac
done

command -v jq  >/dev/null 2>&1 || { echo "sync-from-template: jq is required"  >&2; exit 2; }
command -v git >/dev/null 2>&1 || { echo "sync-from-template: git is required" >&2; exit 2; }

# Portable SHA-256 (Linux sha256sum, macOS shasum).
sha256_of_file()  { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
sha256_of_stdin() { if command -v sha256sum >/dev/null 2>&1; then sha256sum      | cut -d' ' -f1; else shasum -a 256      | cut -d' ' -f1; fi; }

# Bootstrap a default manifest the first time. The inherit/exclude lists below are
# the canonical "what every child inherits"; edit template-lock.json per project.
if [[ ! -f "$LOCK" ]]; then
  cat > "$LOCK" <<JSON
{
  "version": 1,
  "upstream": {
    "repo": "phix/agent-template",
    "remote": "$DEFAULT_REMOTE",
    "branch": "$DEFAULT_BRANCH"
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
  echo "created $LOCK (defaults — edit inherit/exclude for this project)"
fi

REMOTE_URL=$(jq -r '.upstream.remote // empty' "$LOCK")
BRANCH=$(jq -r    '.upstream.branch // "main"' "$LOCK")
[[ -z "$REMOTE_URL" ]] && { echo "sync-from-template: upstream.remote missing in $LOCK" >&2; exit 2; }

# Point the 'template' remote at the manifest's upstream and fetch it shallowly.
if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
else
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi
echo "Fetching $REMOTE_NAME ($REMOTE_URL @ $BRANCH) …"
git fetch -q --depth=1 "$REMOTE_NAME" "$BRANCH"
REF="$REMOTE_NAME/$BRANCH"

# Is repo-relative path $1 excluded (exact match or under an excluded dir)?
is_excluded() {
  local f="$1" e
  while IFS= read -r e; do
    [[ -z "$e" ]] && continue
    [[ "$f" == "$e" || "$f" == "$e/"* ]] && return 0
  done < <(jq -r '.exclude[]? // empty' "$LOCK")
  return 1
}

# Enumerate every file the template tracks under the inherit[] paths.
candidates=()
while IFS= read -r f; do
  [[ -n "$f" ]] && candidates+=("$f")
done < <(
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    git ls-tree -r --name-only "$REF" -- "$p" 2>/dev/null || true
  done < <(jq -r '.inherit[]? // empty' "$LOCK") | sort -u
)

changed=()
added=()
for f in "${candidates[@]}"; do
  is_excluded "$f" && continue
  up_hash=$(git show "$REF:$f" | sha256_of_stdin)
  if [[ -f "$f" ]]; then
    loc_hash=$(sha256_of_file "$f")
    [[ "$up_hash" == "$loc_hash" ]] && continue
    changed+=("$f")
  else
    added+=("$f")
  fi
  if [[ $UPDATE -eq 1 ]]; then
    mkdir -p "$(dirname "$f")"
    git show "$REF:$f" > "$f"
  fi
done

total=$(( ${#changed[@]} + ${#added[@]} ))
echo ""
echo "Checked ${#candidates[@]} inherited file(s): ${#added[@]} new, ${#changed[@]} changed."

if [[ $total -eq 0 ]]; then
  echo "Up to date with the template."
  rm -f "$SUMMARY_FILE"
  exit 0
fi

SUMMARY="$(cat <<HEREDOC
## Template sync from $(jq -r '.upstream.repo' "$LOCK")@$BRANCH

$total inherited file(s) differ from the template:

$(for f in "${added[@]}";   do echo "- \`$f\` — new"; done)
$(for f in "${changed[@]}"; do echo "- \`$f\` — updated"; done)

Review the diff before merging. Project-owned files (AGENTS.md, CLAUDE.md,
.mcp.json, modules.config.ts, settings) are excluded and untouched. To keep a
shared file diverged on purpose, add it to \`exclude[]\` in template-lock.json.
HEREDOC
)"

if [[ $CI_MODE -eq 1 ]]; then
  printf '%s\n' "$SUMMARY" > "$SUMMARY_FILE"
  echo "Wrote $SUMMARY_FILE"
  exit 0
fi

echo ""
echo "$SUMMARY"
# Report-only run signals "updates exist" with a non-zero exit; --update applied them.
[[ $UPDATE -eq 1 ]] && exit 0 || exit 1
