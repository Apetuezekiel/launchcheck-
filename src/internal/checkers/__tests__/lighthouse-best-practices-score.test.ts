import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { lighthouseBestPracticesScoreChecker } from '../lighthouse-best-practices-score.js';
import { makeLiveContext } from './live-context.js';

const PASS_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 1 },
    accessibility: { score: 1 },
    'best-practices': { score: 0.95 },
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
    accessibility: { score: 1 },
    'best-practices': { score: 0.5 },
    seo: { score: 1 },
  },
  audits: {
    'largest-contentful-paint': { numericValue: 100 },
    'cumulative-layout-shift': { numericValue: 0 },
    'interaction-to-next-paint': { numericValue: 50 },
  },
};

describe('lighthouseBestPracticesScoreChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('lighthouse-best-practices-score');
    expect(lighthouseBestPracticesScoreChecker.id).toBe(e?.id);
    expect(lighthouseBestPracticesScoreChecker.mode).toBe(e?.mode);
    expect(lighthouseBestPracticesScoreChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await lighthouseBestPracticesScoreChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when lighthouse unavailable', async () => {
    const r = await lighthouseBestPracticesScoreChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('lighthouse-unavailable');
  });

  test('pass when best-practices score meets default threshold', async () => {
    const r = await lighthouseBestPracticesScoreChecker.run(
      makeLiveContext({ lighthouse: PASS_RESULT }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('best-practices-score-ok');
  });

  test('fail when best-practices score is below default threshold', async () => {
    const r = await lighthouseBestPracticesScoreChecker.run(
      makeLiveContext({ lighthouse: FAIL_RESULT }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('best-practices-score-low');
  });
});
