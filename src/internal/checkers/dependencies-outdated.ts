import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request } from 'undici';
import type { CheckContext, CheckResult, Checker, Severity } from '../../types/index.js';

const execFileAsync = promisify(execFile);

const CHECKER_ID = 'dependencies-outdated';
const CATEGORY = 'dependencies' as const;

/** Dependencies — injectable for tests (no subprocess or network in unit tests). */
export interface DependenciesOutdatedDeps {
  /**
   * Runs `npm outdated --json` in `cwd`. Returns raw stdout and exit code.
   * MUST NOT throw on non-zero exit (npm outdated exits 1 when packages are
   * outdated); MAY throw for environmental failures.
   */
  runNpmOutdated(cwd: string, signal: AbortSignal): Promise<{ stdout: string; exitCode: number }>;

  /**
   * Returns the deprecation message for `pkgName`'s latest version, or null
   * if not deprecated. MUST throw on network failure so the caller can detect
   * an unreachable registry and skip.
   */
  getDeprecation(pkgName: string, signal: AbortSignal): Promise<string | null>;
}

const DEFAULT_DEPS: DependenciesOutdatedDeps = {
  runNpmOutdated: defaultRunNpmOutdated,
  getDeprecation: defaultGetDeprecation,
};

async function defaultRunNpmOutdated(
  cwd: string,
  signal: AbortSignal,
): Promise<{ stdout: string; exitCode: number }> {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    const result = await execFileAsync(npmCmd, ['outdated', '--json'], {
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
        return { stdout: typeof e.stdout === 'string' ? e.stdout : '', exitCode: e.code };
      }
    }
    throw err;
  }
}

async function defaultGetDeprecation(pkgName: string, signal: AbortSignal): Promise<string | null> {
  const encoded = pkgName.startsWith('@') ? pkgName.replace('/', '%2F') : pkgName;
  const res = await request(`https://registry.npmjs.org/${encoded}/latest`, {
    signal,
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
  });
  if (res.statusCode !== 200) {
    await res.body.dump();
    return null;
  }
  const json = (await res.body.json()) as { deprecated?: unknown };
  if (typeof json.deprecated === 'string') {
    return json.deprecated;
  }
  return json.deprecated === true ? 'deprecated' : null;
}

interface OutdatedEntry {
  current?: string;
  wanted?: string;
  latest?: string;
}

function makeResult(
  status: CheckResult['status'],
  resultId: string,
  severity: Severity,
  message: string,
  extras: { fix?: string; detail?: string } = {},
): CheckResult {
  const result: CheckResult = {
    checkerId: CHECKER_ID,
    resultId,
    status,
    severity,
    message,
    category: CATEGORY,
  };
  if (extras.fix !== undefined) {
    result.fix = extras.fix;
  }
  if (extras.detail !== undefined) {
    result.detail = extras.detail;
  }
  return result;
}

/**
 * Static checker core. Flags deprecated production dependencies (major) via a
 * per-package registry lookup, and reports merely-outdated ones (info) from
 * `npm outdated --json`. Emits a single consolidated result:
 *   - 'skip' 'no-project-context' / 'aborted' / 'no-dependencies'
 *   - 'skip' 'registry-unreachable' when every deprecation lookup failed
 *   - 'warn' 'deprecated-dependencies' (major) when any dep is deprecated
 *   - 'warn' 'outdated-dependencies' (info) when deps are outdated (none deprecated)
 *   - 'pass' 'dependencies-current' otherwise
 */
export async function runDependenciesOutdated(
  ctx: CheckContext,
  deps: DependenciesOutdatedDeps = DEFAULT_DEPS,
): Promise<CheckResult[]> {
  const project = ctx.project;
  if (project === null) {
    return [makeResult('skip', 'no-project-context', 'major', 'Skipped: no project context.')];
  }
  try {
    if (ctx.signal.aborted) {
      return [makeResult('skip', 'aborted', 'major', 'Skipped: scan aborted before completion.')];
    }

    const names = Object.keys(project.packageJson?.dependencies ?? {});
    if (names.length === 0) {
      return [
        makeResult('pass', 'no-dependencies', 'info', 'No production dependencies to check.'),
      ];
    }

    // Deprecation lookups (per package). If every one fails, the registry is
    // unreachable and we cannot make a determination.
    const settled = await Promise.allSettled(
      names.map((name) => deps.getDeprecation(name, ctx.signal)),
    );
    const allFailed = settled.every((s) => s.status === 'rejected');
    if (allFailed) {
      return [
        makeResult(
          'skip',
          'registry-unreachable',
          'major',
          'Skipped: npm registry unreachable; cannot check for deprecated packages.',
        ),
      ];
    }

    const deprecated: Array<{ name: string; message: string }> = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled' && s.value !== null) {
        deprecated.push({ name: names[i] ?? '', message: s.value });
      }
    });

    // Outdated (secondary, info-level). Degrade silently if it cannot run.
    let outdated: string[] = [];
    try {
      const { stdout } = await deps.runNpmOutdated(project.projectDir, ctx.signal);
      if (stdout.trim() !== '') {
        const parsed = JSON.parse(stdout) as Record<string, OutdatedEntry>;
        outdated = Object.keys(parsed).filter((name) => names.includes(name));
      }
    } catch {
      outdated = [];
    }

    if (deprecated.length > 0) {
      const detail = deprecated.map((d) => `${d.name}: ${d.message}`).join('\n');
      const outdatedNote = outdated.length > 0 ? ` (${outdated.length} also outdated)` : '';
      return [
        makeResult(
          'warn',
          'deprecated-dependencies',
          'major',
          `${deprecated.length} deprecated production dependency(ies)${outdatedNote}.`,
          {
            detail,
            fix: 'Migrate off deprecated packages to maintained alternatives.',
          },
        ),
      ];
    }

    if (outdated.length > 0) {
      return [
        makeResult(
          'warn',
          'outdated-dependencies',
          'info',
          `${outdated.length} outdated (but not deprecated) production dependency(ies).`,
          {
            detail: outdated.join('\n'),
            fix: 'Update with `npm update` (or bump ranges in package.json) when convenient.',
          },
        ),
      ];
    }

    return [
      makeResult(
        'pass',
        'dependencies-current',
        'info',
        `No deprecated dependencies; all ${names.length} production dependency(ies) current.`,
      ),
    ];
  } catch (err) {
    return [
      makeResult(
        'fail',
        '__error__',
        'major',
        `dependencies-outdated failed: ${err instanceof Error ? err.message : String(err)}`,
        {
          fix: 'Re-run the scan; if it keeps failing, verify network access and npm availability.',
        },
      ),
    ];
  }
}

export const dependenciesOutdatedChecker: Checker = {
  id: CHECKER_ID,
  name: 'No deprecated dependencies',
  category: CATEGORY,
  mode: 'static',
  run: (ctx) => runDependenciesOutdated(ctx),
};
