import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { coreWebVitalInpChecker } from '../core-web-vital-inp.js';
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
    'cumulative-layout-shift': { numericValue: 0 },
    'interaction-to-next-paint': { numericValue: 100 },
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
    'cumulative-layout-shift': { numericValue: 0 },
    'interaction-to-next-paint': { numericValue: 500 },
  },
};

describe('coreWebVitalInpChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('core-web-vital-inp');
    expect(coreWebVitalInpChecker.id).toBe(e?.id);
    expect(coreWebVitalInpChecker.mode).toBe(e?.mode);
    expect(coreWebVitalInpChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await coreWebVitalInpChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when lighthouse unavailable', async () => {
    const r = await coreWebVitalInpChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('lighthouse-unavailable');
  });

  test('pass when INP is within default threshold', async () => {
    const r = await coreWebVitalInpChecker.run(makeLiveContext({ lighthouse: PASS_RESULT }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('inp-ok');
  });

  test('fail when INP exceeds default threshold', async () => {
    const r = await coreWebVitalInpChecker.run(makeLiveContext({ lighthouse: FAIL_RESULT }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('inp-slow');
  });
});
