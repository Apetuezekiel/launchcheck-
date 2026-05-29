import * as path from 'node:path';
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';
import { isGitTracked } from '../context/git.js';

const CHECKER_ID = 'lockfile-committed';
const RESULT_ID = 'lockfile-committed';
const CATEGORY = 'dependencies' as const;
const SEVERITY = 'major' as const;

/** Lockfile candidates checked at projectDir, in spec declaration order. */
const LOCKFILE_CANDIDATES: ReadonlyArray<string> = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/** Per-candidate disposition after the existence + tracked-by-git probe. */
type CandidateState = 'tracked' | 'untracked-on-disk' | 'absent';

interface CandidateResult {
  readonly name: string;
  readonly state: CandidateState;
}

function makeResult(
  status: CheckResult['status'],
  message: string,
  extras: { fix?: string; detail?: string } = {},
): CheckResult {
  const r: CheckResult = {
    checkerId: CHECKER_ID,
    resultId: RESULT_ID,
    status,
    severity: SEVERITY,
    category: CATEGORY,
    message,
  };
  if (extras.fix !== undefined) r.fix = extras.fix;
  if (extras.detail !== undefined) r.detail = extras.detail;
  return r;
}

/**
 * Static checker: verifies that a package manager lockfile is committed
 * to git at the project root. Monorepo-scoped — only the project's own
 * directory is checked; a workspace package that relies on the root
 * lockfile fails this check (disable it in `.launchcheckrc` for
 * workspace packages, or set projectDir to the monorepo root).
 *
 * Emits exactly one CheckResult.
 *
 *   - 'pass' — at least one of package-lock.json / yarn.lock /
 *     pnpm-lock.yaml exists at projectDir AND is git-tracked. Detail
 *     lists the tracked lockfile(s).
 *   - 'fail' (severity major) — none of the candidates is git-tracked.
 *     Detail distinguishes "present on disk but not added" (very
 *     likely the user forgot `git add`) from "absent" (no lockfile at
 *     all).
 *   - 'skip' — gitRoot is null (no git repo, or git unavailable), or
 *     ctx.project is null, or the run aborted before scanning.
 */
export const lockfileCommittedChecker: Checker = {
  id: CHECKER_ID,
  name: 'Lockfile committed to repo',
  category: CATEGORY,
  mode: 'static',

  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const project = ctx.project;
    if (project === null) {
      return [makeResult('skip', 'Skipped: no project context.')];
    }
    if (ctx.signal.aborted) {
      return [makeResult('skip', 'Skipped: scan aborted before completion.')];
    }
    if (project.gitRoot === null) {
      return [
        makeResult(
          'skip',
          'Skipped: not a git repository (or git unavailable); cannot verify lockfile tracking.',
        ),
      ];
    }
    const gitRoot = project.gitRoot;

    try {
      const states: CandidateResult[] = [];
      for (const name of LOCKFILE_CANDIDATES) {
        if (ctx.signal.aborted) {
          return [makeResult('skip', 'Skipped: scan aborted before completion.')];
        }
        const absPath = path.join(project.projectDir, name);
        const exists = await project.fs.exists(absPath);
        if (!exists) {
          states.push({ name, state: 'absent' });
          continue;
        }
        const tracked = await isGitTracked(gitRoot, absPath);
        states.push({ name, state: tracked ? 'tracked' : 'untracked-on-disk' });
      }

      const tracked = states.filter((s) => s.state === 'tracked').map((s) => s.name);
      if (tracked.length > 0) {
        return [
          makeResult('pass', `Lockfile committed: ${tracked.join(', ')}.`, {
            detail: tracked.join('\n'),
          }),
        ];
      }

      const untracked = states.filter((s) => s.state === 'untracked-on-disk').map((s) => s.name);
      if (untracked.length > 0) {
        return [
          makeResult('fail', `Lockfile present but not committed: ${untracked.join(', ')}.`, {
            detail: untracked.join('\n'),
            fix: `Run \`git add ${untracked[0]} && git commit\` to commit the lockfile so dependency resolution is reproducible.`,
          }),
        ];
      }

      return [
        makeResult('fail', 'No lockfile found at the project root.', {
          detail: LOCKFILE_CANDIDATES.join('\n'),
          fix: 'Run `npm install` (or `yarn` / `pnpm install`) and commit the resulting lockfile.',
        }),
      ];
    } catch (err) {
      return [
        makeResult('fail', `lockfile-committed failed: ${(err as Error).message}`, {
          fix: 'Re-run the scan; if it keeps failing, verify the project directory is readable and git is available.',
        }),
      ];
    }
  },
};
