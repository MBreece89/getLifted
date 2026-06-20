#!/usr/bin/env bash
# Called after every merge: delete-branch.sh <branch-name>
# Tries remote deletion first; falls back to manual instructions on 403.
set -euo pipefail

BRANCH="${1:-}"
if [[ -z "$BRANCH" || "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  echo "delete-branch: skipping '${BRANCH}' (no name or protected)"
  exit 0
fi

echo "delete-branch: cleaning up '${BRANCH}'"

# ── Remote deletion ───────────────────────────────────────────────────────────
REMOTE_ERR=$(git push origin --delete "$BRANCH" 2>&1) && REMOTE_OK=1 || REMOTE_OK=0
if [[ $REMOTE_OK -eq 1 ]]; then
  echo "delete-branch: remote '${BRANCH}' deleted"
else
  # 403 = environment proxy blocks push-delete; surface clearly for manual action
  if echo "$REMOTE_ERR" | grep -q "403"; then
    echo ""
    echo "⚠️  Remote branch '${BRANCH}' could NOT be deleted automatically."
    echo "   The environment proxy blocks 'git push --delete'."
    echo "   Delete it manually: GitHub → Branches tab → '${BRANCH}' → Delete"
    echo "   Or on the closed PR page → 'Delete branch' button."
    echo ""
  else
    echo "delete-branch: remote deletion failed: $REMOTE_ERR"
  fi
fi

# ── Local deletion ────────────────────────────────────────────────────────────
if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  git branch -d "$BRANCH" 2>/dev/null \
    || git branch -D "$BRANCH" 2>/dev/null \
    || echo "delete-branch: local branch '${BRANCH}' not deleted (may not exist)"
  echo "delete-branch: local '${BRANCH}' deleted"
else
  echo "delete-branch: no local branch '${BRANCH}' to delete"
fi
