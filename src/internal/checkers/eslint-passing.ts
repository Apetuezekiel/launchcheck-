import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type {
  CheckContext,
  CheckResult,
  Checker,
  PackageJson,
  ProjectFs,
} from '../../types/index.js';

const execFileAsync = promisify(execFile);

const CHECKER_ID = 'eslint-passing';
const CATEGORY = 'code-quality' as const;
const SEVERITY = 'major' as const;

/**
 * Filenames at projectDir that signal an ESLint configuration. Detection
 * is presence-only — the checker does not parse these. ESLint itself
 * resolves config precedence when it runs.
 */
const CONFIG_FILES: ReadonlyArray<string> = [
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  '.eslintrc',
  'eslint.config.js',
  'eslint.config.cjs',
  'eslint.config.mjs',
  'eslint.config.ts',
];

/** Subset of ESLint's `--format json` output the checker reads. */
interface EslintFileResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: ReadonlyArray<{
    ruleId: string | null;
    severity: number;
    message: string;
    line?: number;
    column?: number;
  }>;
}

/** Dependencies — injectable for tests. */
export interface EslintPassingDeps {
  /**
   * Runs `npx eslint . --format json` in `cwd`. Returns the raw stdout and
   * the subprocess exit code. Implementations MUST NOT throw on non-zero
   * exit; they MUST capture exit codes 0 (clean), 1 (problems found), 2
   * (ESLint internal error). They MAY throw for environmental failures
   * (ENOENT, ETIMEDOUT, abort).
   */
  runEslint(cwd: string, signal: AbortSignal): Promise<{ stdout: string; exitCode: number }>;
}

const DEFAULT_DEPS: EslintPassingDeps = { runEslint: defaultRunEslint };

