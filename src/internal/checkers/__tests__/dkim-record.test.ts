import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { dkimRecordChecker } from '../dkim-record.js';
import { makeLiveContext } from './live-context.js';

describe('dkimRecordChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('dkim-record');
    expect(dkimRecordChecker.id).toBe(e?.id);
    expect(dkimRecordChecker.mode).toBe(e?.mode);
  });
  test('skip when enabled but no selectors', async () => {
    const r = await dkimRecordChecker.run(
      makeLiveContext({ checkerOptions: { 'email-auth': { enabled: true } } }),
    );
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-dkim-selectors');
  });
  test('pass when all selectors resolve', async () => {
    const r = await dkimRecordChecker.run(
      makeLiveContext({
        checkerOptions: { 'email-auth': { enabled: true, dkimSelectors: ['s1', 's2'] } },
        dns: { dkim: () => Promise.resolve('v=DKIM1; p=AAA') },
      }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when a selector is missing', async () => {
    const r = await dkimRecordChecker.run(
      makeLiveContext({
        checkerOptions: { 'email-auth': { enabled: true, dkimSelectors: ['s1', 'gone'] } },
        dns: { dkim: (_h, s) => Promise.resolve(s === 's1' ? 'v=DKIM1; p=AAA' : null) },
      }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.detail).toContain('gone._domainkey');
  });
});
