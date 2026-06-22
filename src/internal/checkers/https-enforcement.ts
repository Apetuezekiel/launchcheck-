import type { Checker } from '../../types/index.js';
import { liveResult, withRootResponse } from '../runtime/live-checker-support.js';

const ID = 'https-enforcement';
const CAT = 'security' as const;
const SEV = 'critical' as const;

export const httpsEnforcementChecker: Checker = {
  id: ID,
  name: 'HTTP redirects to HTTPS',
  category: CAT,
  mode: 'live',
  consumes: ['rootResponse', 'http'],
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
    const live = ctx.live;
    // Resolve rootResponse first: reuses the shared root-reachability preamble so
    // we never judge redirect behaviour on a host that is itself down.
    const got = await withRootResponse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const httpUrl = new URL(live.url);
    httpUrl.protocol = 'http:';
    if (httpUrl.port === '443') {
      httpUrl.port = '';
    }
    const target = httpUrl.toString();
    let finalUrl: string;
    let status: number;
    try {
      const res = await live.http.fetch(target, { method: 'GET', followRedirects: true });
      finalUrl = res.url;
      status = res.status;
    } catch (err) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'http-unreachable',
          `${target} could not be reached (${(err as Error).message}); cannot confirm an HTTP→HTTPS redirect.`,
          { fix: 'Serve a 301 redirect from http:// to https://, or close port 80.' },
        ),
      ];
    }
    if (finalUrl.startsWith('https:')) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'redirects-to-https',
          `HTTP request redirected to ${finalUrl}.`,
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'no-https-redirect',
        `${target} did not redirect to HTTPS (final URL ${finalUrl}, status ${status}).`,
        { fix: 'Configure a 301 redirect from http:// to the https:// origin.' },
      ),
    ];
  },
};
