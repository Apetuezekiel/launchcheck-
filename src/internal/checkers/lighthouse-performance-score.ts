import type { Checker } from '../../types/index.js';
import { liveResult, readThreshold, withLighthouse } from '../runtime/live-checker-support.js';
const ID = 'lighthouse-performance-score';
const CAT = 'performance' as const;
const SEV = 'major' as const;
const THRESHOLD_KEY = 'lighthouse-performance';
const DEFAULT_MIN = 90;
export const lighthousePerformanceScoreChecker: Checker = {
  id: ID,
  name: 'Performance',
  category: CAT,
  mode: 'live',
  consumes: ['lighthouse'],
  async run(ctx) {
    const got = await withLighthouse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const min = readThreshold(ctx, THRESHOLD_KEY, DEFAULT_MIN);
    const raw = got.lighthouse.categories.performance.score;
    if (raw === null) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'skip',
          'performance-score-unavailable',
          'Lighthouse did not report a Performance score for this run.',
        ),
      ];
    }
    const score = Math.round(raw * 100);
    if (score >= min) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'performance-score-ok',
          `Lighthouse Performance score is ${score} (>= ${min}).`,
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'performance-score-low',
        `Lighthouse Performance score is ${score}, below the ${min} threshold.`,
        {
          fix: 'Address the Lighthouse audit opportunities for this category before launch.',
        },
      ),
    ];
  },
};
