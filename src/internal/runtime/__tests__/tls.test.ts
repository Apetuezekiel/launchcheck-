import { describe, expect, test } from 'vitest';
import type { TlsResult } from '../../../types/index.js';
import { TlsResource } from '../resources/tls.js';

const RESULT: TlsResult = {
  valid: true,
  issuer: "Let's Encrypt",
  subject: 'example.test',
  validFrom: new Date('2026-01-01'),
  validTo: new Date('2026-12-31'),
  daysUntilExpiry: 200,
  protocol: 'TLSv1.3',
  errorReason: null,
};

describe('TlsResource', () => {
  test('returns the inspector result, memoized', async () => {
    let calls = 0;
    const res = new TlsResource('example.test', 443, {
      inspect: async () => {
        calls += 1;
        return RESULT;
      },
    });
    expect(res.isAvailable()).toBe(true);
    expect((await res.get()).issuer).toBe("Let's Encrypt");
    await res.get();
    expect(calls).toBe(1);
  });
});
