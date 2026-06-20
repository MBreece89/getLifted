#!/usr/bin/env bash
# sync-agent-config.sh — regenerate per-tool agent adapters from the canonical
# AGENTS.md (+ .mcp.json), so no tool's config can drift out of sync.
#
#   scripts/sync-agent-config.sh           # write/refresh the adapters
#   scripts/sync-agent-config.sh --check   # exit 1 if any adapter is stale (CI / pre-commit)
#
# Canonical sources : AGENTS.md, .mcp.json
# Generated adapters: GEMINI.md, .cursor/rules/agents.mdc, .cursor/mcp.json
# Not generated     : CLAUDE.md (imports AGENTS.md via `@AGENTS.md`),
#                     Codex (reads AGENTS.md natively).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
MODE="${1:-write}"

if [[ ! -f AGENTS.md ]]; then
  echo "error: AGENTS.md (the canonical source) not found in $ROOT" >&2
  exit 1
fi

BANNER="<!-- AUTO-GENERATED from AGENTS.md by scripts/sync-agent-config.sh — DO NOT EDIT. Edit AGENTS.md and re-run the script. -->"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Gemini CLI: GEMINI.md = banner + the canonical instructions.
{ printf '%s\n\n' "$BANNER"; cat AGENTS.md; } > "$TMP/GEMINI.md"

# Cursor rule: .mdc = frontmatter (always apply) + banner + the canonical instructions.
{
  printf -- '---\ndescription: Project instructions (generated from AGENTS.md)\nalwaysApply: true\n---\n\n'
  printf '%s\n\n' "$BANNER"
  cat AGENTS.md
} > "$TMP/agents.mdc"

# Cursor MCP: same schema as .mcp.json, so a straight copy.
if [[ -f .mcp.json ]]; then cp .mcp.json "$TMP/cursor-mcp.json"; fi

STALE=0
sync_one() { # sync_one <generated-temp> <destination>
  local src="$1" dst="$2"
  [[ -f "$src" ]] || return 0
  if [[ "$MODE" == "--check" ]]; then
    if [[ ! -f "$dst" ]] || ! diff -q "$src" "$dst" >/dev/null 2>&1; then
      echo "STALE: $dst"; STALE=1
    fi
  else
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "wrote $dst"
  fi
}

sync_one "$TMP/GEMINI.md"     GEMINI.md
sync_one "$TMP/agents.mdc"    .cursor/rules/agents.mdc
sync_one "$TMP/cursor-mcp.json" .cursor/mcp.json

if [[ "$MODE" == "--check" ]]; then
  if [[ "$STALE" -ne 0 ]]; then
    echo "" >&2
    echo "Adapters are stale. Run: scripts/sync-agent-config.sh" >&2
    exit 1
  fi
  echo "all agent adapters are in sync with AGENTS.md"
fi
