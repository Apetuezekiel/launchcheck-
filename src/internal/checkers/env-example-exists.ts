import * as path from 'node:path';
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const CHECKER_ID = 'env-example-exists';
const RESULT_ID = 'env-example-present';
const CATEGORY = 'deployment' as const;
const SEVERITY = 'minor' as const;

/**
 * Glob patterns matched at the project root (no `**` — root-only by design,
 * matching the convention that `.env.example` lives at the project root).
 * Examples that match:
 *   - .env.example      (canonical form)
 *   - .env.template     (alternate convention)
 *   - .env-example
 *   - .env.dev.example  (multi-environment template)
 *   - .envexample       (no separator)
 * Examples that intentionally DO NOT match:
 *   - .env.example.local  (local-override convention, not the template)
 *   - .env.example.md     (documentation, not the template itself)
 *   - sub/dir/.env.example (subdir; root-only by design)
 */
const PATTERNS: ReadonlyArray<string> = ['.env*example', '.env*template'];

function single(status: CheckResult['status'], message: string, fix?: string): CheckResult {
  const r: CheckResult = {
    checkerId: CHECKER_ID,
    resultId: RESULT_ID,
    status,
    severity: SEVERITY,
    category: CATEGORY,
    message,
  };
  if (fix !== undefined) r.fix = fix;
  return r;
}

/**
 * Static checker: confirms the project documents its expected environment
 * variables via a `.env*example` or `.env*template` file at the project
 * root. Emits exactly one CheckResult.
 *
 *   - 'pass' — at least one matching file at the project root, listed in
 *     the result's detail field.
 *   - 'fail' — no matching file. The fix field recommends adding one.
 *   - 'skip' — ctx.project is null or the run aborted before scanning.
 *
 * Root-only by design; matches the convention that the env template lives
 * at the project root. In a monorepo workspace, projectDir is the workspace
 * root, so the policy still holds.
 */
export const envExampleExistsChecker: Checker = {
  id: CHECKER_ID,
  name: '.env.example or .env.template present',
  category: CATEGORY,
  mode: 'static',

  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const project = ctx.project;
    if (project === null) {
      return [single('skip', 'Skipped: no project context.')];
    }
    if (ctx.signal.aborted) {
      return [single('skip', 'Skipped: scan aborted before completion.')];
    }

    try {
      const matches = await project.fs.glob([...PATTERNS]);
      if (matches.length > 0) {
        const names = matches
          .map((abs) => path.relative(project.projectDir, abs).split(path.sep).join('/'))
          .sort();
        return [
          {
            checkerId: CHECKER_ID,
            resultId: RESULT_ID,
            status: 'pass',
            severity: SEVERITY,
            category: CATEGORY,
            message: `Found ${names.length} env example/template file(s) at the project root.`,
            detail: names.join('\n'),
          },
        ];
      }
      return [
        single(
          'fail',
          'No .env.example or .env.template file found at the project root.',
          'Add a `.env.example` (or `.env.template`) at the project root listing the environment variables your project expects. New contributors copy it to `.env` to get started.',
        ),
      ];
    } catch (err) {
      return [
        single(
          'fail',
          `env-example-exists failed: ${(err as Error).message}`,
          'Re-run the scan; if it keeps failing, verify the project directory is readable.',
        ),
      ];
    }
  },
};
