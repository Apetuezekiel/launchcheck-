import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { permissionsPolicyPresentChecker } from '../permissions-policy-present.js';
import { makeLiveContext } from './live-context.js';

describe('permissionsPolicyPresentChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('permissions-policy-present');
    expect(permissionsPolicyPresentChecker.id).toBe(e?.id);
    expect(permissionsPolicyPresentChecker.mode).toBe(e?.mode);
  });
  test('pass when present', async () => {
    const r = await permissionsPolicyPresentChecker.run(
      makeLiveContext({ headers: { 'permissions-policy': 'geolocation=()' } }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when absent', async () => {
    const r = await permissionsPolicyPresentChecker.run(makeLiveContext({ headers: {} }));
    expect(r[0]?.status).toBe('fail');
  });
});
