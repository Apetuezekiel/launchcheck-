import type { CheckResult } from '../../types/index.js';
import { type ExitCode, computeExitCode } from './exit-code.js';
import { fingerprint } from './fingerprint.js';

/**
 * Findings subject to the baseline gate: 'fail' and 'warn' (the problems).
 * 'pass'/'skip' are never baselined.
 */
export function gatedFindings(results: ReadonlyArray<CheckResult>): CheckResult[] {
  return results.filter((r) => r.status === 'fail' || r.status === 'warn');
}

/** Serializes the current findings' fingerprints as a baseline file (sorted, stable). */
export function serializeBaseline(results: ReadonlyArray<CheckResult>): string {
  const fingerprints = [...new Set(gatedFindings(results).map(fingerprint))].sort();
  return `${JSON.stringify({ fingerprints }, null, 2)}\n`;
}

/** Parses a baseline file into a set of fingerprints. Accepts the object form or a bare array. */
export function parseBaseline(text: string): Set<string> {
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null
      ? (data as { fingerprints?: unknown }).fingerprints
      : undefined;
  if (!Array.isArray(list) || !list.every((x) => typeof x === 'string')) {
    throw new Error('baseline file must contain a string array under "fingerprints"');
  }
  return new Set(list);
}

export interface BaselineDiff {
  /** Gated findings whose fingerprint is not in the baseline. */
  newFindings: CheckResult[];
  /** Count of gated findings present in the baseline (pre-existing, accepted). */
  knownCount: number;
  /** Count of baseline fingerprints no longer present (resolved). */
  fixedCount: number;
}

/** Classifies current findings against a baseline of accepted fingerprints. */
export function diffBaseline(
  results: ReadonlyArray<CheckResult>,
  baseline: ReadonlySet<string>,
): BaselineDiff {
  const gated = gatedFindings(results);
  const currentFps = new Set(gated.map(fingerprint));
  const newFindings = gated.filter((r) => !baseline.has(fingerprint(r)));
  let fixedCount = 0;
  for (const fp of baseline) {
    if (!currentFps.has(fp)) {
      fixedCount += 1;
    }
  }
  return { newFindings, knownCount: gated.length - newFindings.length, fixedCount };
}

/** Exit code under a baseline: the gate keys off NEW findings only. */
export function baselineExitCode(diff: BaselineDiff): ExitCode {
  return computeExitCode(diff.newFindings);
}

/** One-line human summary appended to terminal output under a baseline. */
export function baselineSummary(diff: BaselineDiff): string {
  return `baseline: ${diff.newFindings.length} new, ${diff.knownCount} known, ${diff.fixedCount} fixed`;
}
