import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { lighthouseAccessibilityScoreChecker } from '../lighthouse-accessibility-score.js';
import { makeLiveContext } from './live-context.js';

const PASS_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 1 },
    accessibility: { score: 0.95 },
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
    performance: { score: 1 },
    accessibility: { score: 0.5 },
    'best-practices': { score: 1 },
    seo: { score: 1 },
  },
  audits: {
    'largest-contentful-paint': { numericValue: 100 },
    'cumulative-layout-shift': { numericValue: 0 },
    'interaction-to-next-paint': { numericValue: 50 },
  },
};

describe('lighthouseAccessibilityScoreChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('lighthouse-accessibility-score');
    expect(lighthouseAccessibilityScoreChecker.id).toBe(e?.id);
    expect(lighthouseAccessibilityScoreChecker.mode).toBe(e?.mode);
    expect(lighthouseAccessibilityScoreChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await lighthouseAccessibilityScoreChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when lighthouse unavailable', async () => {
    const r = await lighthouseAccessibilityScoreChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('lighthouse-unavailable');
  });

  test('pass when accessibility score meets default threshold', async () => {
    const r = await lighthouseAccessibilityScoreChecker.run(
      makeLiveContext({ lighthouse: PASS_RESULT }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('accessibility-score-ok');
  });

  test('fail when accessibility score is below default threshold', async () => {
    const r = await lighthouseAccessibilityScoreChecker.run(
      makeLiveContext({ lighthouse: FAIL_RESULT }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('accessibility-score-low');
  });
});
