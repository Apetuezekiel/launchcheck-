import { describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import { computeExitCode } from '../exit-code.js';

function makeResult(
  overrides: Partial<CheckResult> & { checkerId: string; resultId: string },
): CheckResult {
  return {
    status: 'pass',
    message: 'ok',
    severity: 'minor',
    category: 'code-quality',
    ...overrides,
  };
}

describe('computeExitCode', () => {
  test('empty results returns 0', () => {
    expect(computeExitCode([])).toBe(0);
  });

  test('only pass returns 0', () => {
    expect(
      computeExitCode([
        makeResult({ checkerId: 'a', resultId: '1', status: 'pass' }),
        makeResult({ checkerId: 'b', resultId: '2', status: 'pass' }),
      ]),
    ).toBe(0);
  });

  test('only warn returns 0', () => {
    expect(computeExitCode([makeResult({ checkerId: 'a', resultId: '1', status: 'warn' })])).toBe(
      0,
    );
  });

  test('only skip returns 0', () => {
    expect(computeExitCode([makeResult({ checkerId: 'a', resultId: '1', status: 'skip' })])).toBe(
      0,
    );
  });

  test('single fail at severity "minor" returns 1', () => {
    expect(
      computeExitCode([
        makeResult({ checkerId: 'a', resultId: '1', status: 'fail', severity: 'minor' }),
      ]),
    ).toBe(1);
  });

  test('single fail at severity "major" returns 1', () => {
    expect(
      computeExitCode([
        makeResult({ checkerId: 'a', resultId: '1', status: 'fail', severity: 'major' }),
      ]),
    ).toBe(1);
  });

  test('single fail at severity "info" returns 1', () => {
    expect(
      computeExitCode([
        makeResult({ checkerId: 'a', resultId: '1', status: 'fail', severity: 'info' }),
      ]),
    ).toBe(1);
  });

  test('single fail at severity "critical" returns 2', () => {
    expect(
      computeExitCode([
        makeResult({ checkerId: 'a', resultId: '1', status: 'fail', severity: 'critical' }),
      ]),
    ).toBe(2);
  });

  test('mixed fails with no critical returns 1', () => {
    expect(
      computeExitCode([
        makeResult({ checkerId: 'a', resultId: '1', status: 'pass' }),
        makeResult({ checkerId: 'b', resultId: '2', status: 'fail', severity: 'minor' }),
        makeResult({ checkerId: 'c', resultId: '3', status: 'fail', severity: 'major' }),
        makeResult({ checkerId: 'd', resultId: '4', status: 'warn' }),
      ]),
    ).toBe(1);
  });

  test('mixed fails including a critical returns 2 (critical dominates)', () => {
    expect(
      computeExitCode([
        makeResult({ checkerId: 'a', resultId: '1', status: 'pass' }),
        makeResult({ checkerId: 'b', resultId: '2', status: 'fail', severity: 'minor' }),
        makeResult({ checkerId: 'c', resultId: '3', status: 'fail', severity: 'critical' }),
      ]),
    ).toBe(2);
  });
});
