import type { Checker } from '../../types/index.js';
import { liveResult, readThreshold, withLighthouse } from '../runtime/live-checker-support.js';
const ID = 'core-web-vital-inp';
const CAT = 'performance' as const;
const SEV = 'major' as const;
const THRESHOLD_KEY = 'inp';
const DEFAULT_MS = 200;
export const coreWebVitalInpChecker: Checker = {
  id: ID,
  name: 'INP < threshold',
  category: CAT,
  mode: 'live',
  consumes: ['lighthouse'],
  async run(ctx) {
    const got = await withLighthouse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const max = readThreshold(ctx, THRESHOLD_KEY, DEFAULT_MS);
    const value = Math.round(got.lighthouse.audits['interaction-to-next-paint']?.numericValue ?? 0);
    if (value <= max) {
      return [liveResult(ID, CAT, SEV, 'pass', 'inp-ok', `INP is ${value}ms (<= ${max}ms).`)];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'inp-slow',
        `INP is ${value}ms, above the ${max}ms threshold.`,
        {
          fix: 'Reduce JavaScript execution time and break up long tasks to improve interaction responsiveness.',
        },
      ),
    ];
  },
};
