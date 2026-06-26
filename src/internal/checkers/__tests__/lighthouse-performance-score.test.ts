import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { lighthousePerformanceScoreChecker } from '../lighthouse-performance-score.js';
import { makeLiveContext } from './live-context.js';

const PASS_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 0.95 },
    accessibility: { score: 1 },
    'best-practices': { score: 1 },
    seo: { score: 1 },
  },
  audits: {
    'largest-contentful-paint': { numericValue: 100 },
    'cumulative-layout-shift': { numericValue: 0 },
    'interaction-to-next-paint': { numericValue: 50 },
  },
};

const FAIL_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 0.5 },
    accessibility: { score: 1 },
    'best-practices': { score: 1 },
    seo: { score: 1 },
  },
  audits: {
    'largest-contentful-paint': { numericValue: 100 },
    'cumulative-layout-shift': { numericValue: 0 },
    'interaction-to-next-paint': { numericValue: 50 },
  },
};

describe('lighthousePerformanceScoreChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('lighthouse-performance-score');
    expect(lighthousePerformanceScoreChecker.id).toBe(e?.id);
    expect(lighthousePerformanceScoreChecker.mode).toBe(e?.mode);
    expect(lighthousePerformanceScoreChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await lighthousePerformanceScoreChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when lighthouse unavailable', async () => {
    const r = await lighthousePerformanceScoreChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('lighthouse-unavailable');
  });

  test('pass when performance score meets default threshold', async () => {
    const r = await lighthousePerformanceScoreChecker.run(
      makeLiveContext({ lighthouse: PASS_RESULT }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('performance-score-ok');
  });

  test('fail when performance score is below default threshold', async () => {
    const r = await lighthousePerformanceScoreChecker.run(
      makeLiveContext({ lighthouse: FAIL_RESULT }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('performance-score-low');
  });
});

describe('lighthousePerformanceScoreChecker — missing category (not coerced to 0)', () => {
  test('skips when Lighthouse did not report a performance score', async () => {
    const r = await lighthousePerformanceScoreChecker.run(
      makeLiveContext({
        lighthouse: {
          ...PASS_RESULT,
          categories: { ...PASS_RESULT.categories, performance: { score: null } },
        },
      }),
    );
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('performance-score-unavailable');
  });
});
