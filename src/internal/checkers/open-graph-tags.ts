import type { CheckResult, Checker } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'open-graph-tags';
const CAT = 'seo' as const;
const SEV = 'minor' as const;
const REQUIRED = ['og:title', 'og:description', 'og:image'] as const;

export const openGraphTagsChecker: Checker = {
  id: ID,
  name: 'og:title, og:description, og:image present',
  category: CAT,
  mode: 'live',
  consumes: ['dom'],
  async run(ctx) {
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const present = (property: string): boolean =>
      got.dom.metaTags.some((m) => m.property === property && (m.content ?? '').trim().length > 0);
    const missing = REQUIRED.filter((p) => !present(p));
    if (missing.length === 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'open-graph-complete',
          'All Open Graph tags present (og:title, og:description, og:image).',
        ),
      ];
    }
    return missing.map(
      (p): CheckResult =>
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          `missing-${p.replace(':', '-')}`,
          `Missing Open Graph tag: ${p}.`,
          {
            fix: `Add <meta property="${p}" content="...">.`,
          },
        ),
    );
  },
};
