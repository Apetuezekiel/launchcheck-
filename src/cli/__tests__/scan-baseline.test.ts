import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Checker } from '../../types/index.js';
import { runScan } from '../commands/scan.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-baseline-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

// Stub checker with a registry-valid id (console-log-scan: code-quality/static).
function failChecker(resultId: string): Checker {
  return {
    id: 'console-log-scan',
    name: 'stub',
    category: 'code-quality',
    mode: 'static',
    run: async () => [
      {
        checkerId: 'console-log-scan',
        resultId,
        status: 'fail',
        message: 'boom',
        severity: 'critical',
        category: 'code-quality',
      },
    ],
  };
}

describe('runScan baseline gate', () => {
  test('--update-baseline writes fingerprints and exits 0', async () => {
    const res = await runScan({
      projectDir: dir,
      checkers: [failChecker('a')],
      updateBaseline: true,
    });
    expect(res.exitCode).toBe(0);
    const doc = JSON.parse(await fs.readFile(path.join(dir, '.launchcheck-baseline.json'), 'utf8'));
    expect(doc.fingerprints).toEqual(['console-log-scan/a']);
  });

  test('a known finding is gated to exit 0; without a baseline it is 2', async () => {
    await runScan({ projectDir: dir, checkers: [failChecker('a')], updateBaseline: true });
    const gated = await runScan({
      projectDir: dir,
      checkers: [failChecker('a')],
      baseline: '.launchcheck-baseline.json',
    });
    expect(gated.exitCode).toBe(0);
    expect(gated.stdout).toContain('baseline: 0 new, 1 known');
    const ungated = await runScan({ projectDir: dir, checkers: [failChecker('a')] });
    expect(ungated.exitCode).toBe(2);
  });

  test('a new finding fails the gate', async () => {
    await runScan({ projectDir: dir, checkers: [failChecker('a')], updateBaseline: true });
    const res = await runScan({
      projectDir: dir,
      checkers: [failChecker('b')],
      baseline: '.launchcheck-baseline.json',
    });
    expect(res.exitCode).toBe(2);
    expect(res.stdout).toContain('baseline: 1 new');
  });

  test('a missing baseline file is a usage error (exit 2)', async () => {
    const res = await runScan({
      projectDir: dir,
      checkers: [failChecker('a')],
      baseline: 'does-not-exist.json',
    });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('not found');
  });
});
