import type { CheckResult, Checker } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'twitter-card-tags';
const CAT = 'seo' as const;
const SEV = 'minor' as const;

export const twitterCardTagsChecker: Checker = {
  id: ID,
  name: 'Twitter Card tags present',
  category: CAT,
  mode: 'live',
  consumes: ['dom'],
  async run(ctx) {
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const has = (name: string): boolean =>
      got.dom.metaTags.some((m) => m.name === name && (m.content ?? '').trim().length > 0);
    const results: CheckResult[] = [];
    if (!has('twitter:card')) {
      results.push(
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'missing-twitter-card',
          'Missing <meta name="twitter:card">.',
          {
            fix: 'Add <meta name="twitter:card" content="summary">.',
          },
        ),
      );
    }
    if (!has('twitter:title') && !has('twitter:description')) {
      results.push(
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'missing-twitter-title-or-description',
          'Missing both twitter:title and twitter:description (need at least one).',
          {
            fix: 'Add a twitter:title or twitter:description meta tag.',
          },
        ),
      );
    }
    if (results.length === 0) {
      return [
        liveResult(ID, CAT, SEV, 'pass', 'twitter-card-complete', 'Twitter Card tags present.'),
      ];
    }
    return results;
  },
};
