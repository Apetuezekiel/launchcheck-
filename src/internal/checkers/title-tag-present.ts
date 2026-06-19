import type { Checker } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'title-tag-present';
const CAT = 'seo' as const;
const SEV = 'major' as const;

export const titleTagPresentChecker: Checker = {
  id: ID,
  name: 'Unique title tag present',
  category: CAT,
  mode: 'live',
  consumes: ['dom'],
  async run(ctx) {
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const title = (got.dom.title ?? '').trim();
    if (title.length === 0) {
      return [
        liveResult(ID, CAT, SEV, 'fail', 'title-missing', '<title> is absent or empty.', {
          fix: 'Add a non-empty <title>.',
        }),
      ];
    }
    if (title.length < 10 || title.length > 60) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'title-length',
          `<title> is ${title.length} chars; recommended 10–60.`,
          {
            fix: 'Adjust the title to 10–60 characters.',
          },
        ),
      ];
    }
    return [
      liveResult(ID, CAT, SEV, 'pass', 'title-present', `<title> present (${title.length} chars).`),
    ];
  },
};
