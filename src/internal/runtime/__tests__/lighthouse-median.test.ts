import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import { median, medianLighthouse } from '../lighthouse-median.js';

function lh(perf: number, lcp: number, inp?: number): LighthouseResult {
  const audits: LighthouseResult['audits'] = {
    'largest-contentful-paint': { numericValue: lcp },
    'cumulative-layout-shift': { numericValue: 0 },
  };
  if (inp !== undefined) audits['interaction-to-next-paint'] = { numericValue: inp };
  return {
    categories: {
      performance: { score: perf },
      accessibility: { score: 1 },
      'best-practices': { score: 1 },
      seo: { score: 1 },
    },
    audits,
  };
}

describe('median', () => {
  test('odd length → middle', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  test('even length → mean of two middles', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  test('single value', () => {
    expect(median([5])).toBe(5);
  });
});

describe('medianLighthouse', () => {
  test('single result is returned unchanged', () => {
    const only = lh(0.42, 123);
    expect(medianLighthouse([only])).toBe(only);
  });

  test('medians category scores and named web-vital audits across runs', () => {
    const out = medianLighthouse([lh(0.5, 100, 40), lh(0.9, 300, 60), lh(0.7, 200, 50)]);
    expect(out.categories.performance.score).toBe(0.7);
    expect(out.audits['largest-contentful-paint']?.numericValue).toBe(200);
    expect(out.audits['interaction-to-next-paint']?.numericValue).toBe(50);
    // unchanged metrics stay at their (identical) value
    expect(out.categories.seo.score).toBe(1);
  });

  test('a named audit missing in any run is left at the base run value (not medianed)', () => {
    const out = medianLighthouse([lh(0.5, 100, 40), lh(0.9, 300), lh(0.7, 200, 50)]);
    // base run inp = 40; not all runs have inp → keep base, do not median
    expect(out.audits['interaction-to-next-paint']?.numericValue).toBe(40);
  });

  test('throws on empty input', () => {
    expect(() => medianLighthouse([])).toThrow();
  });
});

describe('medianLighthouse — null category scores', () => {
  test('a category null in every run stays null; others median', () => {
    const r1 = lh(0.5, 100);
    const r2 = lh(0.7, 200);
    r1.categories.seo.score = null;
    r2.categories.seo.score = null;
    const out = medianLighthouse([r1, r2]);
    expect(out.categories.seo.score).toBeNull();
    expect(out.categories.performance.score).toBe(0.6);
  });
  test('a category null in some runs medians only the present ones', () => {
    const r1 = lh(0.4, 100);
    const r2 = lh(0.8, 200);
    r1.categories.performance.score = null;
    expect(medianLighthouse([r1, r2]).categories.performance.score).toBe(0.8);
  });
});
