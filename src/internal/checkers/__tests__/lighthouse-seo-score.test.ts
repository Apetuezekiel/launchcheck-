import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { lighthouseSeoScoreChecker } from '../lighthouse-seo-score.js';
import { makeLiveContext } from './live-context.js';

const PASS_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 1 },
    accessibility: { score: 1 },
    'best-practices': { score: 1 },
    seo: { score: 0.95 },
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
    'best-practices': { score: 1 },
    seo: { score: 0.5 },
  },
  audits: {
    'largest-contentful-paint': { numericValue: 100 },
    'cumulative-layout-shift': { numericValue: 0 },
    'interaction-to-next-paint': { numericValue: 50 },
  },
};

describe('lighthouseSeoScoreChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('lighthouse-seo-score');
    expect(lighthouseSeoScoreChecker.id).toBe(e?.id);
    expect(lighthouseSeoScoreChecker.mode).toBe(e?.mode);
    expect(lighthouseSeoScoreChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await lighthouseSeoScoreChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when lighthouse unavailable', async () => {
    const r = await lighthouseSeoScoreChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('lighthouse-unavailable');
  });

  test('pass when seo score meets default threshold', async () => {
    const r = await lighthouseSeoScoreChecker.run(makeLiveContext({ lighthouse: PASS_RESULT }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('seo-score-ok');
  });

  test('fail when seo score is below default threshold', async () => {
    const r = await lighthouseSeoScoreChecker.run(makeLiveContext({ lighthouse: FAIL_RESULT }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('seo-score-low');
  });
});
