import type { RegistryEntry } from '../types.js';

/** Registry entries for the code-quality category (7 static checkers). */
export const codeQualityCheckers: ReadonlyArray<RegistryEntry> = [
  {
    id: 'console-log-scan',
    name: 'No console statements in production code',
    category: 'code-quality',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'AST/regex scan for `console.log`, `console.debug`, `console.error`, `console.warn`, `debugger` statements in `src/` and equivalent (excludes test files matching `*.test.*`, `*.spec.*`, `__tests__/**`).',
  },
  {
    id: 'eslint-passing',
    name: 'ESLint configured and passing',
    category: 'code-quality',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'Detects ESLint config (`.eslintrc*`, `eslint.config.*`, or `eslintConfig` in package.json); runs `npx eslint .` and parses JSON output. Skips when no config.',
  },
  {
    id: 'gitignore-coverage',
    name: '.gitignore covers required patterns',
    category: 'code-quality',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'Reads `<projectDir>/.gitignore`; checks for required patterns: `node_modules`, `.env*`, `dist`, build output, `.DS_Store`, IDE configs. Emits one result per missing pattern category.',
    emitsMultipleResults: true,
  },
  {
    id: 'large-files-in-git-history',
    name: 'No large files in git history',
    category: 'code-quality',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'minor',
    description:
      'Walks git history filtered to `projectDir` (monorepo policy); flags any tracked file exceeding `thresholds.large-file-bytes`. Skips when `gitRoot === null`.',
    thresholdKeys: ['large-file-bytes'],
    requiresGit: true,
  },
  {
    id: 'prettier-passing',
    name: 'Prettier configured and passing',
    category: 'code-quality',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'minor',
    description:
      'Detects Prettier config (`.prettierrc*`, `prettier.config.*`, `prettier` in package.json); runs `npx prettier --check .`. Skips when no config.',
  },
  {
    id: 'todo-fixme-scan',
    name: 'No TODO/FIXME markers in production code',
    category: 'code-quality',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'minor',
    description:
      'Regex scan for `TODO`, `FIXME`, `XXX`, `HACK` comments in source files, excluding test files.',
  },
  {
    id: 'typescript-strict-compile',
    name: 'TypeScript strict mode + zero errors',
    category: 'code-quality',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'Detects `tsconfig.json`; if `strict: true`, runs `tsc --noEmit` and parses output for diagnostics. Skips when no tsconfig. Requires `typescript` peer dep.',
    requiresPeerDep: 'typescript',
  },
] as const;
