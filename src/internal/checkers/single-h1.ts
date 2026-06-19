import type { Checker } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'single-h1';
const CAT = 'seo' as const;
const SEV = 'major' as const;

export const singleH1Checker: Checker = {
  id: ID,
  name: 'Exactly one H1 per page',
  category: CAT,
  mode: 'live',
  consumes: ['dom'],
  async run(ctx) {
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const count = got.dom.querySelectorAll('h1').length;
    if (count === 1) {
      return [liveResult(ID, CAT, SEV, 'pass', 'single-h1', 'Exactly one <h1> present.')];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        count === 0 ? 'h1-missing' : 'h1-multiple',
        `Found ${count} <h1> element(s); expected exactly 1.`,
        {
          fix: 'Use exactly one <h1> per page.',
        },
      ),
    ];
  },
};
