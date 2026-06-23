import type { CheckContext, CheckResult, Checker } from '../../types/index.js';
import { liveResult, summarizeAxeViolations, withAxe } from '../runtime/live-checker-support.js';

const FOCUS_RULES = new Set(['scrollable-region-focusable', 'focus-trap']);

export const a11yFocusStatesChecker: Checker = {
  id: 'a11y-focus-states',
  name: 'Focus state visibility',
  category: 'accessibility',
  mode: 'live',
  consumes: ['axe'],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const outcome = await withAxe(ctx, 'a11y-focus-states', 'accessibility', 'major');
    if (outcome.kind === 'done') return outcome.results;
    const { axe } = outcome;
    const violations = axe.violations.filter((v) => FOCUS_RULES.has(v.id));
    if (violations.length === 0) {
      return [
        liveResult(
          'a11y-focus-states',
          'accessibility',
          'major',
          'pass',
          'focus-states-ok',
          'No focus state violations found.',
        ),
      ];
    }
    return [
      liveResult(
        'a11y-focus-states',
        'accessibility',
        'major',
        'fail',
        'focus-state-violations',
        `${violations.length} focus state violation${violations.length === 1 ? '' : 's'} found.`,
        {
          fix: 'Ensure interactive elements have visible focus indicators and focus is not trapped.',
          detail: summarizeAxeViolations(violations),
        },
      ),
    ];
  },
};
