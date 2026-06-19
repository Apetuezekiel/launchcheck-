import type { Checker } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'structured-data';
const CAT = 'seo' as const;
const SEV = 'minor' as const;

export const structuredDataChecker: Checker = {
  id: ID,
  name: 'JSON-LD structured data present',
  category: CAT,
  mode: 'live',
  consumes: ['dom'],
  async run(ctx) {
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    if (got.dom.jsonLd.length > 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'structured-data-present',
          `${got.dom.jsonLd.length} JSON-LD block(s) present.`,
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'structured-data-missing',
        'No parseable <script type="application/ld+json"> block found.',
        {
          fix: 'Add JSON-LD structured data describing the page.',
        },
      ),
    ];
  },
};
