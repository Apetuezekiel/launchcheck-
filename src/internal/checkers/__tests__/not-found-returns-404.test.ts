import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { notFoundReturns404Checker } from '../not-found-returns-404.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

const http = (status: number): HttpClient => ({
  fetch: (url) => Promise.resolve(makeHttpResponse({}, { url, status })),
});

describe('notFoundReturns404Checker', () => {
  test('matches the registry entry', () => {
    const e = findById('not-found-returns-404');
    expect(notFoundReturns404Checker.id).toBe(e?.id);
    expect(notFoundReturns404Checker.mode).toBe(e?.mode);
    expect(notFoundReturns404Checker.category).toBe(e?.category);
  });
  test('skips when no live context', async () => {
    const ctx = makeLiveContext();
    const noLive = { ...ctx, mode: 'static' as const, live: null };
    const r = await notFoundReturns404Checker.run(noLive);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });
  test('pass when 404', async () => {
    const r = await notFoundReturns404Checker.run(makeLiveContext({ http: http(404) }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('returns-404');
  });
  test('fail (soft-404) when 200', async () => {
    const r = await notFoundReturns404Checker.run(makeLiveContext({ http: http(200) }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('soft-404');
  });
  test('warn when other status', async () => {
    const r = await notFoundReturns404Checker.run(makeLiveContext({ http: http(403) }));
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('unexpected-status');
  });
  test('fail when fetch throws', async () => {
    const r = await notFoundReturns404Checker.run(
      makeLiveContext({ http: { fetch: () => Promise.reject(new Error('boom')) } }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('probe-fetch-failed');
  });
});
