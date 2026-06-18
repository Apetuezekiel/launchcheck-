import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const CHECKER_ID = 'ci-config-exists';
const RESULT_ID = 'ci-config-present';
const CATEGORY = 'deployment' as const;
const SEVERITY = 'minor' as const;

/**
 * One CI provider's existence-fingerprint. `globs` are evaluated by
 * project.fs.glob against the project root. The provider "matches" when
 * at least one glob returns at least one file.
 *
 * `globs` is plural for two reasons:
 *   - some providers accept multiple filenames (CircleCI: yml/yaml)
 *   - the spec text uses `circleci/config.yml` without a leading dot,
 *     which is almost certainly a typo for the actual `.circleci/`
 *     convention; we accept both so a corrected spec does not regress
 *     existing fixtures.
 */
interface Provider {
  readonly name: string;
  readonly globs: ReadonlyArray<string>;
}

const PROVIDERS: ReadonlyArray<Provider> = [
  {
    name: 'GitHub Actions',
    // .github/workflows/*.yml or *.yaml. Empty workflows/ dir does NOT
    // satisfy — at least one workflow file must exist.
    globs: ['.github/workflows/*.yml', '.github/workflows/*.yaml'],
  },
  {
    name: 'GitLab CI',
    globs: ['.gitlab-ci.yml', '.gitlab-ci.yaml'],
  },
  {
    name: 'CircleCI',
    // .circleci/config.yml is the actual CircleCI convention. The spec
    // text spells it `circleci/config.yml` without the leading dot,
    // which is almost certainly a typo; we accept both so this checker
    // does not lose coverage when the spec text is corrected.
    globs: [
      '.circleci/config.yml',
      '.circleci/config.yaml',
      'circleci/config.yml',
      'circleci/config.yaml',
    ],
  },
  {
    name: 'Jenkins',
    globs: ['Jenkinsfile'],
  },
  {
    name: 'Buildkite',
    // .buildkite/ holds pipeline YAML files. Any *.yml / *.yaml inside
    // counts; an empty dir does not.
    globs: ['.buildkite/*.yml', '.buildkite/*.yaml'],
  },
];

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
 * Static checker: detects whether the project ships a CI configuration
 * for any of the providers documented in the v1 spec. Emits exactly one
 * CheckResult.
 *
 *   - 'pass' — at least one provider's CI config is present; the result
 *     detail lists every detected provider.
 *   - 'fail' (severity minor) — no CI config found across any provider.
 *     The fix suggests adding one of the supported configs.
 *   - 'skip' — ctx.project is null or the run aborted before scanning.
 *
 * The check is provider-OR: a project with any one supported provider
 * passes. Empty workflows/ or .buildkite/ directories do NOT satisfy —
 * at least one pipeline file must exist.
 */
export const ciConfigExistsChecker: Checker = {
  id: CHECKER_ID,
  name: 'CI configuration present',
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
      const detected: string[] = [];
      for (const provider of PROVIDERS) {
        if (ctx.signal.aborted) {
          return [single('skip', 'Skipped: scan aborted before completion.')];
        }
        const matches = await project.fs.glob([...provider.globs]);
        if (matches.length > 0) {
          detected.push(provider.name);
        }
      }

      if (detected.length > 0) {
        return [
          {
            checkerId: CHECKER_ID,
            resultId: RESULT_ID,
            status: 'pass',
            severity: SEVERITY,
            category: CATEGORY,
            message: `Found CI configuration for ${detected.length} provider(s).`,
            detail: detected.join(', '),
          },
        ];
      }

      return [
        single(
          'fail',
          'No CI configuration found at the project root.',
          'Add a CI configuration — e.g. `.github/workflows/ci.yml` (GitHub Actions), `.gitlab-ci.yml`, `.circleci/config.yml`, `Jenkinsfile`, or `.buildkite/pipeline.yml`.',
        ),
      ];
    } catch (err) {
      return [
        single(
          'fail',
          `ci-config-exists failed: ${(err as Error).message}`,
          'Re-run the scan; if it keeps failing, verify the project directory is readable.',
        ),
      ];
    }
  },
};
