import { describe, expect, test } from 'vitest';
import type { HttpResponse } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { hstsPresentChecker } from '../hsts-present.js';
import { makeLiveContext, unavailableResource } from './live-context.js';

describe('hstsPresentChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('hsts-present');
    expect(hstsPresentChecker.id).toBe(e?.id);
    expect(hstsPresentChecker.category).toBe(e?.category);
    expect(hstsPresentChecker.mode).toBe(e?.mode);
  });
  test('skip when no live context', async () => {
    const ctx = { ...makeLiveContext(), live: null };
    const r = await hstsPresentChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-live-context');
  });
  test('skip when rootResponse unavailable', async () => {
    const ctx = makeLiveContext({ rootResponse: unavailableResource<HttpResponse>('no chrome') });
    const r = await hstsPresentChecker.run(ctx);
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('root-response-unavailable');
  });
  test('fail when header absent', async () => {
    const r = await hstsPresentChecker.run(makeLiveContext({ headers: {} }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('hsts-missing');
    expect(r[0]?.severity).toBe('critical');
  });
  test('warn when max-age below 6 months', async () => {
    const r = await hstsPresentChecker.run(
      makeLiveContext({ headers: { 'strict-transport-security': 'max-age=100' } }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('hsts-low-max-age');
  });
  test('pass when max-age sufficient', async () => {
    const r = await hstsPresentChecker.run(
      makeLiveContext({
        headers: { 'strict-transport-security': 'max-age=31536000; includeSubDomains' },
      }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('hsts-present');
  });
});
