import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { spfRecordChecker } from '../spf-record.js';
import { makeLiveContext } from './live-context.js';

const enabled = { 'email-auth': { enabled: true } };

describe('spfRecordChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('spf-record');
    expect(spfRecordChecker.id).toBe(e?.id);
    expect(spfRecordChecker.mode).toBe(e?.mode);
  });
  test('skip when email-auth disabled', async () => {
    const r = await spfRecordChecker.run(makeLiveContext({}));
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('email-auth-disabled');
  });
  test('pass when SPF present', async () => {
    const r = await spfRecordChecker.run(
      makeLiveContext({
        checkerOptions: enabled,
        dns: { spf: () => Promise.resolve('v=spf1 ~all') },
      }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when SPF absent', async () => {
    const r = await spfRecordChecker.run(
      makeLiveContext({ checkerOptions: enabled, dns: { spf: () => Promise.resolve(null) } }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('spf-missing');
  });
});
