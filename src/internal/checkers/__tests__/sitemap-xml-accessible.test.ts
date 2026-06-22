import { describe, expect, test } from 'vitest';
import type { HttpClient } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { sitemapXmlAccessibleChecker } from '../sitemap-xml-accessible.js';
import { makeHttpResponse, makeLiveContext } from './live-context.js';

const http = (status: number, body: string): HttpClient => ({
  fetch: (url) => Promise.resolve(makeHttpResponse({}, { url, status, body })),
});

describe('sitemapXmlAccessibleChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('sitemap-xml-accessible');
    expect(sitemapXmlAccessibleChecker.id).toBe(e?.id);
    expect(sitemapXmlAccessibleChecker.mode).toBe(e?.mode);
  });
  test('pass when 200 and XML', async () => {
    const r = await sitemapXmlAccessibleChecker.run(
      makeLiveContext({ http: http(200, '<?xml version="1.0"?><urlset></urlset>') }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when 404', async () => {
    const r = await sitemapXmlAccessibleChecker.run(makeLiveContext({ http: http(404, '') }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('sitemap-missing');
  });
  test('fail when 200 but not XML', async () => {
    const r = await sitemapXmlAccessibleChecker.run(
      makeLiveContext({ http: http(200, '<html>nope</html>') }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('sitemap-invalid');
  });
});
