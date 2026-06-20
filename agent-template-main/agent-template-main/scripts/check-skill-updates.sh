#!/usr/bin/env bash
# check-skill-updates.sh — compare GitHub-sourced skills against their upstream source.
#
# Usage:
#   bash scripts/check-skill-updates.sh            # report only; exit 1 if any updates found
#   bash scripts/check-skill-updates.sh --update   # download changed files + update hashes
#   bash scripts/check-skill-updates.sh --update --ci
#     CI mode: same as --update but writes .skill-updates-summary.md and always exits 0
#     (PR creation happens in the caller — the summary file signals that a PR is needed)
#
# Requires: curl, jq
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_FILE="$REPO_ROOT/skills-lock.json"
SKILLS_DIR="$REPO_ROOT/.claude/skills"
SUMMARY_FILE="$REPO_ROOT/.skill-updates-summary.md"
UPSTREAM_BRANCH="main"

UPDATE=0
CI_MODE=0
for arg in "$@"; do
  case "$arg" in
    --update) UPDATE=1 ;;
    --ci)     CI_MODE=1 ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "check-skill-updates: jq is required (brew install jq  or  apt-get install jq)" >&2
  exit 2
fi

# Portable SHA-256: prefer sha256sum (Linux), fall back to shasum -a 256 (macOS).
sha256_of_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Collect names of all github-sourced skills from the lock file.
# Use while-read rather than mapfile: macOS ships with bash 3.2 which lacks mapfile.
skills=()
while IFS= read -r line; do
  skills+=("$line")
done < <(jq -r '.skills | to_entries[] | select(.value.sourceType == "github") | .key' "$LOCK_FILE")

updated=()
failed=()

echo "Checking ${#skills[@]} GitHub-sourced skills against upstream …"
echo ""

for skill in "${skills[@]}"; do
  source=$(jq -r ".skills[\"$skill\"].source"      "$LOCK_FILE")
  path=$(jq -r   ".skills[\"$skill\"].skillPath"   "$LOCK_FILE")
  stored=$(jq -r ".skills[\"$skill\"].computedHash" "$LOCK_FILE")

  url="https://raw.githubusercontent.com/$source/$UPSTREAM_BRANCH/$path"
  tmpfile=$(mktemp)

  http_code=$(curl -sL -w "%{http_code}" -o "$tmpfile" "$url")

  if [[ "$http_code" != "200" ]]; then
    echo "  ! $skill — fetch failed (HTTP $http_code) from $url"
    failed+=("$skill (HTTP $http_code)")
    rm -f "$tmpfile"
    continue
  fi

  newHash=$(sha256_of_file "$tmpfile")

  if [[ "$newHash" == "$stored" ]]; then
    echo "  ✓ $skill"
  else
    echo "  ↑ $skill — upstream changed"
    updated+=("$skill")

    if [[ $UPDATE -eq 1 ]]; then
      dest="$SKILLS_DIR/$skill/SKILL.md"
      cp "$tmpfile" "$dest"
      # Update the stored hash in skills-lock.json (in-place via temp file).
      tmp_lock=$(mktemp)
      jq ".skills[\"$skill\"].computedHash = \"$newHash\"" "$LOCK_FILE" > "$tmp_lock"
      mv "$tmp_lock" "$LOCK_FILE"
      echo "    → updated $dest"
    fi
  fi

  rm -f "$tmpfile"
done

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────

if [[ ${#failed[@]} -gt 0 ]]; then
  echo "Fetch errors (${#failed[@]}):"
  for f in "${failed[@]}"; do echo "  ! $f"; done
  echo ""
fi

if [[ ${#updated[@]} -eq 0 ]]; then
  echo "All skills up to date."
  rm -f "$SUMMARY_FILE"  # clean up from a previous run
  exit 0
fi

# Build the summary (used both for human output and as the PR body in CI).
SUMMARY="$(cat <<HEREDOC
## Skill updates from upstream

${#updated[@]} skill(s) changed since they were last synced:

$(for s in "${updated[@]}"; do
  src=$(jq -r ".skills[\"$s\"].source"    "$LOCK_FILE")
  sp=$(jq -r  ".skills[\"$s\"].skillPath" "$LOCK_FILE")
  echo "- \`$s\` — [view source](https://github.com/$src/blob/main/$sp)"
done)

Review the diff in each file before merging.
HEREDOC
)"

if [[ $CI_MODE -eq 1 ]]; then
  printf '%s\n' "$SUMMARY" > "$SUMMARY_FILE"
  echo "Wrote $SUMMARY_FILE"
  exit 0
fi

# Local (non-CI): print and exit non-zero so the caller knows updates exist.
echo "$SUMMARY"
exit 1
