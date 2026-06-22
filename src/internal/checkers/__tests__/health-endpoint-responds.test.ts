import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { healthEndpointRespondsChecker } from '../health-endpoint-responds.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

// Maps a pathname to a status; throws when the status is null (unreachable).
const http = (byPath: Record<string, number | null>): HttpClient => ({
  fetch: (url) => {
    const path = new URL(url).pathname;
    const status = byPath[path];
    if (status === null || status === undefined) {
      return Promise.reject(new Error(`unreachable: ${path}`));
    }
    return Promise.resolve(makeHttpResponse({}, { url, status }));
  },
});

describe('healthEndpointRespondsChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('health-endpoint-responds');
    expect(healthEndpointRespondsChecker.id).toBe(e?.id);
    expect(healthEndpointRespondsChecker.mode).toBe(e?.mode);
    expect(healthEndpointRespondsChecker.category).toBe(e?.category);
  });
  test('skips when no live context', async () => {
    const ctx = makeLiveContext();
    const noLive = { ...ctx, mode: 'static' as const, live: null };
    const r = await healthEndpointRespondsChecker.run(noLive);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });
  test('pass when a default path returns 2xx', async () => {
    const r = await healthEndpointRespondsChecker.run(
      makeLiveContext({ http: http({ '/health': 200, '/healthz': 404, '/api/health': 404 }) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('health-ok');
  });
  test('warn when all paths 404', async () => {
    const r = await healthEndpointRespondsChecker.run(
      makeLiveContext({ http: http({ '/health': 404, '/healthz': 404, '/api/health': 404 }) }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('health-not-found');
  });
  test('fail when a path returns 5xx and none 2xx', async () => {
    const r = await healthEndpointRespondsChecker.run(
      makeLiveContext({ http: http({ '/health': 503, '/healthz': 404, '/api/health': 404 }) }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('health-unhealthy');
  });
  test('fail when all unreachable', async () => {
    const r = await healthEndpointRespondsChecker.run(
      makeLiveContext({ http: http({ '/health': null, '/healthz': null, '/api/health': null }) }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('health-unhealthy');
  });
  test('honors custom paths option', async () => {
    const r = await healthEndpointRespondsChecker.run(
      makeLiveContext({
        http: http({ '/status': 200 }),
        checkerOptions: { 'health-endpoint': { paths: ['/status'] } },
      }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('health-ok');
  });
});
