import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { runScan } from '../commands/scan.js';

async function makeProject(content: { [relPath: string]: string }): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-scan-'));
  for (const [rel, body] of Object.entries(content)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body, 'utf8');
  }
  return dir;
}

const created: string[] = [];

async function project(content: { [relPath: string]: string }): Promise<string> {
  const dir = await makeProject(content);
  created.push(dir);
  return dir;
}

afterEach(async () => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe('runScan', () => {
  test('exit 0 on a clean project (no source files have console.* or debugger)', async () => {
    const dir = await project({ 'src/clean.ts': 'export const x = 1;\n' });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('exit 1 on a project containing a console.log (console-log-scan fails)', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('FAIL');
    expect(result.stderr).toBe('');
  });

  test('exit 2 + non-empty stderr on a .launchcheckrc with invalid JSON', async () => {
    const dir = await project({
      'src/clean.ts': 'export const x = 1;\n',
      '.launchcheckrc': '{ not valid json',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stderr).toContain('Failed to parse');
  });

  test('exit 2 + non-empty stderr on a .launchcheckrc with a shape-invalid field', async () => {
    const dir = await project({
      'src/clean.ts': 'export const x = 1;\n',
      '.launchcheckrc': JSON.stringify({ checkers: { 'console-log-scan': 'yes' } }),
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stderr).toContain('must be a boolean');
  });

  test('.launchcheckrc disabling console-log-scan suppresses the fail (exit 0)', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
      '.launchcheckrc': JSON.stringify({ checkers: { 'console-log-scan': false } }),
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('FAIL');
  });

  test('.launchcheckrc ignore patterns prevent matching files from being scanned', async () => {
    const dir = await project({
      'lib/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
      '.launchcheckrc': JSON.stringify({ ignore: ['lib/**'] }),
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(0);
  });

  test('color: false produces stdout free of ANSI escape sequences', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
    });
    const result = await runScan({ projectDir: dir, color: false });
    expect(result.stdout).not.toContain('\x1b[');
  });

  test('color: true wraps FAIL with the red ANSI sequence on a dirty project', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
    });
    const result = await runScan({ projectDir: dir, color: true });
    expect(result.stdout).toContain('\x1b[');
    expect(result.stdout).toContain('\x1b[31mFAIL\x1b[0m');
  });

  test('stdout always includes "Summary:" on a successful run', async () => {
    const dir = await project({ 'src/clean.ts': 'export const x = 1;\n' });
    const result = await runScan({ projectDir: dir });
    expect(result.stdout).toContain('Summary:');
  });

  test('options.projectDir is honored (uses the supplied path, not cwd)', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('src/dirty.ts');
  });

  test('multi-emit: gitignore-coverage emits N fail results through the full scan pipeline', async () => {
    // gitignore-coverage emits one result per missing required-pattern
    // category. A .gitignore that only covers node_modules leaves
    // multiple categories uncovered — exercising the multi-emit
    // pipeline through the full CLI (orchestrator + terminal reporter).
    const dir = await project({
      'src/clean.ts': 'export const x = 1;\n',
      '.gitignore': 'node_modules\n',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(1);
    const failCount = (result.stdout.match(/FAIL/g) ?? []).length;
    expect(failCount).toBeGreaterThan(1);
    // Each missing category has a stable resultId of the form `missing-<id>`.
    expect(result.stdout).toMatch(/missing-/);
  });

  test('exit 2 when a critical-severity fail flows through the full scan pipeline', async () => {
    // No currently-implemented static checker can emit a critical-fail
    // on demand, so we route a synthetic critical fail through the
    // test-only checkers seam. validateCheckerRegistration accepts the
    // stub because secret-scan exists in the registry with the same
    // category/mode/maxSeverity. Once a real checker can emit critical,
    // rewrite this test against it.
    const dir = await project({ 'src/clean.ts': 'export const x = 1;\n' });
    const result = await runScan({
      projectDir: dir,
      checkers: [
        {
          id: 'secret-scan',
          name: 'secret-scan',
          category: 'security',
          mode: 'static',
          run: async () => [
            {
              checkerId: 'secret-scan',
              resultId: 'simulated-leak',
              status: 'fail',
              severity: 'critical',
              category: 'security',
              message: 'simulated critical fail',
              fix: 'remove the secret',
            },
          ],
        },
      ],
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('FAIL');
    expect(result.stdout).toContain('secret-scan/simulated-leak');
  });

  test('non-git project is still scanned end-to-end (records absence of git preflight)', async () => {
    // Documents current behavior: launchcheck does not yet implement a
    // `__preflight__/git-available` check. A non-git project is scanned
    // normally with no preflight skip. When git preflight ships, this
    // test must be updated to assert the preflight-result emission.
    const dir = await project({ 'src/clean.ts': 'export const x = 1;\n' });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(0);
    // No preflight result names leak into the output.
    expect(result.stdout).not.toContain('git-available');
    expect(result.stdout).not.toContain('__preflight__');
  });
});
