import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { clickjackingProtectionChecker } from '../clickjacking-protection.js';
import { makeLiveContext } from './live-context.js';

describe('clickjackingProtectionChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('clickjacking-protection');
    expect(clickjackingProtectionChecker.id).toBe(e?.id);
    expect(clickjackingProtectionChecker.mode).toBe(e?.mode);
  });
  test('pass via X-Frame-Options', async () => {
    const r = await clickjackingProtectionChecker.run(
      makeLiveContext({ headers: { 'x-frame-options': 'DENY' } }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('pass via CSP frame-ancestors', async () => {
    const r = await clickjackingProtectionChecker.run(
      makeLiveContext({ headers: { 'content-security-policy': "frame-ancestors 'none'" } }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when neither present', async () => {
    const r = await clickjackingProtectionChecker.run(makeLiveContext({ headers: {} }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('clickjacking-unprotected');
  });
});
