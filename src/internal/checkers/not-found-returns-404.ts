import type { Checker } from '../../types/index.js';
import { liveResult } from '../runtime/live-checker-support.js';

const ID = 'not-found-returns-404';
const CAT = 'deployment' as const;
const SEV = 'minor' as const;
const PROBE_PATH = '/__launchcheck-404-probe';

export const notFoundReturns404Checker: Checker = {
  id: ID,
  name: 'Unknown path returns HTTP 404',
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
    const target = new URL(PROBE_PATH, ctx.live.url).toString();
    let status: number;
    try {
      const res = await ctx.live.http.fetch(target);
      status = res.status;
    } catch (err) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'probe-fetch-failed',
          `Failed to fetch ${target}: ${(err as Error).message}`,
          { fix: 'Ensure the host is reachable.' },
        ),
      ];
    }
    if (status === 404) {
      return [
        liveResult(ID, CAT, SEV, 'pass', 'returns-404', 'Unknown path correctly returns HTTP 404.'),
      ];
    }
    if (status === 200) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'soft-404',
          'Unknown path returns HTTP 200 (soft 404); error pages should return a real 404 status.',
          { fix: 'Return HTTP 404 for unmatched routes instead of a 200 error page.' },
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'warn',
        'unexpected-status',
        `Unknown path returned HTTP ${status}, not 404.`,
        { fix: 'Return HTTP 404 for unmatched routes.' },
      ),
    ];
  },
};
