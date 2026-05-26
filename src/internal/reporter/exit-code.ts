import type { CheckResult } from '../../types/index.js';

/** Exit code returned to the shell. */
export type ExitCode = 0 | 1 | 2;

/**
 * Severity-based exit-code policy. Default v1 policy:
 *
 *   - 2 if any result has status 'fail' AND severity 'critical'
 *   - 1 if any result has status 'fail' (regardless of severity)
 *   - 0 otherwise
 *
 * 'warn' and 'skip' do not affect the exit code. 'fail' at severity
 * 'info' or 'minor' still exits 1 — a fail is a fail; severity only
 * escalates the magnitude.
 *
 * Pure — does not read process.env or argv. The CLI is responsible for
 * passing process.exit(computeExitCode(results)).
 */
export function computeExitCode(results: ReadonlyArray<CheckResult>): ExitCode {
  let hasCriticalFail = false;
  let hasFail = false;
  for (const r of results) {
    if (r.status === 'fail') {
      hasFail = true;
      if (r.severity === 'critical') {
        hasCriticalFail = true;
      }
    }
  }
  if (hasCriticalFail) return 2;
  if (hasFail) return 1;
  return 0;
}
