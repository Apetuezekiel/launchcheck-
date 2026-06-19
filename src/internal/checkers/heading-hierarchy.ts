import type { Checker } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'heading-hierarchy';
const CAT = 'seo' as const;
const SEV = 'minor' as const;

export const headingHierarchyChecker: Checker = {
  id: ID,
  name: 'No skipped heading levels',
  category: CAT,
  mode: 'live',
  consumes: ['dom'],
  async run(ctx) {
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const levels = got.dom
      .querySelectorAll('h1, h2, h3, h4, h5, h6')
      .map((el) => Number(el.tagName.slice(1)))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
    const jumps: string[] = [];
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1] ?? 0;
      const cur = levels[i] ?? 0;
      if (cur - prev > 1) {
        jumps.push(`h${prev} → h${cur}`);
      }
    }
    if (jumps.length === 0) {
      return [
        liveResult(ID, CAT, SEV, 'pass', 'heading-hierarchy-ok', 'Heading levels do not skip.'),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'heading-hierarchy-skips',
        `${jumps.length} skipped heading level(s).`,
        {
          detail: jumps.join('\n'),
          fix: 'Do not skip heading levels (e.g. an h2 should not be followed by an h4).',
        },
      ),
    ];
  },
};
