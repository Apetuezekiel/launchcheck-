import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { fontPreloadAndDisplaySwapChecker } from '../font-preload-and-display-swap.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

const cssHttp = (body: string): HttpClient => ({
  fetch: (url) => Promise.resolve(makeHttpResponse({}, { url, body })),
});

describe('fontPreloadAndDisplaySwapChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('font-preload-and-display-swap');
    expect(fontPreloadAndDisplaySwapChecker.id).toBe(e?.id);
    expect(fontPreloadAndDisplaySwapChecker.mode).toBe(e?.mode);
    expect(fontPreloadAndDisplaySwapChecker.category).toBe(e?.category);
  });
  test('skips when no live context', async () => {
    const ctx = makeLiveContext();
    const noLive = { ...ctx, mode: 'static' as const, live: null };
    const r = await fontPreloadAndDisplaySwapChecker.run(noLive);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });
  test('pass when no web fonts', async () => {
    const r = await fontPreloadAndDisplaySwapChecker.run(
      makeLiveContext({ domHtml: '<html><head></head><body>hi</body></html>' }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('no-web-fonts');
  });
  test('warn when @font-face lacks font-display (inline style)', async () => {
    const html =
      '<html><head><style>@font-face { font-family: A; src: url(a.woff2); }</style></head><body></body></html>';
    const r = await fontPreloadAndDisplaySwapChecker.run(makeLiveContext({ domHtml: html }));
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('font-display-missing');
  });
  test('warn when font-display present but not preloaded', async () => {
    const html =
      '<html><head><style>@font-face { font-family: A; font-display: swap; src: url(a.woff2); }</style></head><body></body></html>';
    const r = await fontPreloadAndDisplaySwapChecker.run(makeLiveContext({ domHtml: html }));
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('fonts-not-preloaded');
  });
  test('pass when font-display swap and preloaded', async () => {
    const html =
      '<html><head><link rel="preload" as="font" href="a.woff2" crossorigin><style>@font-face { font-family: A; font-display: swap; src: url(a.woff2); }</style></head><body></body></html>';
    const r = await fontPreloadAndDisplaySwapChecker.run(makeLiveContext({ domHtml: html }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('fonts-optimized');
  });
  test('fetches external stylesheet to find @font-face', async () => {
    const html = '<html><head><link rel="stylesheet" href="/style.css"></head><body></body></html>';
    const r = await fontPreloadAndDisplaySwapChecker.run(
      makeLiveContext({
        domHtml: html,
        http: cssHttp('@font-face { font-family: A; src: url(a.woff2); }'),
      }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('font-display-missing');
  });
  test('pass (preloaded) when fonts preloaded but no @font-face found', async () => {
    const html =
      '<html><head><link rel="preload" as="font" href="a.woff2" crossorigin></head><body></body></html>';
    const r = await fontPreloadAndDisplaySwapChecker.run(makeLiveContext({ domHtml: html }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('fonts-preloaded');
  });
});
