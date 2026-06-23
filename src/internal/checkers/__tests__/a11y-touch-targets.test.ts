import { describe, expect, test } from 'vitest';
import type { AxeResult, AxeViolation } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { a11yTouchTargetsChecker } from '../a11y-touch-targets.js';
import { makeLiveContext } from './live-context.js';

function v(id: string): AxeViolation {
  return {
    id,
    impact: 'serious',
    description: `Fix ${id}`,
    help: `Ensure ${id} passes`,
    helpUrl: '',
    nodes: [{ html: '<button>', target: ['button'] }],
  };
}

function axe(violations: AxeViolation[]): AxeResult {
  return { violations, passes: [], incomplete: [], inapplicable: [] };
}

describe('a11yTouchTargetsChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('a11y-touch-targets');
    expect(a11yTouchTargetsChecker.id).toBe(e?.id);
    expect(a11yTouchTargetsChecker.mode).toBe(e?.mode);
    expect(a11yTouchTargetsChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await a11yTouchTargetsChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when axe unavailable', async () => {
    const r = await a11yTouchTargetsChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('axe-unavailable');
  });

  test('pass when no touch target violations', async () => {
    const r = await a11yTouchTargetsChecker.run(
      makeLiveContext({ axe: axe([v('color-contrast')]) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('touch-targets-ok');
  });

  test('fail when touch target violations present', async () => {
    const r = await a11yTouchTargetsChecker.run(makeLiveContext({ axe: axe([v('target-size')]) }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('touch-target-violations');
    expect(r[0]?.detail).toContain('target-size');
  });
});
