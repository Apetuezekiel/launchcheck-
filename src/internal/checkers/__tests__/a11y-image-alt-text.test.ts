import { describe, expect, test } from 'vitest';
import type { AxeResult, AxeViolation } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { a11yImageAltTextChecker } from '../a11y-image-alt-text.js';
import { makeLiveContext } from './live-context.js';

function v(id: string): AxeViolation {
  return {
    id,
    impact: 'critical',
    description: `Fix ${id}`,
    help: `Ensure ${id} passes`,
    helpUrl: '',
    nodes: [{ html: '<img>', target: ['img'] }],
  };
}

function axe(violations: AxeViolation[]): AxeResult {
  return { violations, passes: [], incomplete: [], inapplicable: [] };
}

describe('a11yImageAltTextChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('a11y-image-alt-text');
    expect(a11yImageAltTextChecker.id).toBe(e?.id);
    expect(a11yImageAltTextChecker.mode).toBe(e?.mode);
    expect(a11yImageAltTextChecker.category).toBe(e?.category);
  });

  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await a11yImageAltTextChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });

  test('skip when axe unavailable', async () => {
    const r = await a11yImageAltTextChecker.run(makeLiveContext());
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('axe-unavailable');
  });

  test('pass when all images have alt text', async () => {
    const r = await a11yImageAltTextChecker.run(
      makeLiveContext({ axe: axe([v('color-contrast')]) }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('image-alt-ok');
  });

  test('fail when image alt text violations present', async () => {
    const r = await a11yImageAltTextChecker.run(
      makeLiveContext({ axe: axe([v('image-alt'), v('input-image-alt')]) }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('image-alt-violations');
    expect(r[0]?.detail).toContain('image-alt');
  });
});
