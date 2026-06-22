import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { httpsEnforcementChecker } from '../https-enforcement.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

const http = (finalUrl: string, status: number): HttpClient => ({
  fetch: () => Promise.resolve(makeHttpResponse({}, { url: finalUrl, status })),
});

describe('httpsEnforcementChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('https-enforcement');
    expect(httpsEnforcementChecker.id).toBe(e?.id);
    expect(httpsEnforcementChecker.mode).toBe(e?.mode);
    expect(httpsEnforcementChecker.category).toBe(e?.category);
  });
  test('skips when no live context', async () => {
    const ctx = makeLiveContext();
    const noLive = { ...ctx, mode: 'static' as const, live: null };
    const r = await httpsEnforcementChecker.run(noLive);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });
  test('pass when http redirects to https', async () => {
    const r = await httpsEnforcementChecker.run(
      makeLiveContext({ http: http('https://example.test/', 200) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('redirects-to-https');
  });
  test('fail when http does not redirect', async () => {
    const r = await httpsEnforcementChecker.run(
      makeLiveContext({ http: http('http://example.test/', 200) }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('no-https-redirect');
  });
  test('warn when http unreachable', async () => {
    const r = await httpsEnforcementChecker.run(
      makeLiveContext({ http: { fetch: () => Promise.reject(new Error('ECONNREFUSED')) } }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('http-unreachable');
  });
  test('fails through rootResponse preamble when root fetch fails', async () => {
    const failingRoot = {
      isAvailable: () => true,
      unavailableReason: () => null,
      get: () => Promise.reject(new Error('root down')),
      wasComputed: () => false,
      dependencies: () => [],
    };
    const r = await httpsEnforcementChecker.run(makeLiveContext({ rootResponse: failingRoot }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('fetch-failed');
  });
});
