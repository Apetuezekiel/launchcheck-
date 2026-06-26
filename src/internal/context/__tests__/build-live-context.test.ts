import { describe, expect, test } from 'vitest';
import { buildLiveContext } from '../build-live-context.js';

describe('buildLiveContext', () => {
  test('https URL â†’ tls resource available', () => {
    const { live } = buildLiveContext('https://example.test/');
    expect(live.tls.isAvailable()).toBe(true);
    expect(live.url).toBe('https://example.test/');
  });
  test('http URL â†’ tls resource unavailable (Issue A: no false SSL pass)', () => {
    const { live } = buildLiveContext('http://example.test/');
    expect(live.tls.isAvailable()).toBe(false);
    expect(live.tls.unavailableReason()).toContain('https');
  });
  test('dom resource is always available (depends on rootResponse)', () => {
    const { live } = buildLiveContext('https://example.test/');
    expect(live.dom.isAvailable()).toBe(true);
  });
  test('chrome resource is available when puppeteer adapter reports installed', () => {
    const { live } = buildLiveContext('https://example.test/', {
      chromeAdapter: {
        isInstalled: () => true,
        launch: async () => ({}),
        close: async () => undefined,
      },
      axeAdapter: {
        isInstalled: () => true,
        run: async () => ({ violations: [], passes: [], incomplete: [], inapplicable: [] }),
      },
    });
    expect(live.axe.isAvailable()).toBe(true);
  });
  test('axe resource is unavailable when axe adapter reports not installed', () => {
    const { live } = buildLiveContext('https://example.test/', {
      chromeAdapter: {
        isInstalled: () => true,
        launch: async () => ({}),
        close: async () => undefined,
      },
      axeAdapter: {
        isInstalled: () => false,
        run: async () => ({ violations: [], passes: [], incomplete: [], inapplicable: [] }),
      },
    });
    expect(live.axe.isAvailable()).toBe(false);
  });
  test('lighthouse resource is available when lighthouse + chrome adapters report installed', () => {
    const { live } = buildLiveContext('https://example.test/', {
      chromeAdapter: {
        isInstalled: () => true,
        launch: async () => ({}),
        close: async () => undefined,
      },
      lighthouseAdapter: {
        isInstalled: () => true,
        run: async () => ({
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
        }),
      },
    });
    expect(live.lighthouse.isAvailable()).toBe(true);
  });
  test('lighthouse resource is unavailable when lighthouse adapter reports not installed', () => {
    const { live } = buildLiveContext('https://example.test/', {
      lighthouseAdapter: {
        isInstalled: () => false,
        run: async () => ({
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
        }),
      },
    });
    expect(live.lighthouse.isAvailable()).toBe(false);
  });
});
