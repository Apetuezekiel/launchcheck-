import { describe, expect, test } from 'vitest';
import type { AxeResult, AxeViolation } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { a11yAriaValidChecker } from '../a11y-aria-valid.js';
import { makeLiveContext } from './live-context.js';

function v(id: string): AxeViolation {
  return {
    id,
    impact: 'serious',
    description: `Fix ${id}`,
    help: `Ensure ${id} is valid`,
    helpUrl: '',
    nodes: [{ html: '<div>', target: ['div'] }],
  };
}

function axe(violations: AxeViolation[]): AxeResult {
  return { violations, passes: [], incomplete: [], inapplicable: [] };
}

describe('a11yAriaValidChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('a11y-aria-valid');
    expect(a11yAriaValidChecker.id).toBe(e?.id);
    expect(a11yAriaValidChecker.mode).toBe(e?.mode);
    expect(a11yAriaValidChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await a11yAriaValidChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when axe unavailable', async () => {
    const r = await a11yAriaValidChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('axe-unavailable');
  });

  test('pass when no aria violations', async () => {
    const r = await a11yAriaValidChecker.run(makeLiveContext({ axe: axe([v('color-contrast')]) }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('aria-valid');
  });

  test('fail when aria violations present', async () => {
    const r = await a11yAriaValidChecker.run(
      makeLiveContext({ axe: axe([v('aria-required-attr'), v('aria-valid-attr')]) }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('aria-violations');
    expect(r[0]?.detail).toContain('aria-required-attr');
    expect(r[0]?.detail).toContain('aria-valid-attr');
  });
});
