import { describe, expect, test } from 'vitest';
import type { TlsResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { sslNotExpiringChecker } from '../ssl-not-expiring.js';
import { makeLiveContext } from './live-context.js';

const base: TlsResult = {
  valid: true,
  issuer: 'CA',
  subject: 's',
  validFrom: new Date(),
  validTo: new Date(),
  daysUntilExpiry: 90,
  protocol: 'TLSv1.3',
  errorReason: null,
};

describe('sslNotExpiringChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('ssl-not-expiring');
    expect(sslNotExpiringChecker.id).toBe(e?.id);
    expect(sslNotExpiringChecker.mode).toBe(e?.mode);
  });
  test('pass when far from expiry', async () => {
    const r = await sslNotExpiringChecker.run(makeLiveContext({ tls: base }));
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when within default 30-day window', async () => {
    const r = await sslNotExpiringChecker.run(
      makeLiveContext({ tls: { ...base, daysUntilExpiry: 10 } }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('ssl-expiring-soon');
  });
  test('fail when expired', async () => {
    const r = await sslNotExpiringChecker.run(
      makeLiveContext({ tls: { ...base, daysUntilExpiry: -3 } }),
    );
    expect(r[0]?.resultId).toBe('ssl-expired');
  });
  test('respects configured warning threshold', async () => {
    const r = await sslNotExpiringChecker.run(
      makeLiveContext({
        tls: { ...base, daysUntilExpiry: 40 },
        thresholds: { 'ssl-expiry-warning-days': 60 },
      }),
    );
    expect(r[0]?.status).toBe('fail');
  });
});
