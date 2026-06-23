import { describe, expect, test } from 'vitest';
import type { AxeResult, AxeViolation } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { a11yKeyboardTabOrderChecker } from '../a11y-keyboard-tab-order.js';
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

describe('a11yKeyboardTabOrderChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('a11y-keyboard-tab-order');
    expect(a11yKeyboardTabOrderChecker.id).toBe(e?.id);
    expect(a11yKeyboardTabOrderChecker.mode).toBe(e?.mode);
    expect(a11yKeyboardTabOrderChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await a11yKeyboardTabOrderChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when axe unavailable', async () => {
    const r = await a11yKeyboardTabOrderChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('axe-unavailable');
  });

  test('pass when no keyboard tab order violations', async () => {
    const r = await a11yKeyboardTabOrderChecker.run(
      makeLiveContext({ axe: axe([v('color-contrast')]) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('keyboard-tab-order-ok');
  });

  test('fail when keyboard tab order violations present', async () => {
    const r = await a11yKeyboardTabOrderChecker.run(makeLiveContext({ axe: axe([v('tabindex')]) }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('keyboard-tab-order-violations');
    expect(r[0]?.detail).toContain('tabindex');
  });
});
