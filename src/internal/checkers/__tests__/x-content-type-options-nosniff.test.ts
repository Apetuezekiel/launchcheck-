import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { xContentTypeOptionsNosniffChecker } from '../x-content-type-options-nosniff.js';
import { makeLiveContext } from './live-context.js';

describe('xContentTypeOptionsNosniffChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('x-content-type-options-nosniff');
    expect(xContentTypeOptionsNosniffChecker.id).toBe(e?.id);
    expect(xContentTypeOptionsNosniffChecker.mode).toBe(e?.mode);
  });
  test('pass when nosniff', async () => {
    const r = await xContentTypeOptionsNosniffChecker.run(
      makeLiveContext({ headers: { 'x-content-type-options': 'nosniff' } }),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('nosniff-present');
  });
  test('fail when absent', async () => {
    const r = await xContentTypeOptionsNosniffChecker.run(makeLiveContext({ headers: {} }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('nosniff-missing');
  });
  test('fail when wrong value', async () => {
    const r = await xContentTypeOptionsNosniffChecker.run(
      makeLiveContext({ headers: { 'x-content-type-options': 'sniff' } }),
    );
    expect(r[0]?.status).toBe('fail');
  });
});
