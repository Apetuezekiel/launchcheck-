import type { RegistryEntry } from '../types.js';

/** Registry entries for the dependencies category (5 static checkers). */
export const dependenciesCheckers: ReadonlyArray<RegistryEntry> = [
  {
    id: 'dependencies-outdated',
    name: 'No deprecated dependencies',
    category: 'dependencies',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      "Runs `npm outdated --json` plus a registry query (or parses npm's deprecation flag) to flag deprecated packages. Outdated-but-not-deprecated is `info`-level.",
  },
  {
    id: 'license-compatibility',
    name: 'No copyleft licenses in proprietary projects',
    category: 'dependencies',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'Walks dependency tree, checks SPDX license identifier. Default deny list: GPL-*, AGPL-*, LGPL-* (configurable). Skips when `treatProprietaryAsDefault: false` in options.',
    optionsKey: 'license-compatibility',
  },
  {
    id: 'lockfile-committed',
    name: 'Lockfile committed to repo',
    category: 'dependencies',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'Checks `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` is tracked at `<projectDir>` (monorepo-scoped). Skips when `gitRoot === null`.',
    requiresGit: true,
  },
  {
    id: 'npm-audit',
    name: 'No critical vulnerabilities',
    category: 'dependencies',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'critical',
    description:
      'Runs `npm audit --json`; fails on any `critical`, warns on `high`, ignores moderate/low. Severity escalates to `critical` on any critical finding.',
    emitsMultipleResults: true,
  },
  {
    id: 'unused-dependencies',
    name: 'No unused dependencies',
    category: 'dependencies',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'minor',
    description:
      'Cross-references `package.json` `dependencies` against import/require statements in `src/`. Excludes obvious peer/dev deps. Heuristic — high FP risk; default severity `info`, can be elevated via config.',
  },
] as const;
