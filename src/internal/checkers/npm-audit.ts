import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const ID = 'npm-audit';
const CAT = 'dependencies' as const;
const SEV_CRITICAL = 'critical' as const;
const SEV_MAJOR = 'major' as const;

const NPM_LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json'] as const;

/** Dependencies — injectable for tests. */
export interface NpmAuditDeps {
  /**
   * Runs `npm audit --json` in `cwd`. Returns stdout and exit code.
   * MUST NOT throw on non-zero exit (npm exits 1 when vulnerabilities found).
   * MAY throw for environmental failures (ENOENT, ETIMEDOUT, abort signal).
   */
  runNpmAudit(cwd: string, signal: AbortSignal): Promise<{ stdout: string; exitCode: number }>;
}

const execFileAsync = promisify(execFile);

async function defaultRunNpmAudit(
  cwd: string,
  signal: AbortSignal,
): Promise<{ stdout: string; exitCode: number }> {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    const result = await execFileAsync(npmCmd, ['audit', '--json'], {
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

const DEFAULT_DEPS: NpmAuditDeps = { runNpmAudit: defaultRunNpmAudit };

interface VulnCounts {
  critical?: number;
  high?: number;
  moderate?: number;
  low?: number;
  info?: number;
}

function makeResult(
  status: CheckResult['status'],
  resultId: string,
  message: string,
  severity: CheckResult['severity'],
  extras: { fix?: string; detail?: string } = {},
): CheckResult {
  const r: CheckResult = {
    checkerId: ID,
    resultId,
    status,
    message,
    severity,
    category: CAT,
  };
  if (extras.fix !== undefined) r.fix = extras.fix;
  if (extras.detail !== undefined) r.detail = extras.detail;
  return r;
}

/**
 * Static checker core. Skips unless an npm lockfile is present. Runs
 * `npm audit --json` via the injected dep and parses `metadata.vulnerabilities`.
 * Emits up to two results (critical + high can co-occur):
 *   - 'skip' 'no-project-context' — ctx.project is null
 *   - 'skip' 'no-npm-lockfile' — no package-lock.json / npm-shrinkwrap.json
 *   - 'skip' 'aborted' — signal aborted
 *   - 'fail' 'critical-vulnerabilities' — one or more critical vulns (severity critical)
 *   - 'warn' 'high-vulnerabilities' — one or more high-severity vulns (severity major)
 *   - 'pass' 'no-critical-or-high' — audit clean of critical/high findings
 *   - 'fail' 'audit-runtime-error' — subprocess threw or output unparseable
 */
export async function runNpmAudit(
  ctx: CheckContext,
  deps: NpmAuditDeps = DEFAULT_DEPS,
): Promise<CheckResult[]> {
  const project = ctx.project;
  if (project === null) {
    return [makeResult('skip', 'no-project-context', 'Skipped: no project context.', SEV_CRITICAL)];
  }
  if (ctx.signal.aborted) {
    return [
      makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.', SEV_CRITICAL),
    ];
  }

  let hasLockfile = false;
  for (const name of NPM_LOCKFILES) {
    if (await project.fs.exists(path.join(project.projectDir, name))) {
      hasLockfile = true;
      break;
    }
  }
  if (!hasLockfile) {
    return [
      makeResult(
        'skip',
        'no-npm-lockfile',
        'Skipped: no package-lock.json or npm-shrinkwrap.json found; npm audit requires a lockfile.',
        SEV_CRITICAL,
      ),
    ];
  }

  let stdout: string;
  try {
    const result = await deps.runNpmAudit(project.projectDir, ctx.signal);
    if (ctx.signal.aborted) {
      return [
        makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.', SEV_CRITICAL),
      ];
    }
    stdout = result.stdout;
  } catch (err) {
    return [
      makeResult(
        'fail',
        'audit-runtime-error',
        `npm audit failed to run: ${err instanceof Error ? err.message : String(err)}`,
        SEV_CRITICAL,
        { fix: 'Ensure npm is installed and the project directory is accessible.' },
      ),
    ];
  }

  let vulns: VulnCounts;
  try {
    const parsed = JSON.parse(stdout) as { metadata?: { vulnerabilities?: VulnCounts } };
    vulns = parsed.metadata?.vulnerabilities ?? {};
  } catch {
    return [
      makeResult(
        'fail',
        'audit-runtime-error',
        'npm audit returned unparseable JSON output.',
        SEV_CRITICAL,
        { fix: 'Run `npm audit --json` manually to inspect the output.' },
      ),
    ];
  }

  const critical = typeof vulns.critical === 'number' ? vulns.critical : 0;
  const high = typeof vulns.high === 'number' ? vulns.high : 0;
  const results: CheckResult[] = [];

  if (critical > 0) {
    results.push(
      makeResult(
        'fail',
        'critical-vulnerabilities',
        `npm audit found ${critical} critical vulnerability/vulnerabilities.`,
        SEV_CRITICAL,
        {
          fix: 'Run `npm audit fix` or update the affected packages to resolve critical vulnerabilities.',
        },
      ),
    );
  }
  if (high > 0) {
    results.push(
      makeResult(
        'warn',
        'high-vulnerabilities',
        `npm audit found ${high} high-severity vulnerability/vulnerabilities.`,
        SEV_MAJOR,
        {
          fix: 'Run `npm audit fix` or update the affected packages to resolve high-severity vulnerabilities.',
        },
      ),
    );
  }
  if (results.length === 0) {
    results.push(
      makeResult(
        'pass',
        'no-critical-or-high',
        'npm audit found no critical or high-severity vulnerabilities.',
        SEV_CRITICAL,
      ),
    );
  }

  return results;
}

export const npmAuditChecker: Checker = {
  id: ID,
  name: 'No critical vulnerabilities',
  category: CAT,
  mode: 'static',
  run: (ctx) => runNpmAudit(ctx),
};
