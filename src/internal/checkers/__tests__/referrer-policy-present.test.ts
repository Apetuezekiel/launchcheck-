import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { referrerPolicyPresentChecker } from '../referrer-policy-present.js';
import { makeLiveContext } from './live-context.js';

describe('referrerPolicyPresentChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('referrer-policy-present');
    expect(referrerPolicyPresentChecker.id).toBe(e?.id);
    expect(referrerPolicyPresentChecker.mode).toBe(e?.mode);
  });
  test('pass when present', async () => {
    const r = await referrerPolicyPresentChecker.run(
      makeLiveContext({ headers: { 'referrer-policy': 'strict-origin-when-cross-origin' } }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when absent', async () => {
    const r = await referrerPolicyPresentChecker.run(makeLiveContext({ headers: {} }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.severity).toBe('minor');
  });
});
