import type { Checker } from '../../types/index.js';
import { liveResult, readThreshold, withLighthouse } from '../runtime/live-checker-support.js';
const ID = 'core-web-vital-cls';
const CAT = 'performance' as const;
const SEV = 'major' as const;
const THRESHOLD_KEY = 'cls';
const DEFAULT_SCORE = 0.1;
export const coreWebVitalClsChecker: Checker = {
  id: ID,
  name: 'CLS < threshold',
  category: CAT,
  mode: 'live',
  consumes: ['lighthouse'],
  async run(ctx) {
    const got = await withLighthouse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const max = readThreshold(ctx, THRESHOLD_KEY, DEFAULT_SCORE);
    const value = got.lighthouse.audits['cumulative-layout-shift'].numericValue;
    if (value <= max) {
      return [liveResult(ID, CAT, SEV, 'pass', 'cls-ok', `CLS is ${value} (<= ${max}).`)];
    }
    return [
      liveResult(ID, CAT, SEV, 'fail', 'cls-high', `CLS is ${value}, above the ${max} threshold.`, {
        fix: 'Avoid layout shifts caused by late-loading images, fonts, or dynamic content.',
      }),
    ];
  },
};
