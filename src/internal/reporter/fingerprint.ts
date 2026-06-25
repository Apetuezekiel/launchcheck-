import type { CheckResult } from '../../types/index.js';

/**
 * Stable identity for a single finding, used as a SARIF partial fingerprint and
 * (in a later phase) as the baseline-diff key. Built from the checker + result
 * ids, plus the source location when the finding maps to a specific file so that
 * multiple findings from the same checker/result on different files stay distinct.
 * Deliberately excludes volatile message text so it is stable run-to-run.
 */
export function fingerprint(result: CheckResult): string {
  const base = `${result.checkerId}/${result.resultId}`;
  if (result.location !== undefined) {
    const { file, line } = result.location;
    return `${base}@${file}:${line ?? 0}`;
  }
  return base;
}
