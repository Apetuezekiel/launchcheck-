import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { faviconPresentChecker } from '../favicon-present.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

const http = (status: number): HttpClient => ({
  fetch: (url) => Promise.resolve(makeHttpResponse({}, { url, status })),
});

describe('faviconPresentChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('favicon-present');
    expect(faviconPresentChecker.id).toBe(e?.id);
    expect(faviconPresentChecker.mode).toBe(e?.mode);
  });
  test('pass via <link rel="icon"> (no http needed)', async () => {
    const r = await faviconPresentChecker.run(
      makeLiveContext({ domHtml: '<link rel="icon" href="/f.png">', http: http(404) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('favicon-link');
  });
  test('pass via /favicon.ico fallback', async () => {
    const r = await faviconPresentChecker.run(
      makeLiveContext({ domHtml: '<title>no icon</title>', http: http(200) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('favicon-file');
  });
  test('fail when neither', async () => {
    const r = await faviconPresentChecker.run(
      makeLiveContext({ domHtml: '<title>no icon</title>', http: http(404) }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('favicon-missing');
  });

  test('does not issue a second fetch when the DOM is unavailable (Issue B)', async () => {
    let calls = 0;
    const http: HttpClient = {
      fetch: () => {
        calls += 1;
        return Promise.resolve(makeHttpResponse({}, { status: 200 }));
      },
    };
    // no domHtml â†’ dom resolves to skip; the checker must not probe /favicon.ico
    const r = await faviconPresentChecker.run(makeLiveContext({ http }));
    expect(r[0]?.resultId).toBe('favicon-missing');
    expect(calls).toBe(0);
  });
});