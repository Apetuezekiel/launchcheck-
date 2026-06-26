import type { Checker } from '../../types/index.js';
import { liveResult, readThreshold, withLighthouse } from '../runtime/live-checker-support.js';
const ID = 'lighthouse-best-practices-score';
const CAT = 'performance' as const;
const SEV = 'major' as const;
const THRESHOLD_KEY = 'lighthouse-best-practices';
const DEFAULT_MIN = 90;
export const lighthouseBestPracticesScoreChecker: Checker = {
  id: ID,
  name: 'Best Practices',
  category: CAT,
  mode: 'live',
  consumes: ['lighthouse'],
  async run(ctx) {
    const got = await withLighthouse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const min = readThreshold(ctx, THRESHOLD_KEY, DEFAULT_MIN);
    const raw = got.lighthouse.categories['best-practices'].score;
    if (raw === null) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'skip',
          'best-practices-score-unavailable',
          'Lighthouse did not report a Best Practices score for this run.',
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
          'best-practices-score-ok',
          `Lighthouse Best Practices score is ${score} (>= ${min}).`,
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'best-practices-score-low',
        `Lighthouse Best Practices score is ${score}, below the ${min} threshold.`,
        {
          fix: 'Address the Lighthouse audit opportunities for this category before launch.',
        },
      ),
    ];
  },
};
