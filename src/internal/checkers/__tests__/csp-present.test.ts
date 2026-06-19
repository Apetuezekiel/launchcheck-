import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { cspPresentChecker } from '../csp-present.js';
import { makeLiveContext } from './live-context.js';

describe('cspPresentChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('csp-present');
    expect(cspPresentChecker.id).toBe(e?.id);
    expect(cspPresentChecker.category).toBe(e?.category);
    expect(cspPresentChecker.mode).toBe(e?.mode);
  });
  test('fail when absent', async () => {
    const r = await cspPresentChecker.run(makeLiveContext({ headers: {} }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('csp-missing');
  });
  test('warn on unsafe-inline without nonce/hash', async () => {
    const r = await cspPresentChecker.run(
      makeLiveContext({
        headers: { 'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'" },
      }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('csp-unsafe');
  });
  test('pass on unsafe-inline mitigated by nonce', async () => {
    const r = await cspPresentChecker.run(
      makeLiveContext({
        headers: { 'content-security-policy': "script-src 'unsafe-inline' 'nonce-abc123'" },
      }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('pass on clean policy', async () => {
    const r = await cspPresentChecker.run(
      makeLiveContext({ headers: { 'content-security-policy': "default-src 'self'" } }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('csp-present');
  });
});
