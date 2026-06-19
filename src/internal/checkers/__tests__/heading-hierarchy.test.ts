import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { headingHierarchyChecker } from '../heading-hierarchy.js';
import { makeLiveContext } from './live-context.js';

describe('headingHierarchyChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('heading-hierarchy');
    expect(headingHierarchyChecker.id).toBe(e?.id);
    expect(headingHierarchyChecker.mode).toBe(e?.mode);
  });
  test('pass when levels do not skip', async () => {
    const r = await headingHierarchyChecker.run(
      makeLiveContext({ domHtml: '<h1>a</h1><h2>b</h2><h3>c</h3>' }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail on a skipped level', async () => {
    const r = await headingHierarchyChecker.run(
      makeLiveContext({ domHtml: '<h1>a</h1><h3>c</h3>' }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.detail).toContain('h1 → h3');
  });
});
