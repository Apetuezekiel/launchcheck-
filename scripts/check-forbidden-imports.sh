#!/usr/bin/env bash
# Block imports of code paths flagged in KNOWN-ISSUES.md.
# See KNOWN-ISSUES.md for rationale.
set -euo pipefail

PATTERNS=(
  "glob/dist/cli"
  "glob/cli"
  "undici/lib/web/websocket"
)

EXTS=(--include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.cjs")

FOUND=0
for pattern in "${PATTERNS[@]}"; do
  if grep -rE "(from|require\()\s*['\"]${pattern}" src/ "${EXTS[@]}" 2>/dev/null; then
    echo "::error::Forbidden import detected: ${pattern}"
    FOUND=1
  fi
done

if [ ${FOUND} -eq 1 ]; then
  echo ""
  echo "Forbidden imports detected. See KNOWN-ISSUES.md for the runtime-dependency"
  echo "reachability policy that motivates these blocks."
  exit 1
fi

echo "✓ No forbidden imports found"
