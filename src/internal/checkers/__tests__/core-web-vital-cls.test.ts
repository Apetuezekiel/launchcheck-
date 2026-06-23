import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { coreWebVitalClsChecker } from '../core-web-vital-cls.js';
import { makeLiveContext } from './live-context.js';

const PASS_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 1 },
    accessibility: { score: 1 },
    'best-practices': { score: 1 },
    seo: { score: 1 },
  },
  audits: {
    'largest-contentful-paint': { numericValue: 100 },
    'cumulative-layout-shift': { numericValue: 0.05 },
    'interaction-to-next-paint': { numericValue: 50 },
  },
};

const FAIL_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 1 },
    accessibility: { score: 1 },
    'best-practices': { score: 1 },
    seo: { score: 1 },
  },
  audits: {
    'largest-contentful-paint': { numericValue: 100 },
    'cumulative-layout-shift': { numericValue: 0.5 },
    'interaction-to-next-paint': { numericValue: 50 },
  },
};

describe('coreWebVitalClsChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('core-web-vital-cls');
    expect(coreWebVitalClsChecker.id).toBe(e?.id);
    expect(coreWebVitalClsChecker.mode).toBe(e?.mode);
    expect(coreWebVitalClsChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await coreWebVitalClsChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when lighthouse unavailable', async () => {
    const r = await coreWebVitalClsChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('lighthouse-unavailable');
  });

  test('pass when CLS is within default threshold', async () => {
    const r = await coreWebVitalClsChecker.run(makeLiveContext({ lighthouse: PASS_RESULT }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('cls-ok');
  });

  test('fail when CLS exceeds default threshold', async () => {
    const r = await coreWebVitalClsChecker.run(makeLiveContext({ lighthouse: FAIL_RESULT }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('cls-high');
  });
});
