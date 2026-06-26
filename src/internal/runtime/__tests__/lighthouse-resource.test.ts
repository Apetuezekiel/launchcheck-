import { describe, expect, test } from 'vitest';
import type { LighthouseResult } from '../../../types/index.js';
import { type ChromeAdapter, type ChromeBrowser, ChromeResource } from '../resources/chrome.js';
import { type LighthouseAdapter, LighthouseResource } from '../resources/lighthouse.js';

const SIGNAL = new AbortController().signal;
const URL = 'https://example.test/';
const FAKE_BROWSER: ChromeBrowser = { id: 'fake-browser' };

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

function chromeAdapter(installed: boolean): ChromeAdapter {
  return {
    isInstalled: () => installed,
    launch: async () => FAKE_BROWSER,
    close: async () => undefined,
  };
}

const chromeResource = (installed = true): ChromeResource =>
  new ChromeResource(chromeAdapter(installed), SIGNAL);

function lighthouseAdapter(installed: boolean): LighthouseAdapter {
  return {
    isInstalled: () => installed,
    run: async () => STUB_RESULT,
  };
}

describe('LighthouseResource', () => {
  test('available when lighthouse and chrome are both installed', () => {
    const r = new LighthouseResource(URL, chromeResource(true), lighthouseAdapter(true), SIGNAL);
    expect(r.isAvailable()).toBe(true);
  });

  test('unavailable when lighthouse is not installed', () => {
    const r = new LighthouseResource(URL, chromeResource(true), lighthouseAdapter(false), SIGNAL);
    expect(r.isAvailable()).toBe(false);
    expect(r.unavailableReason()).toContain('lighthouse');
  });

  test('cascades to unavailable when chrome (puppeteer) is unavailable', () => {
    const r = new LighthouseResource(URL, chromeResource(false), lighthouseAdapter(true), SIGNAL);
    expect(r.isAvailable()).toBe(false);
    expect(r.unavailableReason()).toContain('chrome');
  });

  test('depends on the chrome resource', () => {
    const chrome = chromeResource(true);
    const r = new LighthouseResource(URL, chrome, lighthouseAdapter(true), SIGNAL);
    expect(r.dependencies()).toContain(chrome);
  });

  test('compute resolves to the adapter run result, using the shared browser', async () => {
    let seenBrowser: ChromeBrowser | undefined;
    const adapter: LighthouseAdapter = {
      isInstalled: () => true,
      run: async (browser) => {
        seenBrowser = browser;
        return STUB_RESULT;
      },
    };
    const r = new LighthouseResource(URL, chromeResource(true), adapter, SIGNAL);
    await expect(r.get()).resolves.toEqual(STUB_RESULT);
    expect(seenBrowser).toBe(FAKE_BROWSER);
  });

  test('default runs = 1 calls the adapter once', async () => {
    let calls = 0;
    const adapter: LighthouseAdapter = {
      isInstalled: () => true,
      run: async () => {
        calls += 1;
        return STUB_RESULT;
      },
    };
    const r = new LighthouseResource(URL, chromeResource(true), adapter, SIGNAL);
    await r.get();
    expect(calls).toBe(1);
  });

  test('runs = 3 medians the performance score across three audits', async () => {
    const scores = [0.5, 0.9, 0.7];
    let i = 0;
    const adapter: LighthouseAdapter = {
      isInstalled: () => true,
      run: async () => {
        const score = scores[i] ?? 0;
        i += 1;
        return {
          ...STUB_RESULT,
          categories: { ...STUB_RESULT.categories, performance: { score } },
        };
      },
    };
    const r = new LighthouseResource(URL, chromeResource(true), adapter, SIGNAL, 3);
    const result = await r.get();
    expect(i).toBe(3);
    expect(result.categories.performance.score).toBe(0.7);
  });
});
