import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import type { CheckContext, CheckResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import {
  type HistoryFile,
  type LargeFilesInGitHistoryDeps,
  largeFilesInGitHistoryChecker,
  runLargeFilesInGitHistory,
} from '../large-files-in-git-history.js';
import { makeProjectContext, makeStaticContext } from './context.js';

const ROOT = path.join(os.tmpdir(), 'launchcheck-large-files-fixture');
const MB = 1024 * 1024;

function deps(impl: LargeFilesInGitHistoryDeps['listHistoryFiles']): LargeFilesInGitHistoryDeps {
  return { listHistoryFiles: impl };
}

const FAIL_IF_CALLED: LargeFilesInGitHistoryDeps = {
  listHistoryFiles: async () => {
    throw new Error('listHistoryFiles should not have been called');
  },
};

/** Builds a context with overridable gitRoot, projectDir, and thresholds. */
function makeCtx(opts: {
  gitRoot?: string | null;
  projectDir?: string;
  thresholds?: Record<string, number>;
  signal?: AbortSignal;
}): CheckContext {
  const projectDir = opts.projectDir ?? ROOT;
  const project = {
    ...makeProjectContext(projectDir),
    gitRoot: opts.gitRoot === undefined ? ROOT : opts.gitRoot,
  };
  const base = makeStaticContext(project, opts.signal);
  return { ...base, config: { ...base.config, thresholds: opts.thresholds ?? {} } };
}

/** Deps that return a fixed history list. */
function history(files: HistoryFile[]): LargeFilesInGitHistoryDeps {
  return deps(async () => files);
}

describe('largeFilesInGitHistoryChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('large-files-in-git-history');
    expect(entry).toBeDefined();
    expect(largeFilesInGitHistoryChecker.id).toBe(entry?.id);
    expect(largeFilesInGitHistoryChecker.name).toBe(entry?.name);
    expect(largeFilesInGitHistoryChecker.category).toBe(entry?.category);
    expect(largeFilesInGitHistoryChecker.mode).toBe(entry?.mode);
  });

  test('returns a single skip result when ctx.project is null', async () => {
    const base = makeCtx({});
    const ctx = { ...base, project: null };
    const results = await runLargeFilesInGitHistory(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-project-context');
  });

  test('returns a single skip result when ctx.signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const ctx = makeCtx({ signal: ac.signal });
    const results = await runLargeFilesInGitHistory(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('aborted');
  });

  test('skip with resultId "no-git" when gitRoot is null', async () => {
    const ctx = makeCtx({ gitRoot: null });
    const results = await runLargeFilesInGitHistory(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-git');
  });

  test('pass "no-large-files" when nothing exceeds the default threshold', async () => {
    const ctx = makeCtx({});
    const results = await runLargeFilesInGitHistory(
      ctx,
      history([
        { path: 'src/a.ts', bytes: 1000 },
        { path: 'src/b.ts', bytes: 4 * MB },
      ]),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('no-large-files');
  });

  test('fail "large-files-found" when a file exceeds the default threshold; message count and fix set', async () => {
    const ctx = makeCtx({});
    const results = await runLargeFilesInGitHistory(
      ctx,
      history([{ path: 'assets/video.mp4', bytes: 6 * MB }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('large-files-found');
    expect(results[0]?.message).toContain('1 file(s)');
    expect(results[0]?.detail).toContain('assets/video.mp4');
    expect((results[0]?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('respects a configured large-file-bytes threshold (low threshold flags a small file)', async () => {
    const ctx = makeCtx({ thresholds: { 'large-file-bytes': 500 } });
    const results = await runLargeFilesInGitHistory(
      ctx,
      history([{ path: 'src/a.ts', bytes: 1000 }]),
    );
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('large-files-found');
  });

  test('respects a configured large-file-bytes threshold (high threshold passes a multi-MB file)', async () => {
    const ctx = makeCtx({ thresholds: { 'large-file-bytes': 10 * MB } });
    const results = await runLargeFilesInGitHistory(
      ctx,
      history([{ path: 'assets/video.mp4', bytes: 6 * MB }]),
    );
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('no-large-files');
  });

  test('a non-positive configured threshold falls back to the default', async () => {
    const ctx = makeCtx({ thresholds: { 'large-file-bytes': 0 } });
    const results = await runLargeFilesInGitHistory(
      ctx,
      history([{ path: 'src/a.ts', bytes: 1000 }]),
    );
    // 1000 bytes is under the 5 MiB default, so a fallback-to-default yields pass.
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('no-large-files');
  });

  test('filters to files under projectDir in a monorepo (gitRoot above projectDir)', async () => {
    const gitRoot = ROOT;
    const projectDir = path.join(ROOT, 'packages', 'app');
    const ctx = makeCtx({ gitRoot, projectDir });
    const results = await runLargeFilesInGitHistory(
      ctx,
      history([
        { path: 'packages/app/big.bin', bytes: 9 * MB },
        { path: 'packages/other/big.bin', bytes: 9 * MB },
        { path: 'tooling/big.bin', bytes: 9 * MB },
      ]),
    );
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.message).toContain('1 file(s)');
    expect(results[0]?.detail).toContain('packages/app/big.bin');
    expect(results[0]?.detail).not.toContain('packages/other/big.bin');
    expect(results[0]?.detail).not.toContain('tooling/big.bin');
  });

  test('dedups by path, keeping the largest historical blob size', async () => {
    const ctx = makeCtx({});
    const results = await runLargeFilesInGitHistory(
      ctx,
      history([
        { path: 'data.bin', bytes: 6 * MB },
        { path: 'data.bin', bytes: 12 * MB },
      ]),
    );
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.message).toContain('1 file(s)');
    expect(results[0]?.detail).toContain('12.0 MB');
    expect(results[0]?.detail).not.toContain('6.0 MB');
  });

  test('detail is sorted by size descending', async () => {
    const ctx = makeCtx({});
    const results = await runLargeFilesInGitHistory(
      ctx,
      history([
        { path: 'mid.bin', bytes: 8 * MB },
        { path: 'big.bin', bytes: 20 * MB },
        { path: 'small.bin', bytes: 6 * MB },
      ]),
    );
    const detail = results[0]?.detail ?? '';
    const lines = detail.split('\n');
    expect(lines[0]).toContain('big.bin');
    expect(lines[1]).toContain('mid.bin');
    expect(lines[2]).toContain('small.bin');
  });

  test('detail truncates at MAX_DETAIL_LINES with "... and N more"', async () => {
    const ctx = makeCtx({});
    const files = Array.from({ length: 25 }, (_, i) => ({
      path: `f${String(i).padStart(2, '0')}.bin`,
      bytes: (100 - i) * MB,
    }));
    const results = await runLargeFilesInGitHistory(ctx, history(files));
    const detail = results[0]?.detail ?? '';
    expect(detail.split('\n').filter((l) => l.startsWith('f')).length).toBe(20);
    expect(detail).toContain('... and 5 more');
    expect(results[0]?.message).toContain('25 file(s)');
  });

  test('fail "git-runtime-error" when listHistoryFiles throws', async () => {
    const ctx = makeCtx({});
    const results = await runLargeFilesInGitHistory(
      ctx,
      deps(async () => {
        throw new Error('ENOENT: git not found');
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('git-runtime-error');
    expect(results[0]?.message).toContain('ENOENT');
  });

  test('all results carry checkerId "large-files-in-git-history" and category "code-quality"', async () => {
    const ctx = makeCtx({});
    const results = await runLargeFilesInGitHistory(
      ctx,
      history([{ path: 'src/a.ts', bytes: 10 }]),
    );
    for (const r of results as CheckResult[]) {
      expect(r.checkerId).toBe('large-files-in-git-history');
      expect(r.category).toBe('code-quality');
    }
  });
});
