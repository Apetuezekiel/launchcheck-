import type { Checker } from '../../types/index.js';
import { liveResult, readThreshold, withLighthouse } from '../runtime/live-checker-support.js';
const ID = 'core-web-vital-lcp';
const CAT = 'performance' as const;
const SEV = 'major' as const;
const THRESHOLD_KEY = 'lcp';
const DEFAULT_MS = 2500;
export const coreWebVitalLcpChecker: Checker = {
  id: ID,
  name: 'LCP < threshold',
  category: CAT,
  mode: 'live',
  consumes: ['lighthouse'],
  async run(ctx) {
    const got = await withLighthouse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const max = readThreshold(ctx, THRESHOLD_KEY, DEFAULT_MS);
    const value = Math.round(got.lighthouse.audits['largest-contentful-paint'].numericValue);
    if (value <= max) {
      return [liveResult(ID, CAT, SEV, 'pass', 'lcp-ok', `LCP is ${value}ms (<= ${max}ms).`)];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'lcp-slow',
        `LCP is ${value}ms, above the ${max}ms threshold.`,
        {
          fix: 'Optimize the largest contentful element (image/text) load time.',
        },
      ),
    ];
  },
};
