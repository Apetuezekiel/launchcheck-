import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import type { LighthouseAdapter } from '../resources/lighthouse.js';
import { LighthouseResource } from '../resources/lighthouse.js';

const SIGNAL = new AbortController().signal;
const URL = 'https://example.test/';

const STUB_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 1 },
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

function makeAdapter(installed: boolean): LighthouseAdapter {
  return {
    isInstalled: () => installed,
    run: async () => STUB_RESULT,
  };
}

describe('LighthouseResource', () => {
  test('available when adapter reports installed', () => {
    const r = new LighthouseResource(URL, makeAdapter(true), SIGNAL);
    expect(r.isAvailable()).toBe(true);
  });

  test('unavailable when adapter reports not installed', () => {
    const r = new LighthouseResource(URL, makeAdapter(false), SIGNAL);
    expect(r.isAvailable()).toBe(false);
  });

  test('unavailable reason mentions lighthouse when not installed', () => {
    const r = new LighthouseResource(URL, makeAdapter(false), SIGNAL);
    expect(r.unavailableReason()).toContain('lighthouse');
  });

  test('dependencies returns empty array (no chrome dependency)', () => {
    const r = new LighthouseResource(URL, makeAdapter(true), SIGNAL);
    expect(r.dependencies()).toHaveLength(0);
  });

  test('compute resolves to the adapter run result', async () => {
    const r = new LighthouseResource(URL, makeAdapter(true), SIGNAL);
    await expect(r.get()).resolves.toEqual(STUB_RESULT);
  });
});
