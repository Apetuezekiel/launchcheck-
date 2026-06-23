import type { CheckContext, CheckResult, Checker } from '../../types/index.js';
import { liveResult, summarizeAxeViolations, withAxe } from '../runtime/live-checker-support.js';

export const a11yAriaValidChecker: Checker = {
  id: 'a11y-aria-valid',
  name: 'ARIA attribute validity',
  category: 'accessibility',
  mode: 'live',
  consumes: ['axe'],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const outcome = await withAxe(ctx, 'a11y-aria-valid', 'accessibility', 'major');
    if (outcome.kind === 'done') return outcome.results;
    const { axe } = outcome;
    const violations = axe.violations.filter((v) => v.id.startsWith('aria-'));
    if (violations.length === 0) {
      return [
        liveResult(
          'a11y-aria-valid',
          'accessibility',
          'major',
          'pass',
          'aria-valid',
          'No ARIA attribute violations found.',
        ),
      ];
    }
    return [
      liveResult(
        'a11y-aria-valid',
        'accessibility',
        'major',
        'fail',
        'aria-violations',
        `${violations.length} ARIA violation${violations.length === 1 ? '' : 's'} found.`,
        {
          fix: 'Fix the ARIA attribute violations listed in the detail.',
          detail: summarizeAxeViolations(violations),
        },
      ),
    ];
  },
};
