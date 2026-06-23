import type { CheckContext, CheckResult, Checker } from '../../types/index.js';
import { liveResult, summarizeAxeViolations, withAxe } from '../runtime/live-checker-support.js';

export const a11yColorContrastChecker: Checker = {
  id: 'a11y-color-contrast',
  name: 'Color contrast',
  category: 'accessibility',
  mode: 'live',
  consumes: ['axe'],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const outcome = await withAxe(ctx, 'a11y-color-contrast', 'accessibility', 'major');
    if (outcome.kind === 'done') return outcome.results;
    const { axe } = outcome;
    const violations = axe.violations.filter((v) => v.id === 'color-contrast');
    if (violations.length === 0) {
      return [
        liveResult(
          'a11y-color-contrast',
          'accessibility',
          'major',
          'pass',
          'color-contrast-ok',
          'No color contrast violations found.',
        ),
      ];
    }
    return [
      liveResult(
        'a11y-color-contrast',
        'accessibility',
        'major',
        'fail',
        'color-contrast-violations',
        `${violations.length} color contrast violation${violations.length === 1 ? '' : 's'} found.`,
        {
          fix: 'Ensure text and background colors meet WCAG AA contrast ratios.',
          detail: summarizeAxeViolations(violations),
        },
      ),
    ];
  },
};
