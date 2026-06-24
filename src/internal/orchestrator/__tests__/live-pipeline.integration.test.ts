import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import { runLiveChecks } from '../run-live.js';
import { BAD_HTML, type Fixture, GOOD_HTML, startFixture } from './support/fixture-server.js';

const find = (results: CheckResult[], id: string): CheckResult | undefined =>
  results.find((r) => r.checkerId === id);
const status = (results: CheckResult[], id: string): string | undefined =>
  find(results, id)?.status;

const SECURE_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'content-security-policy': "default-src 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=()',
  'x-frame-options': 'DENY',
  'content-encoding': 'br',
};
const LONG_CACHE = { 'cache-control': 'public, max-age=31536000, immutable' };

// Force the browser resources unavailable via the live-deps seam so the skip
// cascade is deterministic regardless of whether the optional peers happen to be
// installed in the dev/CI environment. The HTTP/DOM pipeline is what this suite
// exercises; the browser path is covered by unit tests and the CI browser smoke.
const NO_BROWSER = {
  chromeAdapter: {
    isInstalled: () => false,
    launch: async () => {
      throw new Error('unused');
    },
    close: async () => {},
  },
  axeAdapter: {
    isInstalled: () => false,
    run: async () => {
      throw new Error('unused');
    },
  },
  lighthouseAdapter: {
    isInstalled: () => false,
    run: async () => {
      throw new Error('unused');
    },
  },
};

describe('live pipeline against a well-configured fixture', () => {
  let fx: Fixture;
  let results: CheckResult[];

  beforeAll(async () => {
    fx = await startFixture({
      routes: {
        '/': { headers: SECURE_HEADERS, body: GOOD_HTML },
        '/robots.txt': { body: 'User-agent: *\nDisallow: /admin' },
        '/sitemap.xml': {
          headers: { 'content-type': 'application/xml' },
          body: '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        },
        '/favicon.ico': { headers: { 'content-type': 'image/x-icon' }, body: 'icon' },
        '/app.css': {
          headers: { ...LONG_CACHE, 'content-type': 'text/css' },
          body: 'body{color:#000}',
        },
        '/app.js': { headers: { ...LONG_CACHE, 'content-type': 'text/javascript' }, body: '' },
        '/health': { body: 'ok' },
      },
    });
    results = await runLiveChecks({ url: fx.url, liveDeps: NO_BROWSER });
  }, 60_000);
  afterAll(async () => {
    await fx.close();
  });

  test('security headers all pass', () => {
    for (const id of [
      'hsts-present',
      'csp-present',
      'x-content-type-options-nosniff',
      'referrer-policy-present',
      'permissions-policy-present',
      'clickjacking-protection',
      'server-headers-suppressed',
    ]) {
      expect(status(results, id), id).toBe('pass');
    }
  });

  test('SEO/DOM checks pass on good HTML', () => {
    for (const id of [
      'title-tag-present',
      'meta-description-present',
      'canonical-url',
      'single-h1',
      'open-graph-tags',
      'twitter-card-tags',
      'structured-data',
      'robots-txt-accessible',
      'sitemap-xml-accessible',
      'favicon-present',
    ]) {
      expect(status(results, id), id).toBe('pass');
    }
  });

  test('performance + deployment pass', () => {
    expect(status(results, 'compression-enabled')).toBe('pass');
    expect(status(results, 'not-found-returns-404')).toBe('pass');
    expect(status(results, 'health-endpoint-responds')).toBe('pass');
    expect(status(results, 'cors-not-wildcard')).toBe('pass');
    // static-asset-cache emits one result per asset class; all should be cached.
    const cache = results.filter((r) => r.checkerId === 'static-asset-cache-headers');
    expect(cache.length).toBeGreaterThan(0);
    expect(cache.every((r) => r.status === 'pass')).toBe(true);
  });

  test('browser + TLS checks skip cleanly (no peers / http URL)', () => {
    // ssl-valid always skips on http:// — no TLS resource is created.
    expect(status(results, 'ssl-valid')).toBe('skip');
    // Browser checks skip because NO_BROWSER forces the peers unavailable.
    for (const id of [
      'a11y-color-contrast',
      'lighthouse-performance-score',
      'core-web-vital-lcp',
    ]) {
      expect(status(results, id), id).toBe('skip');
    }
  });
});

describe('live pipeline against a misconfigured fixture', () => {
  let fx: Fixture;
  let results: CheckResult[];

  beforeAll(async () => {
    fx = await startFixture({
      routes: { '/': { body: BAD_HTML } },
      fallback: { status: 404, body: 'nope' },
    });
    results = await runLiveChecks({ url: fx.url, liveDeps: NO_BROWSER });
  }, 60_000);
  afterAll(async () => {
    await fx.close();
  });

  test('missing security headers fail', () => {
    for (const id of [
      'hsts-present',
      'csp-present',
      'x-content-type-options-nosniff',
      'clickjacking-protection',
    ]) {
      expect(status(results, id), id).toBe('fail');
    }
  });

  test('bad HTML fails SEO/DOM', () => {
    expect(status(results, 'single-h1')).toBe('fail');
    expect(status(results, 'title-tag-present')).toBe('fail');
    expect(status(results, 'meta-description-present')).toBe('fail');
  });

  test('missing compression and robots/sitemap fail', () => {
    expect(status(results, 'compression-enabled')).toBe('fail');
    expect(status(results, 'robots-txt-accessible')).toBe('fail');
    expect(status(results, 'sitemap-xml-accessible')).toBe('fail');
  });
});
