#!/usr/bin/env bash
# Install repo git hooks. Run once after cloning (or after template init).
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SCRIPTS_DIR="$REPO_ROOT/scripts"

install_hook() {
  local name="$1"
  local src="$SCRIPTS_DIR/$name"
  local dst="$HOOKS_DIR/$name"
  if [[ ! -f "$src" ]]; then
    echo "install-hooks: no script at $src, skipping $name"
    return
  fi
  cp "$src" "$dst"
  chmod +x "$dst"
  echo "install-hooks: installed $name"
}

install_hook pre-commit

echo "install-hooks: done. Run 'git commit' to verify."
