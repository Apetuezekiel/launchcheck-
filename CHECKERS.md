# Adding a checker

This is the playbook for implementing a registry checker. The mechanical gate is
`npm run verify`; this document covers the judgment that the gate cannot.

## Procedure

1. Pick the registry entry from `src/internal/registry/categories/<category>.ts`.
   Read it. The entry — not your assumptions — is the source of truth for `id`,
   `name`, `category`, `mode`, `maxSeverity`, `optionsKey`, `thresholdKeys`,
   `requiresPeerDep`, and `emitsMultipleResults`.
2. Implement `src/internal/checkers/<id>.ts` exporting one `Checker`.
3. Add `src/internal/checkers/__tests__/<id>.test.ts`.
4. Wire it into `src/internal/orchestrator/registered-checkers.ts`: one import
   (alphabetical) and one entry appended to `ALL_CHECKERS`.
5. `npm run verify`. Do not open a PR until it prints `ALL GREEN`.

The only existing-file change is `registered-checkers.ts`. The registry entry
already exists — never edit it to match your code; fix your code to match it.

## Judgment checklist (the gate cannot decide these)

- **Severity equals the registry `maxSeverity`.** eslint=major/major,
  readme=minor/minor, secret-scan=critical/critical. Drift here compiles and
  passes tests but is wrong.
- **Options conform to the public type in `src/types/checker-options.ts`.** Do
  not invent an options shape. If the entry has an `optionsKey`, there is a
  typed shape; read `ctx.config.checkerOptions[key]` against it with a guard.
- **`emitsMultipleResults`** → one `fail` per matched category (resultId = the
  category id) and a single consolidated `pass` when clean. Otherwise emit
  exactly one result.
- **Result-status semantics:** no config / N/A → `skip`; coverage missing but
  possibly intentional → `warn`; actual violation → `fail`; clean → `pass`.
  `warn` and `skip` do not affect the exit code.
- **Every `fail` carries a non-empty `fix`** — including the catch-block path.
- **Subprocess / IO behind a deps seam.** Export a `XxxDeps` interface and a
  `runXxx(ctx, deps?)` core; the default dep does the real IO, tests inject a
  mock, and the real subprocess never runs in tests. Capture non-zero exits;
  re-throw environmental errors (ENOENT, timeout, abort) → map to a runtime-error
  `fail`.
- **Secrets / tokens are masked in output and never committed.** Mask matched
  values; assemble any token-shaped test fixture from fragments
  (e.g. `` `AKIA${'A'.repeat(16)}` ``) so no contiguous provider token lands in
  source — `npm run check:secrets` enforces this and a full token will be
  flagged by GitGuardian / push protection (it got secret-scan reverted once).
- **Internal-only.** Nothing in `src/internal/**` is re-exported through
  `src/index.ts` (`npm run check:surface` enforces it).
- **Self-scan safety** for source-scanning checkers: shape pattern literals so
  they do not match their own source, and exclude test files
  (`*.test.*`, `*.spec.*`, `__tests__/`).

## Skeleton — checker

```ts
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const CHECKER_ID = '<id>';
const CATEGORY = '<category>' as const;
const SEVERITY = '<maxSeverity-from-registry>' as const;

export const xxxChecker: Checker = {
  id: CHECKER_ID,
  name: '<name-from-registry>',
  category: CATEGORY,
  mode: 'static',
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const project = ctx.project;
    if (project === null) {
      return [/* skip 'no-project-context' */];
    }
    if (ctx.signal.aborted) {
      return [/* skip 'aborted' */];
    }
    // ... detect → (optionally run injected dep) → pass / warn / fail ...
    return [];
  },
};
```

## Skeleton — test

```ts
import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { xxxChecker } from '../<id>.js';
import { makeProjectContext, makeStaticContext } from './context.js';

describe('xxxChecker', () => {
  test('matches the registry entry', () => {
    const entry = findById('<id>');
    expect(xxxChecker.id).toBe(entry?.id);
    expect(xxxChecker.category).toBe(entry?.category);
    expect(xxxChecker.mode).toBe(entry?.mode);
  });
  // skip (no project / aborted), each pass/warn/fail path, options, edges.
  // Subprocess checkers: inject a mocked deps; never run the real binary.
});
```
