import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { CheckContext, CheckResult, Checker, ProjectFs } from '../../types/index.js';

const execFileAsync = promisify(execFile);

const CHECKER_ID = 'typescript-strict-compile';
const CATEGORY = 'code-quality' as const;
const SEVERITY = 'major' as const;

const TSCONFIG_FILENAME = 'tsconfig.json';

/** Dependencies — injectable for tests. */
export interface TypescriptStrictCompileDeps {
  /**
   * Runs `npx tsc --noEmit --pretty false` in `cwd`. Returns the raw stdout,
   * raw stderr, and the subprocess exit code. Implementations MUST NOT throw
   * on non-zero exit; they MUST capture exit codes (tsc emits 0 on success and
   * a non-zero code — typically 1 or 2 — when diagnostics are present). They
   * MAY throw for environmental failures (ENOENT when `typescript` is not
   * installed, ETIMEDOUT, abort).
   *
   * tsc writes its `file(line,col): error TSxxxx: message` diagnostics to
   * stdout (not stderr); `--pretty false` keeps them single-line and
   * non-colorized for stable parsing.
   */
  runTsc(
    cwd: string,
    signal: AbortSignal,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

const DEFAULT_DEPS: TypescriptStrictCompileDeps = { runTsc: defaultRunTsc };

async function defaultRunTsc(
  cwd: string,
  signal: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    const result = await execFileAsync(npxCmd, ['tsc', '--noEmit', '--pretty', 'false'], {
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

/**
 * Reads `compilerOptions.strict` from the parsed tsconfig.
 *   - true  -> strict explicitly enabled
 *   - false -> strict explicitly disabled (a local opt-out; overrides any
 *     value inherited via `extends`)
 *   - undefined -> indeterminate: the flag is absent, there is no
 *     compilerOptions object, or tsconfig.json could not be parsed as strict
 *     JSON (the context layer does not yet support JSONC). The effective value
 *     may be inherited via `extends`, which this check does not resolve.
 */
function readStrictFlag(tsconfig: Record<string, unknown> | null): boolean | undefined {
  if (tsconfig === null) {
    return undefined;
  }
  const co = tsconfig.compilerOptions;
  if (typeof co !== 'object' || co === null) {
    return undefined;
  }
  const strict = (co as Record<string, unknown>).strict;
  return typeof strict === 'boolean' ? strict : undefined;
}

const DIAGNOSTIC_RE = /error TS\d+:/;

/** Keeps the lines of tsc output that are error diagnostics. */
function parseDiagnostics(stdout: string): string[] {
  const lines: string[] = [];
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trimEnd();
    if (DIAGNOSTIC_RE.test(line)) {
      lines.push(line);
    }
  }
  return lines;
}

async function hasTsconfig(fs: ProjectFs, projectDir: string): Promise<boolean> {
  return fs.exists(path.join(projectDir, TSCONFIG_FILENAME));
}

const MAX_DETAIL_LINES = 20;

/**
 * Static checker core. Detects `tsconfig.json`; reads `compilerOptions.strict`
 * from the parsed config; if strict is enabled, runs `tsc --noEmit` via the
 * injected runTsc and parses stdout for diagnostics. Emits a single
 * CheckResult:
 *   - 'skip' 'no-project-context' when ctx.project is null
 *   - 'skip' 'aborted' when the scan was aborted
 *   - 'skip' 'no-tsconfig' when no tsconfig.json is present
 *   - 'fail' 'strict-disabled' when compilerOptions.strict is explicitly false
 *   - 'warn' 'strict-indeterminate' when strict cannot be confirmed (absent,
 *     no compilerOptions, or tsconfig unparseable / JSONC; may be inherited
 *     via extends)
 *   - 'pass' 'strict-clean' when tsc exits 0
 *   - 'fail' 'type-errors' when tsc exits non-zero with parseable diagnostics;
 *     `detail` lists up to MAX_DETAIL_LINES diagnostics, truncated with a count
 *   - 'fail' 'tsc-runtime-error' when the subprocess throws (e.g. ENOENT —
 *     typescript not installed), or exits non-zero with no parseable
 *     diagnostics
 *
 * Pure with respect to subprocess execution — that lives behind the
 * `deps.runTsc` seam so tests can inject deterministic responses.
 */
export async function runTypescriptStrictCompile(
  ctx: CheckContext,
  deps: TypescriptStrictCompileDeps = DEFAULT_DEPS,
): Promise<CheckResult[]> {
  const project = ctx.project;
  if (project === null) {
    return [makeResult('skip', 'no-project-context', 'Skipped: no project context.')];
  }

  try {
    if (ctx.signal.aborted) {
      return [makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.')];
    }

    if (!(await hasTsconfig(project.fs, project.projectDir))) {
      return [makeResult('skip', 'no-tsconfig', 'Skipped: no tsconfig.json found.')];
    }

    const strict = readStrictFlag(project.tsconfigJson);
    if (strict === false) {
      return [
        makeResult(
          'fail',
          'strict-disabled',
          'tsconfig.json sets compilerOptions.strict to false.',
          'Set compilerOptions.strict to true in tsconfig.json.',
        ),
      ];
    }
    if (strict === undefined) {
      return [
        makeResult(
          'warn',
          'strict-indeterminate',
          'Could not confirm compilerOptions.strict from tsconfig.json (flag absent, no compilerOptions, or tsconfig not parseable as strict JSON). It may be inherited via extends, which this check does not resolve.',
          'Set compilerOptions.strict to true explicitly in tsconfig.json.',
        ),
      ];
    }

    let stdout: string;
    let exitCode: number;
    try {
      const result = await deps.runTsc(project.projectDir, ctx.signal);
      stdout = result.stdout;
      exitCode = result.exitCode;
    } catch (err) {
      return [
        makeResult(
          'fail',
          'tsc-runtime-error',
          `tsc failed to run: ${err instanceof Error ? err.message : String(err)}`,
          'Ensure the typescript peer dependency is installed (npm install -D typescript).',
        ),
      ];
    }

    if (exitCode === 0) {
      return [
        makeResult(
          'pass',
          'strict-clean',
          'tsc --noEmit passed with no type errors under strict mode.',
        ),
      ];
    }

    const diagnostics = parseDiagnostics(stdout);
    if (diagnostics.length === 0) {
      return [
        makeResult(
          'fail',
          'tsc-runtime-error',
          `tsc exited with code ${exitCode} but produced no parseable diagnostics.`,
          'Run `npx tsc --noEmit` locally and resolve the error before re-running.',
        ),
      ];
    }

    const head = diagnostics.slice(0, MAX_DETAIL_LINES).join('\n');
    const truncated =
      diagnostics.length > MAX_DETAIL_LINES
        ? `\n... and ${diagnostics.length - MAX_DETAIL_LINES} more`
        : '';
    return [
      {
        checkerId: CHECKER_ID,
        resultId: 'type-errors',
        status: 'fail',
        message: `tsc reports ${diagnostics.length} type error(s) under strict mode.`,
        detail: head + truncated,
        fix: 'Run `npx tsc --noEmit` locally and fix the reported type errors.',
        severity: SEVERITY,
        category: CATEGORY,
      },
    ];
  } catch (err) {
    return [
      makeResult(
        'fail',
        '__error__',
        `typescript-strict-compile failed: ${err instanceof Error ? err.message : String(err)}`,
        'Re-run the scan; if it keeps failing, verify the project directory is readable.',
      ),
    ];
  }
}

/**
 * Static checker: detects tsconfig.json, verifies compilerOptions.strict, and
 * when strict is enabled runs `tsc --noEmit` and reports type diagnostics.
 * Skips on no tsconfig. Wraps runTypescriptStrictCompile with the default
 * subprocess dep.
 */
export const typescriptStrictCompileChecker: Checker = {
  id: CHECKER_ID,
  name: 'TypeScript strict mode + zero errors',
  category: CATEGORY,
  mode: 'static',
  run: (ctx) => runTypescriptStrictCompile(ctx),
};
