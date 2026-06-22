import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { compressionEnabledChecker } from '../compression-enabled.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

const http = (headers: Record<string, string>): HttpClient => ({
  fetch: (url) => Promise.resolve(makeHttpResponse(headers, { url })),
});

describe('compressionEnabledChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('compression-enabled');
    expect(compressionEnabledChecker.id).toBe(e?.id);
    expect(compressionEnabledChecker.mode).toBe(e?.mode);
    expect(compressionEnabledChecker.category).toBe(e?.category);
  });
  test('skips when no live context', async () => {
    const ctx = makeLiveContext();
    const noLive = { ...ctx, mode: 'static' as const, live: null };
    const r = await compressionEnabledChecker.run(noLive);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });
  test('pass when gzip', async () => {
    const r = await compressionEnabledChecker.run(
      makeLiveContext({ http: http({ 'content-encoding': 'gzip' }) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('compression-enabled');
  });
  test('pass when br', async () => {
    const r = await compressionEnabledChecker.run(
      makeLiveContext({ http: http({ 'content-encoding': 'br' }) }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when absent', async () => {
    const r = await compressionEnabledChecker.run(makeLiveContext({ http: http({}) }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('compression-absent');
  });
  test('warn when unrecognized encoding', async () => {
    const r = await compressionEnabledChecker.run(
      makeLiveContext({ http: http({ 'content-encoding': 'identity' }) }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('compression-unrecognized');
  });
  test('fail when fetch throws', async () => {
    const r = await compressionEnabledChecker.run(
      makeLiveContext({ http: { fetch: () => Promise.reject(new Error('boom')) } }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('compression-fetch-failed');
  });
});