async function defaultRunEslint(
  cwd: string,
  signal: AbortSignal,
): Promise<{ stdout: string; exitCode: number }> {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    const result = await execFileAsync(npxCmd, ['eslint', '.', '--format', 'json'], {
      cwd,
      timeout: 60_000,
      maxBuffer: 50 * 1024 * 1024,
      signal,
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    return { stdout: result.stdout, exitCode: 0 };
  } catch (err) {
    if (typeof err === 'object' && err !== null) {
      const e = err as { code?: unknown; stdout?: unknown };
      if (typeof e.code === 'number') {
        return {
          stdout: typeof e.stdout === 'string' ? e.stdout : '',
          exitCode: e.code,
        };
      }
    }
    throw err;
  }
}

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

async function hasConfigFile(fs: ProjectFs, projectDir: string): Promise<boolean> {
  for (const filename of CONFIG_FILES) {
    if (await fs.exists(path.join(projectDir, filename))) {
      return true;
    }
  }
  return false;
}

function hasPackageJsonConfig(pkg: PackageJson | null): boolean {
  return pkg !== null && 'eslintConfig' in pkg && pkg.eslintConfig !== undefined;
}

const MAX_DETAIL_LINES = 20;

/**
 * Static checker core. Detects an ESLint configuration; if present, runs
 * `npx eslint . --format json` via the injected runEslint, parses the
 * output, and emits a single CheckResult:
 *   - 'skip' with resultId 'no-config-found' when no config is detected
 *   - 'pass' with resultId 'eslint-clean' when ESLint reports zero
 *     problems
 *   - 'fail' with resultId 'eslint-problems' when ESLint reports
 *     errors and/or warnings; `detail` lists up to MAX_DETAIL_LINES
 *     findings, truncated with a count
 *   - 'fail' with resultId 'eslint-runtime-error' when the subprocess
 *     exits with code >= 2, throws an environmental error (e.g. ENOENT,
 *     ETIMEDOUT, AbortError), or returns non-JSON output
 *
 * Pure with respect to subprocess execution — that lives behind the
 * `deps.runEslint` seam so tests can inject deterministic responses.
 */
export async function runEslintPassing(
  ctx: CheckContext,
  deps: EslintPassingDeps = DEFAULT_DEPS,
): Promise<CheckResult[]> {
  const project = ctx.project;
  if (project === null) {
    return [makeResult('skip', 'no-project-context', 'Skipped: no project context.')];
  }

  try {
    if (ctx.signal.aborted) {
      return [makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.')];
    }

    const hasFile = await hasConfigFile(project.fs, project.projectDir);
    const hasPkg = hasPackageJsonConfig(project.packageJson);
    if (!hasFile && !hasPkg) {
      return [
        makeResult(
          'skip',
          'no-config-found',
          'Skipped: no ESLint config detected (no .eslintrc*, eslint.config.*, or eslintConfig in package.json).',
        ),
      ];
    }

    let stdout: string;
    let exitCode: number;
    try {
      const result = await deps.runEslint(project.projectDir, ctx.signal);
      stdout = result.stdout;
      exitCode = result.exitCode;
    } catch (err) {
      return [
        makeResult(
          'fail',
          'eslint-runtime-error',
          `ESLint failed to run: ${err instanceof Error ? err.message : String(err)}`,
          'Ensure ESLint is installed (npm install eslint) and the config is valid.',
        ),
      ];
    }

    if (exitCode >= 2) {
      return [
        makeResult(
          'fail',
          'eslint-runtime-error',
          `ESLint exited with code ${exitCode} (internal error or invalid config).`,
          'Run `npx eslint .` locally and resolve the error before re-running.',
        ),
      ];
    }

    let parsed: EslintFileResult[];
    try {
      const raw = JSON.parse(stdout);
      if (!Array.isArray(raw)) {
        throw new Error('ESLint JSON output is not an array.');
      }
      parsed = raw as EslintFileResult[];
    } catch (err) {
      return [
        makeResult(
          'fail',
          'eslint-runtime-error',
          `Could not parse ESLint JSON output: ${err instanceof Error ? err.message : String(err)}`,
          'Ensure ESLint is configured to support `--format json` and re-run.',
        ),
      ];
    }

    let totalErrors = 0;
    let totalWarnings = 0;
    let filesWithFindings = 0;
    const findings: Array<{
      file: string;
      line: number | undefined;
      column: number | undefined;
      rule: string | null;
      message: string;
    }> = [];

    for (const f of parsed) {
      totalErrors += f.errorCount;
      totalWarnings += f.warningCount;
      if (f.errorCount + f.warningCount > 0) {
        filesWithFindings += 1;
      }
      for (const m of f.messages) {
        findings.push({
          file: f.filePath,
          line: m.line,
          column: m.column,
          rule: m.ruleId,
          message: m.message,
        });
      }
    }

    if (totalErrors === 0 && totalWarnings === 0) {
      return [makeResult('pass', 'eslint-clean', `ESLint passed across ${parsed.length} file(s).`)];
    }

    const head = findings
      .slice(0, MAX_DETAIL_LINES)
      .map((f) => {
        const rel = path.relative(project.projectDir, f.file) || f.file;
        const line = f.line ?? '?';
        const col = f.column ?? '?';
        const rule = f.rule ?? '<no rule>';
        return `${rel}:${line}:${col}  ${rule}  ${f.message}`;
      })
      .join('\n');
    const truncated =
      findings.length > MAX_DETAIL_LINES
        ? `\n... and ${findings.length - MAX_DETAIL_LINES} more`
        : '';
    return [
      {
        checkerId: CHECKER_ID,
        resultId: 'eslint-problems',
        status: 'fail',
        message: `ESLint found ${totalErrors} error(s) and ${totalWarnings} warning(s) across ${filesWithFindings} file(s).`,
        detail: head + truncated,
        fix: 'Run `npx eslint .` locally and fix the reported problems.',
        severity: SEVERITY,
        category: CATEGORY,
      },
    ];
  } catch (err) {
    return [
      makeResult(
        'fail',
        '__error__',
        `eslint-passing failed: ${err instanceof Error ? err.message : String(err)}`,
        'Re-run the scan; if it keeps failing, verify the project directory is readable.',
      ),
    ];
  }
}

/**
 * Static checker: detects an ESLint configuration and, when present, runs
 * `npx eslint . --format json` and reports findings. Skips on no config.
 * Wraps runEslintPassing with the default subprocess dep.
 */
export const eslintPassingChecker: Checker = {
  id: CHECKER_ID,
  name: 'ESLint configured and passing',
  category: CATEGORY,
  mode: 'static',
  run: (ctx) => runEslintPassing(ctx),
};
