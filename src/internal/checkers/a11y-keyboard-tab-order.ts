import type { CheckContext, CheckResult, Checker } from '../../types/index.js';
import { liveResult, summarizeAxeViolations, withAxe } from '../runtime/live-checker-support.js';

const KEYBOARD_RULES = new Set(['tabindex', 'keyboard']);

export const a11yKeyboardTabOrderChecker: Checker = {
  id: 'a11y-keyboard-tab-order',
  name: 'Keyboard tab order',
  category: 'accessibility',
  mode: 'live',
  consumes: ['axe'],
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const outcome = await withAxe(ctx, 'a11y-keyboard-tab-order', 'accessibility', 'major');
    if (outcome.kind === 'done') return outcome.results;
    const { axe } = outcome;
    const violations = axe.violations.filter((v) => KEYBOARD_RULES.has(v.id));
    if (violations.length === 0) {
      return [
        liveResult(
          'a11y-keyboard-tab-order',
          'accessibility',
          'major',
          'pass',
          'keyboard-tab-order-ok',
          'No keyboard tab order violations found.',
        ),
      ];
    }
    return [
      liveResult(
        'a11y-keyboard-tab-order',
        'accessibility',
        'major',
        'fail',
        'keyboard-tab-order-violations',
        `${violations.length} keyboard tab order violation${violations.length === 1 ? '' : 's'} found.`,
        {
          fix: 'Remove positive tabindex values and ensure all interactive elements are keyboard-accessible.',
          detail: summarizeAxeViolations(violations),
        },
      ),
    ];
  },
};
