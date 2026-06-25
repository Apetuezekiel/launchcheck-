import { describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import {
  baselineExitCode,
  baselineSummary,
  diffBaseline,
  gatedFindings,
  parseBaseline,
  serializeBaseline,
} from '../baseline.js';

function r(over: Partial<CheckResult>): CheckResult {
  return {
    checkerId: 'c',
    resultId: 'x',
    status: 'fail',
    message: 'm',
    severity: 'major',
    category: 'security',
    ...over,
  };
}

const results: CheckResult[] = [
  r({ checkerId: 'csp-present', resultId: 'csp-missing', status: 'fail', severity: 'major' }),
  r({ checkerId: 'hsts-present', resultId: 'hsts-missing', status: 'fail', severity: 'critical' }),
  r({ checkerId: 'todo-fixme-scan', resultId: 'todo', status: 'warn', severity: 'info' }),
  r({ checkerId: 'ssl-valid', resultId: 'ok', status: 'pass', severity: 'critical' }),
  r({ checkerId: 'ssl-valid', resultId: 'skip', status: 'skip', severity: 'critical' }),
];

describe('baseline pure functions', () => {
  test('gatedFindings = fail + warn only', () => {
    expect(gatedFindings(results).map((x) => x.resultId)).toEqual([
      'csp-missing',
      'hsts-missing',
      'todo',
    ]);
  });
  test('serializeBaseline writes sorted fingerprints of gated findings', () => {
    const doc = JSON.parse(serializeBaseline(results));
    expect(doc.fingerprints).toEqual([
      'csp-present/csp-missing',
      'hsts-present/hsts-missing',
      'todo-fixme-scan/todo',
    ]);
  });
  test('parseBaseline accepts object and bare array; rejects junk', () => {
    expect(parseBaseline('{"fingerprints":["a","b"]}')).toEqual(new Set(['a', 'b']));
    expect(parseBaseline('["a"]')).toEqual(new Set(['a']));
    expect(() => parseBaseline('{"fingerprints":[1]}')).toThrow();
    expect(() => parseBaseline('42')).toThrow();
  });
  test('diffBaseline classifies new / known / fixed', () => {
    const baseline = new Set(['csp-present/csp-missing', 'gone/old']);
    const diff = diffBaseline(results, baseline);
    expect(diff.newFindings.map((x) => x.resultId)).toEqual(['hsts-missing', 'todo']);
    expect(diff.knownCount).toBe(1);
    expect(diff.fixedCount).toBe(1); // 'gone/old' no longer present
  });
  test('baselineExitCode gates on new findings only', () => {
    // all gated findings known -> exit 0 despite a critical fail being present
    const allKnown = new Set([
      'csp-present/csp-missing',
      'hsts-present/hsts-missing',
      'todo-fixme-scan/todo',
    ]);
    expect(baselineExitCode(diffBaseline(results, allKnown))).toBe(0);
    // new critical fail -> 2
    expect(baselineExitCode(diffBaseline(results, new Set()))).toBe(2);
    // new only-major-fail -> 1
    const noHsts = results.filter((x) => x.checkerId !== 'hsts-present');
    expect(baselineExitCode(diffBaseline(noHsts, new Set(['todo-fixme-scan/todo'])))).toBe(1);
    // new warn only -> 0
    const warnOnly = [
      r({ checkerId: 'todo-fixme-scan', resultId: 'todo', status: 'warn', severity: 'info' }),
    ];
    expect(baselineExitCode(diffBaseline(warnOnly, new Set()))).toBe(0);
  });
  test('baselineSummary', () => {
    expect(baselineSummary(diffBaseline(results, new Set(['csp-present/csp-missing'])))).toBe(
      'baseline: 2 new, 1 known, 0 fixed',
    );
  });
});
