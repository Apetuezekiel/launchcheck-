import type { CheckContext, CheckResult, Checker } from '../../types/index.js';
import { liveResult, summarizeAxeViolations, withAxe } from '../runtime/live-checker-support.js';

export const a11yTouchTargetsChecker: Checker = {
  id: 'a11y-touch-targets',
  name: 'Touch target size',
  category: 'accessibility',
  mode: 'live',
  consumes: ['axe'],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const outcome = await withAxe(ctx, 'a11y-touch-targets', 'accessibility', 'minor');
    if (outcome.kind === 'done') return outcome.results;
    const { axe } = outcome;
    const violations = axe.violations.filter((v) => v.id === 'target-size');
    if (violations.length === 0) {
      return [
        liveResult(
          'a11y-touch-targets',
          'accessibility',
          'minor',
          'pass',
          'touch-targets-ok',
          'All touch targets meet minimum size requirements.',
        ),
      ];
    }
    return [
      liveResult(
        'a11y-touch-targets',
        'accessibility',
        'minor',
        'fail',
        'touch-target-violations',
        `${violations.length} touch target violation${violations.length === 1 ? '' : 's'} found.`,
        {
          fix: 'Ensure interactive elements are at least 24×24 CSS pixels.',
          detail: summarizeAxeViolations(violations),
        },
      ),
    ];
  },
};
