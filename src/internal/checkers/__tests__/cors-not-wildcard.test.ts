import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { corsNotWildcardChecker } from '../cors-not-wildcard.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

const http = (headers: Record<string, string>): HttpClient => ({
  fetch: (url) => Promise.resolve(makeHttpResponse(headers, { url })),
});

describe('corsNotWildcardChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('cors-not-wildcard');
    expect(corsNotWildcardChecker.id).toBe(e?.id);
    expect(corsNotWildcardChecker.mode).toBe(e?.mode);
    expect(corsNotWildcardChecker.category).toBe(e?.category);
  });
  test('skips when no live context', async () => {
    const ctx = makeLiveContext();
    const noLive = { ...ctx, mode: 'static' as const, live: null };
    const r = await corsNotWildcardChecker.run(noLive);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });
  test('fail on wildcard', async () => {
    const r = await corsNotWildcardChecker.run(
      makeLiveContext({ http: http({ 'access-control-allow-origin': '*' }) }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('cors-wildcard');
  });
  test('pass when no ACAO header', async () => {
    const r = await corsNotWildcardChecker.run(makeLiveContext({ http: http({}) }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('cors-not-exposed');
  });
  test('fail when reflecting arbitrary origin with credentials', async () => {
    const r = await corsNotWildcardChecker.run(
      makeLiveContext({
        http: http({
          'access-control-allow-origin': 'https://launchcheck-cors-probe.example',
          'access-control-allow-credentials': 'true',
        }),
      }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('cors-reflects-with-credentials');
  });
  test('warn when reflecting arbitrary origin without credentials', async () => {
    const r = await corsNotWildcardChecker.run(
      makeLiveContext({
        http: http({ 'access-control-allow-origin': 'https://launchcheck-cors-probe.example' }),
      }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('cors-reflects-origin');
  });
  test('pass when a fixed non-wildcard origin is returned', async () => {
    const r = await corsNotWildcardChecker.run(
      makeLiveContext({ http: http({ 'access-control-allow-origin': 'https://app.example.com' }) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('cors-restricted');
  });
  test('warn when preflight throws', async () => {
    const r = await corsNotWildcardChecker.run(
      makeLiveContext({ http: { fetch: () => Promise.reject(new Error('boom')) } }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('cors-probe-failed');
  });
});
