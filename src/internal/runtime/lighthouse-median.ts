import type { LighthouseResult } from '../../types/index.js';

/** Median of a non-empty number list (mean of the two middles for even length). */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] as number;
  }
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;
const NUMERIC_AUDITS = [
  'largest-contentful-paint',
  'cumulative-layout-shift',
  'interaction-to-next-paint',
] as const;

/**
 * Aggregates N Lighthouse runs into one result by taking the per-metric median,
 * damping the single-run score variance Lighthouse is known for. The first
 * run is used as the structural base; the four category scores and the named
 * Core Web Vital audits are replaced with medians across all runs. A named
 * audit is only medianed when every run reports a numericValue for it
 * (otherwise the base run's value is kept). N=1 returns the single run
 * unchanged.
 */
export function medianLighthouse(results: LighthouseResult[]): LighthouseResult {
  const base = results[0];
  if (base === undefined) {
    throw new Error('medianLighthouse requires at least one result');
  }
  if (results.length === 1) {
    return base;
  }

  const categories = { ...base.categories };
  for (const cat of CATEGORIES) {
    categories[cat] = { score: median(results.map((r) => r.categories[cat].score)) };
  }

  const audits = { ...base.audits };
  for (const id of NUMERIC_AUDITS) {
    const values = results.map((r) => r.audits[id]?.numericValue);
    if (values.every((v): v is number => typeof v === 'number')) {
      audits[id] = { numericValue: median(values) };
    }
  }

  return { categories, audits };
}
