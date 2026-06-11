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

const CHECKER_ID = 'prettier-passing';
const CATEGORY = 'code-quality' as const;
const SEVERITY = 'minor' as const;

/**
 * Filenames at projectDir that signal a Prettier configuration. Detection
 * is presence-only — the checker does not parse these. Prettier itself
 * resolves config precedence when it runs.
 */
const CONFIG_FILES: ReadonlyArray<string> = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'prettier.config.ts',
];

/** Dependencies — injectable for tests. */
export interface PrettierPassingDeps {
  /**
   * Runs `npx prettier --check .` in `cwd`. Returns the raw stdout, raw
   * stderr, and the subprocess exit code. Implementations MUST NOT throw on
   * non-zero exit; they MUST capture exit codes 0 (all formatted), 1 (some
   * files would be reformatted), 2 (error — invalid config, file not found).
   * They MAY throw for environmental failures (ENOENT, ETIMEDOUT, abort).
   *
   * Unlike the ESLint runner, this captures stderr in addition to stdout:
   * `prettier --check` writes its `[warn] <path>` lines and the summary to
   * stderr, not stdout. The success message ("All matched files use Prettier
   * code style!") is written to stdout.
   */
  runPrettier(
    cwd: string,
    signal: AbortSignal,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

const DEFAULT_DEPS: PrettierPassingDeps = { runPrettier: defaultRunPrettier };

async function defaultRunPrettier(
  cwd: string,
  signal: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    const result = await execFileAsync(npxCmd, ['prettier', '--check', '.'], {
      cwd,
      timeout: 60_000,
      maxBuffer: 50 * 1024 * 1024,
      signal,
      shell: false,
      windowsHide: true,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (err) {
    if (typeof err === 'object' && err !== null) {
      const e = err as { code?: unknown; stdout?: unknown; stderr?: unknown };
      if (typeof e.code === 'number') {
        return {
          stdout: typeof e.stdout === 'string' ? e.stdout : '',
          stderr: typeof e.stderr === 'string' ? e.stderr : '',
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
  return pkg !== null && 'prettier' in pkg && pkg.prettier !== undefined;
}

/**
 * Extracts the unformatted file paths from `prettier --check` stderr.
 *
 * Prettier writes one `[warn] <path>` line per offending file, followed by a
 * summary line ("[warn] Code style issues found in N files. Run Prettier with
 * --write to fix."). This keeps the per-file lines and drops the summary.
 */
function parseUnformattedFiles(stderr: string): string[] {
  const files: string[] = [];
  for (const rawLine of stderr.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.startsWith('[warn] ')) {
      continue;
    }
    const rest = line.slice('[warn] '.length).trim();
    if (rest.length === 0 || rest.startsWith('Code style issues found')) {
      continue;
    }
    files.push(rest);
  }
  return files;
}

const MAX_DETAIL_LINES = 20;

/**
 * Static checker core. Detects a Prettier configuration; if present, runs
 * `npx prettier --check .` via the injected runPrettier, inspects the exit
 * code and stderr, and emits a single CheckResult:
 *   - 'skip' with resultId 'no-config-found' when no config is detected
 *   - 'pass' with resultId 'prettier-formatted' when exit code is 0
 *   - 'fail' with resultId 'prettier-unformatted' when exit code is 1;
 *     `detail` lists up to MAX_DETAIL_LINES file paths (relative to
 *     projectDir), truncated with a count
 *   - 'fail' with resultId 'prettier-runtime-error' when the subprocess
 *     exits with code >= 2, throws an environmental error (e.g. ENOENT,
 *     ETIMEDOUT, AbortError), or returns an unparseable exit-1 result
 *
 * Pure with respect to subprocess execution — that lives behind the
 * `deps.runPrettier` seam so tests can inject deterministic responses.
 */
export async function runPrettierPassing(
  ctx: CheckContext,
  deps: PrettierPassingDeps = DEFAULT_DEPS,
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
          'Skipped: no Prettier config detected (no .prettierrc*, prettier.config.*, or prettier field in package.json).',
        ),
      ];
    }

    let stderr: string;
    let exitCode: number;
    try {
      const result = await deps.runPrettier(project.projectDir, ctx.signal);
      stderr = result.stderr;
      exitCode = result.exitCode;
    } catch (err) {
      return [
        makeResult(
          'fail',
          'prettier-runtime-error',
          `Prettier failed to run: ${err instanceof Error ? err.message : String(err)}`,
          'Ensure Prettier is installed (npm install prettier) and the config is valid.',
        ),
      ];
    }

    if (exitCode === 0) {
      return [
        makeResult('pass', 'prettier-formatted', 'Prettier reports all files are formatted.'),
      ];
    }

    if (exitCode >= 2) {
      return [
        makeResult(
          'fail',
          'prettier-runtime-error',
          `Prettier exited with code ${exitCode} (error — invalid config or file not found).`,
          'Run `npx prettier --check .` locally and resolve the error before re-running.',
        ),
      ];
    }

    // exitCode === 1: one or more files would be reformatted.
    const files = parseUnformattedFiles(stderr);
    const relFiles = files.map((f) =>
      path.isAbsolute(f) ? path.relative(project.projectDir, f) : f,
    );
    const head = relFiles.slice(0, MAX_DETAIL_LINES).join('\n');
    const truncated =
      relFiles.length > MAX_DETAIL_LINES
        ? `\n... and ${relFiles.length - MAX_DETAIL_LINES} more`
        : '';
    const detail = relFiles.length > 0 ? head + truncated : stderr.trim();
    return [
      {
        checkerId: CHECKER_ID,
        resultId: 'prettier-unformatted',
        status: 'fail',
        message: `Prettier reports ${relFiles.length} file(s) need formatting.`,
        detail,
        fix: 'Run `npx prettier --write .` locally to apply formatting.',
        severity: SEVERITY,
        category: CATEGORY,
      },
    ];
  } catch (err) {
    return [
      makeResult(
        'fail',
        '__error__',
        `prettier-passing failed: ${err instanceof Error ? err.message : String(err)}`,
        'Re-run the scan; if it keeps failing, verify the project directory is readable.',
      ),
    ];
  }
}

/**
 * Static checker: detects a Prettier configuration and, when present, runs
 * `npx prettier --check .` and reports unformatted files. Skips on no config.
 * Wraps runPrettierPassing with the default subprocess dep.
 */
export const prettierPassingChecker: Checker = {
  id: CHECKER_ID,
  name: 'Prettier configured and passing',
  category: CATEGORY,
  mode: 'static',
  run: (ctx) => runPrettierPassing(ctx),
};
