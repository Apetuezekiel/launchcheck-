import { describe, expect, test } from 'vitest';
import type { HttpClient, HttpResponse } from '../../../types/index.js';
import { collectSitemapUrls, isSitemapIndex, parseSitemapLocs } from '../sitemap.js';

function fakeHttp(pages: Record<string, string>): HttpClient {
  return {
    async fetch(url: string): Promise<HttpResponse> {
      const body = pages[url];
      if (body === undefined) throw new Error(`no fake for ${url}`);
      return { body } as unknown as HttpResponse;
    },
  };
}

const URLSET = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://site.test/</loc></url>
  <url><loc>https://site.test/about?a=1&amp;b=2</loc></url>
  <url><loc>https://other.test/x</loc></url>
  <url><loc>ftp://site.test/skip</loc></url>
</urlset>`;

describe('sitemap parsing', () => {
  test('parseSitemapLocs extracts and entity-decodes <loc> values', () => {
    expect(parseSitemapLocs(URLSET)).toEqual([
      'https://site.test/',
      'https://site.test/about?a=1&b=2',
      'https://other.test/x',
      'ftp://site.test/skip',
    ]);
  });
  test('isSitemapIndex distinguishes index from urlset', () => {
    expect(isSitemapIndex(URLSET)).toBe(false);
    expect(isSitemapIndex('<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>')).toBe(
      true,
    );
  });
});

describe('collectSitemapUrls', () => {
  test('returns http(s) locs, drops non-http, dedups, caps', async () => {
    const http = fakeHttp({ 'https://site.test/sitemap.xml': URLSET });
    const urls = await collectSitemapUrls(http, 'https://site.test/sitemap.xml', { maxUrls: 2 });
    expect(urls).toEqual(['https://site.test/', 'https://site.test/about?a=1&b=2']);
  });
  test('same-origin filter keeps only the seed origin', async () => {
    const http = fakeHttp({ 'https://site.test/sitemap.xml': URLSET });
    const urls = await collectSitemapUrls(http, 'https://site.test/sitemap.xml', {
      sameOrigin: 'https://site.test',
    });
    expect(urls).toEqual(['https://site.test/', 'https://site.test/about?a=1&b=2']);
  });
  test('follows a sitemap index one level deep', async () => {
    const index =
      '<sitemapindex><sitemap><loc>https://site.test/sm1.xml</loc></sitemap><sitemap><loc>https://site.test/sm2.xml</loc></sitemap></sitemapindex>';
    const http = fakeHttp({
      'https://site.test/sitemap.xml': index,
      'https://site.test/sm1.xml': '<urlset><url><loc>https://site.test/a</loc></url></urlset>',
      'https://site.test/sm2.xml': '<urlset><url><loc>https://site.test/b</loc></url></urlset>',
    });
    const urls = await collectSitemapUrls(http, 'https://site.test/sitemap.xml');
    expect(urls).toEqual(['https://site.test/a', 'https://site.test/b']);
  });
  test('a broken child sitemap is skipped, not fatal', async () => {
    const index =
      '<sitemapindex><sitemap><loc>https://site.test/sm1.xml</loc></sitemap><sitemap><loc>https://site.test/broken.xml</loc></sitemap></sitemapindex>';
    const http = fakeHttp({
      'https://site.test/sitemap.xml': index,
      'https://site.test/sm1.xml': '<urlset><url><loc>https://site.test/a</loc></url></urlset>',
    });
    const urls = await collectSitemapUrls(http, 'https://site.test/sitemap.xml');
    expect(urls).toEqual(['https://site.test/a']);
  });
});
