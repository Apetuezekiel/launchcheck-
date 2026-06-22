import type { Checker } from '../../types/index.js';
import { liveResult } from '../runtime/live-checker-support.js';

const ID = 'sitemap-xml-accessible';
const CAT = 'seo' as const;
const SEV = 'major' as const;

export const sitemapXmlAccessibleChecker: Checker = {
  id: ID,
  name: 'sitemap.xml fetchable',
  category: CAT,
  mode: 'live',
  consumes: ['http'],
  async run(ctx) {
    if (ctx.live === null) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'skip',
          'no-live-context',
          'Skipped: no live context (run with --url).',
        ),
      ];
    }
    const target = new URL('/sitemap.xml', ctx.live.url).toString();
    let body: string;
    let status: number;
    try {
      const res = await ctx.live.http.fetch(target);
      body = res.body;
      status = res.status;
    } catch (err) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'sitemap-fetch-failed',
          `Failed to fetch ${target}: ${(err as Error).message}`,
          { fix: 'Ensure /sitemap.xml is reachable.' },
        ),
      ];
    }
    if (status !== 200) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'sitemap-missing',
          `GET /sitemap.xml returned ${status}.`,
          { fix: 'Generate and serve a sitemap.xml at the site root.' },
        ),
      ];
    }
    if (!/^﻿?\s*<(\?xml|urlset|sitemapindex)\b/i.test(body)) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'sitemap-invalid',
          'sitemap.xml does not look like valid XML (no <?xml/<urlset/<sitemapindex root).',
          { fix: 'Serve well-formed sitemap XML.' },
        ),
      ];
    }
    return [liveResult(ID, CAT, SEV, 'pass', 'sitemap-ok', 'sitemap.xml present and well-formed.')];
  },
};
