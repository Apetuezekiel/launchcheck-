import type { Checker } from '../../types/index.js';
import { liveResult, readThreshold, withLighthouse } from '../runtime/live-checker-support.js';
const ID = 'lighthouse-accessibility-score';
const CAT = 'performance' as const;
const SEV = 'major' as const;
const THRESHOLD_KEY = 'lighthouse-accessibility';
const DEFAULT_MIN = 90;
export const lighthouseAccessibilityScoreChecker: Checker = {
  id: ID,
  name: 'Accessibility',
  category: CAT,
  mode: 'live',
  consumes: ['lighthouse'],
  async run(ctx) {
    const got = await withLighthouse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const min = readThreshold(ctx, THRESHOLD_KEY, DEFAULT_MIN);
    const score = Math.round(got.lighthouse.categories.accessibility.score * 100);
    if (score >= min) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'accessibility-score-ok',
          `Lighthouse Accessibility score is ${score} (>= ${min}).`,
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'accessibility-score-low',
        `Lighthouse Accessibility score is ${score}, below the ${min} threshold.`,
        {
          fix: 'Address the Lighthouse audit opportunities for this category before launch.',
        },
      ),
    ];
  },
};
