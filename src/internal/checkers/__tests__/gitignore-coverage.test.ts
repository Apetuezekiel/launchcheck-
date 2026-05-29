import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { gitignoreCoverageChecker } from '../gitignore-coverage.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-gitignore-coverage-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function writeGitignore(content: string): Promise<void> {
  await fs.writeFile(path.join(root, '.gitignore'), content);
}

async function runChecker(signal?: AbortSignal): Promise<CheckResult[]> {
  const ctx = makeStaticContext(makeProjectContext(root), signal);
  return gitignoreCoverageChecker.run(ctx);
}

/**
 * Joins lines with LF and a trailing newline. Tests that need CRLF or BOM
 * build their content explicitly without this helper.
 */
function gi(lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

/** Lines that cover all six categories — drop-in for a clean baseline. */
const FULL_COVERAGE: ReadonlyArray<string> = [
  'node_modules',
  '.env*',
  'dist',
  'build',
  '.DS_Store',
  '.vscode',
];

/** Coverage for every category EXCEPT the one named — used to isolate a single missing slug. */
function coverAllExcept(omit: string): string[] {
  const slugByLine: ReadonlyArray<readonly [string, string]> = [
    ['node-modules', 'node_modules'],
    ['env-files', '.env*'],
    ['dist', 'dist'],
    ['build-output', 'build'],
    ['ds-store', '.DS_Store'],
    ['ide-configs', '.vscode'],
  ];
  return slugByLine.filter(([slug]) => slug !== omit).map(([, line]) => line);
}

describe('gitignoreCoverageChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('gitignore-coverage');
    expect(entry).toBeDefined();
    expect(gitignoreCoverageChecker.id).toBe(entry?.id);
    expect(gitignoreCoverageChecker.name).toBe(entry?.name);
    expect(gitignoreCoverageChecker.category).toBe(entry?.category);
    expect(gitignoreCoverageChecker.mode).toBe(entry?.mode);
  });

  test('absent .gitignore emits exactly one warn result with resultId "no-gitignore-file"', async () => {
    const results = await runChecker();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('warn');
    expect(results[0]?.resultId).toBe('no-gitignore-file');
    expect(typeof results[0]?.fix).toBe('string');
    expect((results[0]?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('full coverage emits exactly one pass result with resultId "all-categories-covered"', async () => {
    await writeGitignore(gi([...FULL_COVERAGE]));
    const results = await runChecker();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('all-categories-covered');
  });

  test('empty .gitignore emits 6 fail results, one per category', async () => {
    await writeGitignore('');
    const results = await runChecker();
    expect(results).toHaveLength(6);
    expect(results.every((r) => r.status === 'fail')).toBe(true);
    const ids = results.map((r) => r.resultId).sort();
    expect(ids).toEqual(
      [
        'missing-build-output',
        'missing-dist',
        'missing-ds-store',
        'missing-env-files',
        'missing-ide-configs',
        'missing-node-modules',
      ].sort(),
    );
  });

  test('partial coverage emits one fail per missing category (no false pass)', async () => {
    // Cover only node_modules and .env*; expect 4 fails for the rest.
    await writeGitignore(gi(['node_modules', '.env*']));
    const results = await runChecker();
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.status === 'fail')).toBe(true);
    const ids = results.map((r) => r.resultId).sort();
    expect(ids).toEqual(
      ['missing-build-output', 'missing-dist', 'missing-ds-store', 'missing-ide-configs'].sort(),
    );
  });

  test('all results carry checkerId "gitignore-coverage" and category "code-quality"', async () => {
    await writeGitignore('');
    const results = await runChecker();
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.checkerId).toBe('gitignore-coverage');
      expect(r.category).toBe('code-quality');
    }
  });

  test('all fail results carry a non-empty fix', async () => {
    await writeGitignore('');
    const results = await runChecker();
    for (const r of results) {
      if (r.status === 'fail') {
        expect(typeof r.fix).toBe('string');
        expect((r.fix ?? '').length).toBeGreaterThan(0);
      }
    }
  });

  test('recognizes node_modules variants: "node_modules", "node_modules/", "/node_modules", "**/node_modules", "**/node_modules/"', async () => {
    const variants = [
      'node_modules',
      'node_modules/',
      '/node_modules',
      '**/node_modules',
      '**/node_modules/',
    ];
    for (const variant of variants) {
      await writeGitignore(gi([variant, ...coverAllExcept('node-modules')]));
      const results = await runChecker();
      expect(results).toHaveLength(1);
      expect(results[0]?.resultId).toBe('all-categories-covered');
    }
  });

  test('recognizes env variants: ".env", ".env*", ".env.local", ".env.production"', async () => {
    const variants = ['.env', '.env*', '.env.local', '.env.production'];
    for (const variant of variants) {
      await writeGitignore(gi([variant, ...coverAllExcept('env-files')]));
      const results = await runChecker();
      expect(results).toHaveLength(1);
      expect(results[0]?.resultId).toBe('all-categories-covered');
    }
  });

  test('recognizes dist variants', async () => {
    const variants = ['dist', 'dist/', '/dist', '**/dist', '**/dist/'];
    for (const variant of variants) {
      await writeGitignore(gi([variant, ...coverAllExcept('dist')]));
      const results = await runChecker();
      expect(results).toHaveLength(1);
      expect(results[0]?.resultId).toBe('all-categories-covered');
    }
  });

  test('recognizes both "build" and "out" as build-output coverage', async () => {
    for (const variant of ['build', 'out']) {
      await writeGitignore(gi([variant, ...coverAllExcept('build-output')]));
      const results = await runChecker();
      expect(results).toHaveLength(1);
      expect(results[0]?.resultId).toBe('all-categories-covered');
    }
  });

  test('recognizes .DS_Store variants: ".DS_Store", "**/.DS_Store"', async () => {
    for (const variant of ['.DS_Store', '**/.DS_Store']) {
      await writeGitignore(gi([variant, ...coverAllExcept('ds-store')]));
      const results = await runChecker();
      expect(results).toHaveLength(1);
      expect(results[0]?.resultId).toBe('all-categories-covered');
    }
  });

  test('recognizes any single IDE config: ".vscode" alone, or ".idea" alone, or "*.iml" alone, or ".vs" alone', async () => {
    for (const variant of ['.vscode', '.idea', '*.iml', '.vs']) {
      await writeGitignore(gi([variant, ...coverAllExcept('ide-configs')]));
      const results = await runChecker();
      expect(results).toHaveLength(1);
      expect(results[0]?.resultId).toBe('all-categories-covered');
    }
  });

  test('ignores comment lines (e.g. "# node_modules" does NOT cover node-modules)', async () => {
    await writeGitignore(gi(['# node_modules', ...coverAllExcept('node-modules')]));
    const results = await runChecker();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('missing-node-modules');
  });

  test('ignores negation lines (e.g. "!node_modules" does NOT cover node-modules)', async () => {
    await writeGitignore(gi(['!node_modules', ...coverAllExcept('node-modules')]));
    const results = await runChecker();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('missing-node-modules');
  });

  test('strips a UTF-8 BOM at the start of .gitignore', async () => {
    const BOM = '﻿';
    await writeGitignore(BOM + gi([...FULL_COVERAGE]));
    const results = await runChecker();
    expect(results).toHaveLength(1);
    expect(results[0]?.resultId).toBe('all-categories-covered');
  });

  test('handles CRLF line endings the same as LF', async () => {
    await writeGitignore(`${FULL_COVERAGE.join('\r\n')}\r\n`);
    const results = await runChecker();
    expect(results).toHaveLength(1);
    expect(results[0]?.resultId).toBe('all-categories-covered');
  });

  test('returns a single skip result when ctx.project is null', async () => {
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await gitignoreCoverageChecker.run({ ...ctx, project: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-project-context');
  });

  test('returns a single skip result when ctx.signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const results = await runChecker(ac.signal);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('aborted');
  });
});
