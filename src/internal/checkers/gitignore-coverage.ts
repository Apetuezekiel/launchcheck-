import * as path from 'node:path';
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const CHECKER_ID = 'gitignore-coverage';
const CATEGORY = 'code-quality' as const;
const SEVERITY = 'major' as const;

/**
 * One required pattern category. A category is "covered" when at least one
 * non-comment, non-negation .gitignore line satisfies its predicate. Tests
 * targeting specific categories should use the canonical resultId form
 * `missing-<id>`.
 */
interface RequiredCategory {
  /** Stable slug used in the resultId (e.g. 'node-modules' → 'missing-node-modules'). */
  readonly id: string;
  /** Human description for the result message. */
  readonly description: string;
  /** Suggested remediation when this category is missing. */
  readonly fix: string;
  /** Returns true when `line` (already trimmed) covers this category. */
  readonly covers: (line: string) => boolean;
}

/**
 * The required-pattern categories the checker verifies. Each predicate is
 * intentionally permissive — it accepts the common ways developers express
 * the category (leading slash, trailing slash, `**\/` prefix) but only
 * positive patterns. Negation lines (`!foo`) and comments (`#foo`) are
 * stripped before any predicate runs.
 */
const REQUIRED_CATEGORIES: ReadonlyArray<RequiredCategory> = [
  {
    id: 'node-modules',
    description: 'node_modules directory',
    fix: "Add 'node_modules' to .gitignore.",
    covers: (line) => /^\/?(\*\*\/)?node_modules\/?$/.test(line),
  },
  {
    id: 'env-files',
    description: 'environment files (.env*)',
    fix: "Add '.env*' (or both '.env' and '.env.*') to .gitignore.",
    covers: (line) => /^\.env(\*|\..+)?\/?$/.test(line),
  },
  {
    id: 'dist',
    description: 'dist build output directory',
    fix: "Add 'dist' to .gitignore.",
    covers: (line) => /^\/?(\*\*\/)?dist\/?$/.test(line),
  },
  {
    id: 'build-output',
    description: 'build / out directory',
    fix: "Add 'build' (or 'out' for static-export setups) to .gitignore.",
    covers: (line) => /^\/?(\*\*\/)?(build|out)\/?$/.test(line),
  },
  {
    id: 'ds-store',
    description: '.DS_Store macOS metadata files',
    fix: "Add '.DS_Store' to .gitignore.",
    covers: (line) => /^(\*\*\/)?\.DS_Store\??$/.test(line),
  },
  {
    id: 'ide-configs',
    description: 'IDE configuration files (.vscode, .idea, *.iml, .vs)',
    fix: "Add at least one of '.vscode', '.idea', '*.iml', or '.vs' to .gitignore.",
    covers: (line) => /^(\*\*\/)?(\.vscode|\.idea|\*\.iml|\.vs)\/?$/.test(line),
  },
];

function makeResult(
  status: CheckResult['status'],
  resultId: string,
  message: string,
  fix?: string,
): CheckResult {
  const result: CheckResult = {
    checkerId: CHECKER_ID,
    resultId,
    status,
    message,
    severity: SEVERITY,
    category: CATEGORY,
  };
  if (fix !== undefined) {
    result.fix = fix;
  }
  return result;
}

/**
 * Parses .gitignore content into a list of effective pattern lines.
 * Strips a UTF-8 BOM, normalizes CRLF, trims whitespace, drops blank lines,
 * full-line comments (`#`), and negation lines (`!`). Negations cannot
 * satisfy required-pattern coverage; they only un-ignore.
 */
function parseGitignore(content: string): string[] {
  return content
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('!'));
}

/**
 * Static checker: verifies the project's `.gitignore` covers the common
 * required patterns (node_modules, .env*, dist, build output, .DS_Store,
 * IDE configs). Emits multiple CheckResults:
 *   - one 'warn' with resultId 'no-gitignore-file' when the file is absent
 *     (monorepo subpackages may legitimately rely on a parent .gitignore;
 *     coverage cannot be verified but the absence is not a release blocker)
 *   - one 'fail' with resultId 'no-gitignore-file' when the file exists
 *     but is unreadable
 *   - one 'fail' per missing category with resultId `missing-<id>`
 *   - one 'pass' with resultId 'all-categories-covered' when all required
 *     categories are present
 * Reads only the project's own .gitignore at `<projectDir>/.gitignore`;
 * a parent / git-root .gitignore does not count for a monorepo subpackage.
 */
export const gitignoreCoverageChecker: Checker = {
  id: CHECKER_ID,
  name: '.gitignore covers required patterns',
  category: CATEGORY,
  mode: 'static',

  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const project = ctx.project;
    if (project === null) {
      return [makeResult('skip', 'no-project-context', 'Skipped: no project context.')];
    }

    try {
      if (ctx.signal.aborted) {
        return [makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.')];
      }

      const gitignorePath = path.join(project.projectDir, '.gitignore');
      const exists = await project.fs.exists(gitignorePath);
      if (!exists) {
        // No .gitignore at the project root: WARN, do not FAIL. Monorepo
        // subpackages may legitimately rely on a parent .gitignore; toy
        // projects and bare fixtures simply lack one. Coverage cannot be
        // verified, but the absence is not a release blocker on its own.
        return [
          makeResult(
            'warn',
            'no-gitignore-file',
            'No .gitignore at project root; coverage checks skipped.',
            'Create a .gitignore at the project root covering node_modules, dist, .env*, .DS_Store, and IDE configs.',
          ),
        ];
      }

      let content: string;
      try {
        content = await project.fs.readText(gitignorePath);
      } catch (err) {
        return [
          makeResult(
            'fail',
            'no-gitignore-file',
            `Could not read .gitignore: ${(err as Error).message}`,
            'Ensure .gitignore is readable.',
          ),
        ];
      }

      const lines = parseGitignore(content);
      const missing: CheckResult[] = [];

      for (const category of REQUIRED_CATEGORIES) {
        if (!lines.some((line) => category.covers(line))) {
          missing.push(
            makeResult(
              'fail',
              `missing-${category.id}`,
              `.gitignore is missing required pattern: ${category.description}.`,
              category.fix,
            ),
          );
        }
      }

      if (missing.length === 0) {
        return [
          makeResult(
            'pass',
            'all-categories-covered',
            'All required .gitignore patterns are covered.',
          ),
        ];
      }
      return missing;
    } catch (err) {
      return [
        makeResult(
          'fail',
          '__error__',
          `gitignore-coverage failed: ${(err as Error).message}`,
          'Re-run the scan; if it keeps failing, verify the project directory is readable.',
        ),
      ];
    }
  },
};
