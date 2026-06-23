import { describe, expect, test } from 'vitest';
import type { AxeResult, AxeViolation } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { a11yColorContrastChecker } from '../a11y-color-contrast.js';
import { makeLiveContext } from './live-context.js';

function v(id: string): AxeViolation {
  return {
    id,
    impact: 'serious',
    description: `Fix ${id}`,
    help: `Ensure ${id} passes`,
    helpUrl: '',
    nodes: [{ html: '<p>', target: ['p'] }],
  };
}

function axe(violations: AxeViolation[]): AxeResult {
  return { violations, passes: [], incomplete: [], inapplicable: [] };
}

describe('a11yColorContrastChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('a11y-color-contrast');
    expect(a11yColorContrastChecker.id).toBe(e?.id);
    expect(a11yColorContrastChecker.mode).toBe(e?.mode);
    expect(a11yColorContrastChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await a11yColorContrastChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when axe unavailable', async () => {
    const r = await a11yColorContrastChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('axe-unavailable');
  });

  test('pass when no color-contrast violations', async () => {
    const r = await a11yColorContrastChecker.run(
      makeLiveContext({ axe: axe([v('aria-required-attr')]) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('color-contrast-ok');
  });

  test('fail when color-contrast violations present', async () => {
    const r = await a11yColorContrastChecker.run(
      makeLiveContext({ axe: axe([v('color-contrast')]) }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('color-contrast-violations');
    expect(r[0]?.detail).toContain('color-contrast');
  });
});
