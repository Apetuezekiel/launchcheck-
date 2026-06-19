import type { Checker } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'meta-description-present';
const CAT = 'seo' as const;
const SEV = 'major' as const;

export const metaDescriptionPresentChecker: Checker = {
  id: ID,
  name: 'Meta description present',
  category: CAT,
  mode: 'live',
  consumes: ['dom'],
  async run(ctx) {
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const tag = got.dom.metaTags.find((m) => m.name?.toLowerCase() === 'description');
    const content = (tag?.content ?? '').trim();
    if (content.length === 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'meta-description-missing',
          '<meta name="description"> is absent or empty.',
          {
            fix: 'Add a meta description of 50–160 characters.',
          },
        ),
      ];
    }
    if (content.length < 50 || content.length > 160) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'meta-description-length',
          `Meta description is ${content.length} chars; recommended 50–160.`,
          {
            fix: 'Adjust the meta description to 50–160 characters.',
          },
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'pass',
        'meta-description-present',
        `Meta description present (${content.length} chars).`,
      ),
    ];
  },
};
