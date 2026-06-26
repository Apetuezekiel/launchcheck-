import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { HttpClient, HttpResponse } from '../../../types/index.js';
import { type Fixture, startFixture } from '../../orchestrator/__tests__/support/fixture-server.js';
import { crawl, extractLinks } from '../crawl.js';

describe('extractLinks', () => {
  test('resolves relative links, keeps http(s), drops fragments, dedups', () => {
    const html = `
      <a href="/a">a</a>
      <a href="a">dup-of-a-from-root</a>
      <a href="https://ext.test/x">ext</a>
      <a href="#frag">frag</a>
      <a href="mailto:x@y.z">mail</a>
      <a href="/a#section">a-with-hash</a>`;
    const links = extractLinks(html, 'https://site.test/');
    expect(links).toContain('https://site.test/a');
    expect(links).toContain('https://ext.test/x');
    expect(links).not.toContain('mailto:x@y.z');
    // /a, /a#section, and bare "a" all normalize to /a -> one entry
    expect(links.filter((l) => l === 'https://site.test/a')).toHaveLength(1);
    // pure-fragment link resolves to the base page
    expect(links).toContain('https://site.test/');
  });
});

describe('crawl (against a loopback fixture server)', () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await startFixture({
      routes: {
        '/': {
          headers: { 'content-type': 'text/html' },
          body: '<a href="/a">a</a><a href="/b">b</a>',
        },
        '/a': {
          headers: { 'content-type': 'text/html' },
          body: '<a href="/c">c</a><a href="/">home</a>',
        },
        '/b': {
          headers: { 'content-type': 'text/html' },
          body: '<a href="https://external.test/x">ext</a>',
        },
        '/c': { headers: { 'content-type': 'text/html' }, body: 'leaf' },
      },
    });
  });
  afterAll(async () => {
    await fx.close();
  });

  test('discovers same-origin pages breadth-first, seed first', async () => {
    const { DefaultHttpClient } = await import('../../runtime/http-client.js');
    const pages = await crawl(new DefaultHttpClient(), fx.url, { maxPages: 10 });
    expect(pages[0]).toBe(`${fx.url}`.replace(/\/$/, '/')); // seed normalized
    expect(pages.some((p) => p.endsWith('/a'))).toBe(true);
    expect(pages.some((p) => p.endsWith('/b'))).toBe(true);
    expect(pages.some((p) => p.endsWith('/c'))).toBe(true);
    // external origin never crawled
    expect(pages.every((p) => p.startsWith(fx.url.replace(/\/$/, '')))).toBe(true);
  });

  test('maxPages bounds the result', async () => {
    const { DefaultHttpClient } = await import('../../runtime/http-client.js');
    const pages = await crawl(new DefaultHttpClient(), fx.url, { maxPages: 2 });
    expect(pages).toHaveLength(2);
  });
});

describe('crawl fault tolerance', () => {
  test('a page that fails to fetch is still included but yields no links', async () => {
    const http: HttpClient = {
      async fetch(url: string): Promise<HttpResponse> {
        if (url.endsWith('/')) {
          return {
            status: 200,
            body: '<a href="/dead">dead</a>',
            headers: { get: () => 'text/html' },
          } as unknown as HttpResponse;
        }
        throw new Error('boom');
      },
    };
    const pages = await crawl(http, 'https://site.test/', { maxPages: 10 });
    expect(pages).toContain('https://site.test/');
    expect(pages).toContain('https://site.test/dead');
    expect(pages).toHaveLength(2);
  });
});

describe('parseRobotsDisallow', () => {
  test('collects Disallow paths under User-agent: *', async () => {
    const { parseRobotsDisallow } = await import('../crawl.js');
    const robots = [
      'User-agent: badbot',
      'Disallow: /everything',
      '',
      'User-agent: *',
      'Disallow: /admin',
      'Disallow: /private',
      'Allow: /',
      'Disallow:',
    ].join('\n');
    expect(parseRobotsDisallow(robots)).toEqual(['/admin', '/private']);
  });
});

describe('crawl robots.txt obedience', () => {
  function htmlHttp(pages: Record<string, string>): HttpClient {
    return {
      async fetch(url: string) {
        const u = new URL(url);
        const body = pages[u.pathname];
        if (body === undefined) {
          return {
            status: 404,
            body: '',
            headers: { get: () => 'text/plain' },
          } as unknown as HttpResponse;
        }
        const ct = u.pathname === '/robots.txt' ? 'text/plain' : 'text/html';
        return { status: 200, body, headers: { get: () => ct } } as unknown as HttpResponse;
      },
    };
  }

  test('disallowed paths are not crawled', async () => {
    const http = htmlHttp({
      '/robots.txt': 'User-agent: *\nDisallow: /admin',
      '/': '<a href="/ok">ok</a><a href="/admin/secret">no</a>',
      '/ok': 'leaf',
      '/admin/secret': 'secret',
    });
    const pages = await crawl(http, 'https://site.test/', { maxPages: 10 });
    expect(pages).toContain('https://site.test/ok');
    expect(pages).not.toContain('https://site.test/admin/secret');
  });

  test('respectRobots:false ignores robots.txt', async () => {
    const http = htmlHttp({
      '/robots.txt': 'User-agent: *\nDisallow: /admin',
      '/': '<a href="/admin/secret">no</a>',
      '/admin/secret': 'secret',
    });
    const pages = await crawl(http, 'https://site.test/', { maxPages: 10, respectRobots: false });
    expect(pages).toContain('https://site.test/admin/secret');
  });
});
