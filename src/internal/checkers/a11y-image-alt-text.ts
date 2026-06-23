import type { CheckContext, CheckResult, Checker } from '../../types/index.js';
import { liveResult, summarizeAxeViolations, withAxe } from '../runtime/live-checker-support.js';

const IMAGE_RULES = new Set(['image-alt', 'input-image-alt', 'role-img-alt']);

export const a11yImageAltTextChecker: Checker = {
  id: 'a11y-image-alt-text',
  name: 'Image alt text',
  category: 'accessibility',
  mode: 'live',
  consumes: ['axe'],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const outcome = await withAxe(ctx, 'a11y-image-alt-text', 'accessibility', 'major');
    if (outcome.kind === 'done') return outcome.results;
    const { axe } = outcome;
    const violations = axe.violations.filter((v) => IMAGE_RULES.has(v.id));
    if (violations.length === 0) {
      return [
        liveResult(
          'a11y-image-alt-text',
          'accessibility',
          'major',
          'pass',
          'image-alt-ok',
          'All images have alt text.',
        ),
      ];
    }
    return [
      liveResult(
        'a11y-image-alt-text',
        'accessibility',
        'major',
        'fail',
        'image-alt-violations',
        `${violations.length} image alt text violation${violations.length === 1 ? '' : 's'} found.`,
        {
          fix: 'Add descriptive alt attributes to all images; use alt="" for decorative images.',
          detail: summarizeAxeViolations(violations),
        },
      ),
    ];
  },
};
