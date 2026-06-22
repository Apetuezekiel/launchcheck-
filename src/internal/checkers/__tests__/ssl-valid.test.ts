import { describe, expect, test } from 'vitest';
import type { TlsResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { sslValidChecker } from '../ssl-valid.js';
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

describe('sslValidChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('ssl-valid');
    expect(sslValidChecker.id).toBe(e?.id);
    expect(sslValidChecker.mode).toBe(e?.mode);
  });
  test('pass when cert valid', async () => {
    const r = await sslValidChecker.run(makeLiveContext({ tls: base }));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.severity).toBe('critical');
  });
  test('fail when cert invalid', async () => {
    const r = await sslValidChecker.run(
      makeLiveContext({ tls: { ...base, valid: false, errorReason: 'self signed' } }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('ssl-invalid');
  });
  test('skip with no live context', async () => {
    const r = await sslValidChecker.run({ ...makeLiveContext(), live: null });
    expect(r[0]?.status).toBe('skip');
  });

  test('skip when tls is unavailable (e.g. an http URL)', async () => {
    const r = await sslValidChecker.run(makeLiveContext({}));
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('tls-unavailable');
  });
});
