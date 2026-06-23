import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { staticAssetCacheHeadersChecker } from '../static-asset-cache-headers.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

// Maps absolute URL -> cache-control value (or undefined for no header).
const http = (byUrl: Record<string, string | undefined>): HttpClient => ({
  fetch: (url) => {
    const cc = byUrl[url];
    const headers = cc === undefined ? {} : { 'cache-control': cc };
    return Promise.resolve(makeHttpResponse(headers, { url }));
  },
});

const find = (rs: Awaited<ReturnType<typeof staticAssetCacheHeadersChecker.run>>, id: string) =>
  rs.find((r) => r.resultId === id);

describe('staticAssetCacheHeadersChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('static-asset-cache-headers');
    expect(staticAssetCacheHeadersChecker.id).toBe(e?.id);
    expect(staticAssetCacheHeadersChecker.mode).toBe(e?.mode);
    expect(staticAssetCacheHeadersChecker.category).toBe(e?.category);
  });
  test('skips when no live context', async () => {
    const ctx = makeLiveContext();
    const noLive = { ...ctx, mode: 'static' as const, live: null };
    const r = await staticAssetCacheHeadersChecker.run(noLive);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });
  test('pass when no static assets', async () => {
    const r = await staticAssetCacheHeadersChecker.run(
      makeLiveContext({ domHtml: '<html><head></head><body>hi</body></html>' }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('no-static-assets');
  });
  test('per-class pass when long-lived; distinct resultIds', async () => {
    const html =
      '<html><head><script src="/app.js"></script><link rel="stylesheet" href="/app.css"></head><body><img src="/a.png"></body></html>';
    const r = await staticAssetCacheHeadersChecker.run(
      makeLiveContext({
        domHtml: html,
        http: http({
          'https://example.test/app.js': 'public, max-age=31536000, immutable',
          'https://example.test/app.css': 'max-age=86400',
          'https://example.test/a.png': 'public, immutable',
        }),
      }),
    );
    expect(find(r, 'scripts-cached')?.status).toBe('pass');
    expect(find(r, 'styles-cached')?.status).toBe('pass');
    expect(find(r, 'images-cached')?.status).toBe('pass');
    const ids = r.map((x) => x.resultId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test('warn when a class is uncached', async () => {
    const html = '<html><head><script src="/app.js"></script></head><body></body></html>';
    const r = await staticAssetCacheHeadersChecker.run(
      makeLiveContext({
        domHtml: html,
        http: http({ 'https://example.test/app.js': 'no-cache' }),
      }),
    );
    expect(find(r, 'scripts-uncached')?.status).toBe('warn');
  });
  test('warn (unreachable) when all assets in a class are unreachable', async () => {
    const html = '<html><head><script src="/app.js"></script></head><body></body></html>';
    const r = await staticAssetCacheHeadersChecker.run(
      makeLiveContext({
        domHtml: html,
        http: { fetch: () => Promise.reject(new Error('boom')) },
      }),
    );
    expect(find(r, 'scripts-unreachable')?.status).toBe('warn');
  });
});
