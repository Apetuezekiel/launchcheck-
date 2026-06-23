import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { coreWebVitalLcpChecker } from '../core-web-vital-lcp.js';
import { makeLiveContext } from './live-context.js';

const PASS_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 1 },
    accessibility: { score: 1 },
    'best-practices': { score: 1 },
    seo: { score: 1 },
  },
  audits: {
    'largest-contentful-paint': { numericValue: 1000 },
    'cumulative-layout-shift': { numericValue: 0 },
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
    'largest-contentful-paint': { numericValue: 5000 },
    'cumulative-layout-shift': { numericValue: 0 },
    'interaction-to-next-paint': { numericValue: 50 },
  },
};

describe('coreWebVitalLcpChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('core-web-vital-lcp');
    expect(coreWebVitalLcpChecker.id).toBe(e?.id);
    expect(coreWebVitalLcpChecker.mode).toBe(e?.mode);
    expect(coreWebVitalLcpChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await coreWebVitalLcpChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when lighthouse unavailable', async () => {
    const r = await coreWebVitalLcpChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('lighthouse-unavailable');
  });

  test('pass when LCP is within default threshold', async () => {
    const r = await coreWebVitalLcpChecker.run(makeLiveContext({ lighthouse: PASS_RESULT }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('lcp-ok');
  });

  test('fail when LCP exceeds default threshold', async () => {
    const r = await coreWebVitalLcpChecker.run(makeLiveContext({ lighthouse: FAIL_RESULT }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('lcp-slow');
  });
});
