import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request } from 'undici';
import type {
  CheckContext,
  CheckResult,
  Checker,
  ProjectContext,
  Severity,
} from '../../types/index.js';
import {
  type PackageManager,
  detectPackageManager,
  packageManagerBin,
} from './support/package-manager.js';

const execFileAsync = promisify(execFile);

const CHECKER_ID = 'dependencies-outdated';
const CATEGORY = 'dependencies' as const;

/** Dependencies — injectable for tests (no subprocess or network in unit tests). */
export interface DependenciesOutdatedDeps {
  /** Detects the project's package manager (lockfile-based). Null when none. */
  detectPm(project: ProjectContext): Promise<PackageManager | null>;

  /**
   * Runs `<pm> outdated --json` in `cwd`. Returns raw stdout and exit code.
   * MUST NOT throw on non-zero exit (these tools exit 1 when packages are
   * outdated); MAY throw for environmental failures.
   */
  runOutdated(
    pm: PackageManager,
    cwd: string,
    signal: AbortSignal,
  ): Promise<{ stdout: string; exitCode: number }>;

  /**
   * Returns the deprecation message for `pkgName`'s latest version, or null
   * if not deprecated. MUST throw on network failure so the caller can detect
   * an unreachable registry and skip.
   */
  getDeprecation(pkgName: string, signal: AbortSignal): Promise<string | null>;
}

const DEFAULT_DEPS: DependenciesOutdatedDeps = {
  detectPm: async (project) => (await detectPackageManager(project))?.name ?? null,
  runOutdated: defaultRunOutdated,
  getDeprecation: defaultGetDeprecation,
};

async function defaultRunOutdated(
  pm: PackageManager,
  cwd: string,
  signal: AbortSignal,
): Promise<{ stdout: string; exitCode: number }> {
  try {
    const result = await execFileAsync(packageManagerBin(pm), ['outdated', '--json'], {
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

/**
 * Normalizes each package manager's `outdated --json` to the set of outdated
 * package names, intersected with the project's declared dependencies.
 * - npm / pnpm: a JSON object keyed by package name.
 * - yarn (classic): newline-delimited JSON; the `table` line's `data.body`
 *   rows are `[name, current, wanted, latest, type, url]`.
 */
function parseOutdatedNames(pm: PackageManager, stdout: string, known: string[]): string[] {
  const knownSet = new Set(known);
  if (pm === 'yarn') {
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const obj = JSON.parse(trimmed) as { type?: string; data?: { body?: unknown[] } };
        if (obj.type === 'table' && Array.isArray(obj.data?.body)) {
          return obj.data.body
            .map((row) => (Array.isArray(row) ? row[0] : undefined))
            .filter((n): n is string => typeof n === 'string' && knownSet.has(n));
        }
      } catch {
        // skip non-JSON lines
      }
    }
    return [];
  }
  try {
    const parsed = JSON.parse(stdout) as Record<string, OutdatedEntry>;
    return Object.keys(parsed).filter((name) => knownSet.has(name));
  } catch {
    return [];
  }
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
 * `<pm> outdated --json`. Emits a single consolidated result:
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

    // Outdated (secondary, info-level). Needs a detected package manager;
    // degrades silently if detection or the subprocess fails.
    let outdated: string[] = [];
    const pmName = await deps.detectPm(project);
    if (pmName !== null) {
      try {
        const { stdout } = await deps.runOutdated(pmName, project.projectDir, ctx.signal);
        if (stdout.trim() !== '') {
          outdated = parseOutdatedNames(pmName, stdout, names);
        }
      } catch {
        outdated = [];
      }
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
            fix: 'Update the affected packages (or bump ranges in package.json) when convenient.',
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
