import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';
import {
  type PackageManager,
  detectPackageManager,
  packageManagerBin,
} from './support/package-manager.js';

const ID = 'npm-audit';
const CAT = 'dependencies' as const;
const SEV_CRITICAL = 'critical' as const;
const SEV_MAJOR = 'major' as const;

/** Dependencies — injectable for tests. */
export interface NpmAuditDeps {
  /**
   * Runs `<pm> audit --json` in `cwd`. Returns stdout and exit code.
   * MUST NOT throw on non-zero exit (the tools exit 1 when vulnerabilities are
   * found). MAY throw for environmental failures (ENOENT, ETIMEDOUT, abort).
   */
  runAudit(
    pm: PackageManager,
    cwd: string,
    signal: AbortSignal,
  ): Promise<{ stdout: string; exitCode: number }>;
}

const execFileAsync = promisify(execFile);

async function defaultRunAudit(
  pm: PackageManager,
  cwd: string,
  signal: AbortSignal,
): Promise<{ stdout: string; exitCode: number }> {
  try {
    const result = await execFileAsync(packageManagerBin(pm), ['audit', '--json'], {
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

const DEFAULT_DEPS: NpmAuditDeps = { runAudit: defaultRunAudit };

interface VulnCounts {
  critical?: number;
  high?: number;
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

/**
 * Normalizes each package manager's audit JSON to {critical, high} counts.
 * - npm / pnpm: a single JSON object with `metadata.vulnerabilities`.
 * - yarn (classic): newline-delimited JSON; the `auditSummary` line carries
 *   `data.vulnerabilities`.
 * Returns null when the output cannot be parsed (→ runtime error).
 */
function parseVulnCounts(
  pm: PackageManager,
  stdout: string,
): { critical: number; high: number } | null {
  if (pm === 'yarn') {
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const obj = JSON.parse(trimmed) as {
          type?: string;
          data?: { vulnerabilities?: VulnCounts };
        };
        if (obj.type === 'auditSummary') {
          const v = obj.data?.vulnerabilities ?? {};
          return { critical: num(v.critical), high: num(v.high) };
        }
      } catch {
        // skip non-JSON lines
      }
    }
    return null;
  }
  try {
    const parsed = JSON.parse(stdout) as { metadata?: { vulnerabilities?: VulnCounts } };
    const v = parsed.metadata?.vulnerabilities ?? {};
    return { critical: num(v.critical), high: num(v.high) };
  } catch {
    return null;
  }
}

function makeResult(
  status: CheckResult['status'],
  resultId: string,
  message: string,
  severity: CheckResult['severity'],
  extras: { fix?: string; detail?: string } = {},
): CheckResult {
  const r: CheckResult = { checkerId: ID, resultId, status, message, severity, category: CAT };
  if (extras.fix !== undefined) r.fix = extras.fix;
  if (extras.detail !== undefined) r.detail = extras.detail;
  return r;
}

/**
 * Static checker core. Detects the package manager from the lockfile, runs
 * `<pm> audit --json` via the injected dep, and normalizes the result to
 * critical/high counts. Outcomes:
 *   - 'skip' 'no-project-context' — ctx.project is null
 *   - 'skip' 'no-lockfile' — no recognized lockfile (npm/pnpm/yarn)
 *   - 'skip' 'aborted' — signal aborted
 *   - 'fail' 'critical-vulnerabilities' — one or more critical vulns
 *   - 'warn' 'high-vulnerabilities' — one or more high-severity vulns
 *   - 'pass' 'no-critical-or-high' — clean of critical/high
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

  const pm = await detectPackageManager(project);
  if (pm === null) {
    return [
      makeResult(
        'skip',
        'no-lockfile',
        'Skipped: no package-lock.json, pnpm-lock.yaml, or yarn.lock found; audit requires a lockfile.',
        SEV_CRITICAL,
      ),
    ];
  }

  let stdout: string;
  try {
    const result = await deps.runAudit(pm.name, project.projectDir, ctx.signal);
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
        `${pm.name} audit failed to run: ${err instanceof Error ? err.message : String(err)}`,
        SEV_CRITICAL,
        { fix: `Ensure ${pm.name} is installed and the project directory is accessible.` },
      ),
    ];
  }

  const counts = parseVulnCounts(pm.name, stdout);
  if (counts === null) {
    return [
      makeResult(
        'fail',
        'audit-runtime-error',
        `${pm.name} audit returned unparseable JSON output.`,
        SEV_CRITICAL,
        { fix: `Run \`${pm.name} audit --json\` manually to inspect the output.` },
      ),
    ];
  }

  const results: CheckResult[] = [];
  if (counts.critical > 0) {
    results.push(
      makeResult(
        'fail',
        'critical-vulnerabilities',
        `${pm.name} audit found ${counts.critical} critical vulnerability/vulnerabilities.`,
        SEV_CRITICAL,
        { fix: `Run \`${pm.name} audit fix\` or update the affected packages.` },
      ),
    );
  }
  if (counts.high > 0) {
    results.push(
      makeResult(
        'warn',
        'high-vulnerabilities',
        `${pm.name} audit found ${counts.high} high-severity vulnerability/vulnerabilities.`,
        SEV_MAJOR,
        { fix: `Run \`${pm.name} audit fix\` or update the affected packages.` },
      ),
    );
  }
  if (results.length === 0) {
    results.push(
      makeResult(
        'pass',
        'no-critical-or-high',
        `${pm.name} audit found no critical or high-severity vulnerabilities.`,
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
