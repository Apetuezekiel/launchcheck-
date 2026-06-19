import type { Checker } from '../../types/index.js';
import { liveResult } from '../runtime/live-checker-support.js';

const ID = 'robots-txt-accessible';
const CAT = 'seo' as const;
const SEV = 'major' as const;

export const robotsTxtAccessibleChecker: Checker = {
  id: ID,
  name: 'robots.txt fetchable and not blocking production',
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
    const target = new URL('/robots.txt', ctx.live.url).toString();
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
          'robots-fetch-failed',
          `Failed to fetch ${target}: ${(err as Error).message}`,
          { fix: 'Ensure /robots.txt is reachable.' },
        ),
      ];
    }
    if (status !== 200) {
      return [
        liveResult(ID, CAT, SEV, 'fail', 'robots-missing', `GET /robots.txt returned ${status}.`, {
          fix: 'Serve a robots.txt at the site root.',
        }),
      ];
    }
    if (/^\s*disallow:\s*\/\s*$/im.test(body)) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'robots-blocking',
          'robots.txt contains `Disallow: /` — blocks all crawlers.',
          { fix: 'Remove the blanket `Disallow: /` before launch.' },
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'pass',
        'robots-ok',
        'robots.txt present and not blocking all crawlers.',
      ),
    ];
  },
};
