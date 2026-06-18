#!/usr/bin/env bash
# One-command local gate for adding/changing a checker. Mirrors CI and adds the
# public-surface and committed-secret guards plus a CLI smoke. Run from repo root.
set -euo pipefail

step() { printf '\n\033[1m[verify] %s\033[0m\n' "$1"; }

step "lint";              npm run lint
step "forbidden imports"; bash scripts/check-forbidden-imports.sh
step "public surface";    bash scripts/check-public-surface.sh
step "committed secrets"; node scripts/check-no-committed-secrets.mjs
step "typecheck";         npm run typecheck
step "build";             npm run build
step "test";              npm test
step "CLI smoke (list)";  node bin/launchcheck.mjs list >/dev/null && echo "  ✓ launchcheck list ran"

printf '\n\033[1m[verify] ALL GREEN\033[0m\n'
