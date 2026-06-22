import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { robotsTxtAccessibleChecker } from '../robots-txt-accessible.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

const http = (status: number, body: string): HttpClient => ({
  fetch: (url) => Promise.resolve(makeHttpResponse({}, { url, status, body })),
});

describe('robotsTxtAccessibleChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('robots-txt-accessible');
    expect(robotsTxtAccessibleChecker.id).toBe(e?.id);
    expect(robotsTxtAccessibleChecker.mode).toBe(e?.mode);
  });
  test('pass when 200 and not blocking', async () => {
    const r = await robotsTxtAccessibleChecker.run(
      makeLiveContext({ http: http(200, 'User-agent: *\nDisallow: /admin') }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('warn when Disallow: /', async () => {
    const r = await robotsTxtAccessibleChecker.run(
      makeLiveContext({ http: http(200, 'User-agent: *\nDisallow: /') }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('robots-blocking');
  });
  test('fail when 404', async () => {
    const r = await robotsTxtAccessibleChecker.run(makeLiveContext({ http: http(404, '') }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('robots-missing');
  });
});
