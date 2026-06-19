import type { Checker } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'canonical-url';
const CAT = 'seo' as const;
const SEV = 'major' as const;

export const canonicalUrlChecker: Checker = {
  id: ID,
  name: 'Canonical URL set',
  category: CAT,
  mode: 'live',
  consumes: ['dom'],
  async run(ctx) {
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const link = got.dom.linkTags.find(
      (l) => (l.rel ?? '').split(/\s+/).includes('canonical') && (l.href ?? '').trim().length > 0,
    );
    if (link === undefined) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'canonical-missing',
          'No <link rel="canonical" href="..."> found.',
          {
            fix: 'Add a <link rel="canonical"> pointing at the page\'s canonical URL.',
          },
        ),
      ];
    }
    return [
      liveResult(ID, CAT, SEV, 'pass', 'canonical-present', `Canonical URL set: ${link.href}.`),
    ];
  },
};
