import { describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import { fingerprint } from '../fingerprint.js';

function r(over: Partial<CheckResult>): CheckResult {
  return {
    checkerId: 'csp-present',
    resultId: 'csp-missing',
    status: 'fail',
    message: 'CSP absent',
    severity: 'major',
    category: 'security',
    ...over,
  };
}

describe('fingerprint', () => {
  test('checkerId/resultId when no location', () => {
    expect(fingerprint(r({}))).toBe('csp-present/csp-missing');
  });
  test('includes file:line when located', () => {
    expect(fingerprint(r({ location: { file: 'src/a.ts', line: 12 } }))).toBe(
      'csp-present/csp-missing@src/a.ts:12',
    );
  });
  test('line defaults to 0 when absent', () => {
    expect(fingerprint(r({ location: { file: 'src/a.ts' } }))).toBe(
      'csp-present/csp-missing@src/a.ts:0',
    );
  });
  test('includes url when present; same finding on different URLs stays distinct', () => {
    expect(fingerprint(r({ url: 'https://a.test/' }))).toBe(
      'csp-present/csp-missing@https://a.test/',
    );
    expect(fingerprint(r({ url: 'https://a.test/' }))).not.toBe(
      fingerprint(r({ url: 'https://b.test/' })),
    );
  });
  test('url and location compose', () => {
    expect(fingerprint(r({ url: 'https://a.test/', location: { file: 'x.ts', line: 3 } }))).toBe(
      'csp-present/csp-missing@https://a.test/@x.ts:3',
    );
  });
  test('deterministic and distinct per resultId', () => {
    expect(fingerprint(r({}))).toBe(fingerprint(r({})));
    expect(fingerprint(r({ resultId: 'csp-weak' }))).not.toBe(fingerprint(r({})));
  });
});
