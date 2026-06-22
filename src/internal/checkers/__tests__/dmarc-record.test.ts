import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { dmarcRecordChecker } from '../dmarc-record.js';
import { makeLiveContext } from './live-context.js';

const enabled = { 'email-auth': { enabled: true } };

describe('dmarcRecordChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('dmarc-record');
    expect(dmarcRecordChecker.id).toBe(e?.id);
    expect(dmarcRecordChecker.mode).toBe(e?.mode);
  });
  test('pass when DMARC present', async () => {
    const r = await dmarcRecordChecker.run(
      makeLiveContext({
        checkerOptions: enabled,
        dns: { dmarc: () => Promise.resolve('v=DMARC1; p=none') },
      }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when DMARC absent', async () => {
    const r = await dmarcRecordChecker.run(
      makeLiveContext({ checkerOptions: enabled, dns: { dmarc: () => Promise.resolve(null) } }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.severity).toBe('minor');
  });
});
