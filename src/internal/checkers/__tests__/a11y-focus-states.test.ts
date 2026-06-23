import { describe, expect, test } from 'vitest';
import type { AxeResult, AxeViolation } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { a11yFocusStatesChecker } from '../a11y-focus-states.js';
import { makeLiveContext } from './live-context.js';

function v(id: string): AxeViolation {
  return {
    id,
    impact: 'serious',
    description: `Fix ${id}`,
    help: `Ensure ${id} passes`,
    helpUrl: '',
    nodes: [{ html: '<div>', target: ['div'] }],
  };
}

function axe(violations: AxeViolation[]): AxeResult {
  return { violations, passes: [], incomplete: [], inapplicable: [] };
}

describe('a11yFocusStatesChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('a11y-focus-states');
    expect(a11yFocusStatesChecker.id).toBe(e?.id);
    expect(a11yFocusStatesChecker.mode).toBe(e?.mode);
    expect(a11yFocusStatesChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await a11yFocusStatesChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when axe unavailable', async () => {
    const r = await a11yFocusStatesChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('axe-unavailable');
  });

  test('pass when no focus violations', async () => {
    const r = await a11yFocusStatesChecker.run(
      makeLiveContext({ axe: axe([v('color-contrast')]) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('focus-states-ok');
  });

  test('fail when focus violations present', async () => {
    const r = await a11yFocusStatesChecker.run(
      makeLiveContext({ axe: axe([v('scrollable-region-focusable')]) }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('focus-state-violations');
    expect(r[0]?.detail).toContain('scrollable-region-focusable');
  });
});
