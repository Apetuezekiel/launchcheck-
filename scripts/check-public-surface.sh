#!/usr/bin/env bash
# Enforce the architecture invariant: the public entry (src/index.ts) re-exports
# ONLY from src/types. Any re-export from src/internal/** (checkers, orchestrator,
# etc.) leaks internal symbols into the published surface.
set -euo pipefail

ENTRY="src/index.ts"

# Every module specifier the entry imports/exports from, minus the allowed
# ./types* paths. Anything left is a leak.
BAD="$(grep -nE "from[[:space:]]+['\"]" "$ENTRY" \
  | grep -oE "['\"][^'\"]+['\"]" \
  | tr -d "\"'" \
  | grep -vE "^\./types(/.*)?$" || true)"

if [ -n "${BAD}" ]; then
  echo "::error::Public entry (${ENTRY}) re-exports non-types modules:"
  echo "${BAD}"
  echo ""
  echo "Public surface = src/types only. src/internal/** must never be re-exported."
  exit 1
fi

echo "✓ Public surface is types-only"
