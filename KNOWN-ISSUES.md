# Known issues

This file tracks audit findings and architectural constraints that are
knowingly deferred rather than fixed. Every entry includes the date it was
locked, the rationale, and the trigger that would re-open it.

## Audit findings (npm audit, locked 2026-05-19)

Disposition policy: a vulnerability in a runtime dependency blocks ONLY if
the vulnerable code path is reachable from launchcheck's actual usage.
Build-only deps (vitest, tsup, biome, their transitives) never block — they
are not in the shipped artifact.

| Severity | Package | CVE/GHSA | Path | Disposition | Re-open trigger |
|---|---|---|---|---|---|
| critical | vitest | GHSA-9crc-q9x8-hgqq | dev only | Build-only; RCE requires --api flag (not enabled in our config) | Upstream patch lands → bump |
| high | glob | GHSA-5j98-mcp5-4vw2 | direct runtime dep | Library API only; vulnerable surface is the glob CLI bin which we never import | Patched release of glob → bump |
| high | undici | GHSA-f269-vfmq-vjvj +7 related | direct runtime dep | All findings are in undici WebSocket; v1 uses HTTP fetch only | If any v1+ checker imports undici's WebSocket → block; patched release → bump |
| moderate | esbuild | GHSA-67mh-4wv8-2f99 | tsup, vitest→vite transitives | Build-only; dev-server SOP bypass not reachable in CI | Upstream patch → bump |
| moderate | vite | GHSA-4w7w-66w2-5vf9 | vitest→vite transitive | Build-only; path traversal in optimized-deps .map handling | Upstream patch → bump |
| moderate | vite-node | inherited from vite | vitest→vite-node transitive | Build-only; inherited from vite | Patched vite → re-evaluate |
| moderate | @vitest/mocker | inherited from vite | vitest→@vitest/mocker | Build-only; inherited from vite | Patched vite → re-evaluate |
| moderate | tsup | inherited from esbuild | direct dev dep | Build-only; inherited from esbuild | Patched esbuild → re-evaluate |

## Architectural constraints derived from audit policy

- Do NOT import `glob/dist/cli` or `glob/cli` anywhere in src/.
  The glob CLI is the vulnerable surface in GHSA-5j98-mcp5-4vw2. We use the
  library API exclusively.
- Do NOT import `undici/lib/web/websocket/**` or any undici WebSocket
  symbol anywhere in src/. v1 uses HTTP only. Adding WebSocket usage
  requires re-opening the undici audit row.

A grep-based CI step (scripts/check-forbidden-imports.sh) enforces both
constraints on every push.

## Maintenance procedure

On every dependency upgrade pass:
1. Re-run `npm audit --json`.
2. Clear any row whose patched version is now installed.
3. For any new finding, classify (runtime/build-only) and apply the
   disposition policy. Add a row here.
4. Never run `npm audit fix --force`.
