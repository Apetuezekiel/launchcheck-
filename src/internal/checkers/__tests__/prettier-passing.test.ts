import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { CheckResult, PackageJson, ProjectContext } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import {
  type PrettierPassingDeps,
  prettierPassingChecker,
  runPrettierPassing,
} from '../prettier-passing.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-prettier-passing-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

function deps(impl: PrettierPassingDeps['runPrettier']): PrettierPassingDeps {
  return { runPrettier: impl };
}

/** Wraps makeProjectContext but lets the test override fields like packageJson. */
function projectWithPackageJson(pkg: PackageJson): ProjectContext {
  return { ...makeProjectContext(root), packageJson: pkg };
}

/** A deps stub that fails the test if invoked — guards "no subprocess" expectations. */
const FAIL_IF_CALLED: PrettierPassingDeps = {
  runPrettier: async () => {
    throw new Error('runPrettier should not have been called');
  },
};

/** A clean run: exit 0, success message on stdout, empty stderr. */
const CLEAN: Awaited<ReturnType<PrettierPassingDeps['runPrettier']>> = {
  stdout: 'All matched files use Prettier code style!\n',
  stderr: '',
  exitCode: 0,
};

describe('prettierPassingChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('prettier-passing');
    expect(entry).toBeDefined();
    expect(prettierPassingChecker.id).toBe(entry?.id);
    expect(prettierPassingChecker.name).toBe(entry?.name);
    expect(prettierPassingChecker.category).toBe(entry?.category);
    expect(prettierPassingChecker.mode).toBe(entry?.mode);
  });

  test('returns a single skip result when ctx.project is null', async () => {
    const baseCtx = makeStaticContext(makeProjectContext(root));
    const ctx = { ...baseCtx, project: null };
    const results = await runPrettierPassing(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-project-context');
  });

  test('returns a single skip result when ctx.signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const ctx = makeStaticContext(makeProjectContext(root), ac.signal);
    const results = await runPrettierPassing(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('aborted');
  });

  test('skip with resultId "no-config-found" when no .prettierrc*, no prettier.config.*, and no package.json prettier field', async () => {
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-config-found');
  });

  test('detects .prettierrc.json and runs the subprocess', async () => {
    await write('.prettierrc.json', '{}');
    let called = false;
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(
      ctx,
      deps(async () => {
        called = true;
        return CLEAN;
      }),
    );
    expect(called).toBe(true);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('prettier-formatted');
  });

  test('detects extensionless .prettierrc and runs the subprocess', async () => {
    await write('.prettierrc', '{}');
    let called = false;
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(
      ctx,
      deps(async () => {
        called = true;
        return CLEAN;
      }),
    );
    expect(called).toBe(true);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('prettier-formatted');
  });

  test('detects prettier.config.js and runs the subprocess', async () => {
    await write('prettier.config.js', 'export default {};');
    let called = false;
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(
      ctx,
      deps(async () => {
        called = true;
        return CLEAN;
      }),
    );
    expect(called).toBe(true);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('prettier-formatted');
  });

  test('detects .prettierrc.toml and runs the subprocess', async () => {
    await write('.prettierrc.toml', 'semi = true\n');
    let called = false;
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(
      ctx,
      deps(async () => {
        called = true;
        return CLEAN;
      }),
    );
    expect(called).toBe(true);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('prettier-formatted');
  });

  test('detects prettier field in package.json and runs the subprocess', async () => {
    let called = false;
    const ctx = makeStaticContext(
      projectWithPackageJson({ name: 'fx', prettier: {} } as PackageJson),
    );
    const results = await runPrettierPassing(
      ctx,
      deps(async () => {
        called = true;
        return CLEAN;
      }),
    );
    expect(called).toBe(true);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('prettier-formatted');
  });

  test('pass "prettier-formatted" when exit code 0 regardless of stderr noise', async () => {
    await write('.prettierrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(
      ctx,
      deps(async () => ({ stdout: '', stderr: 'npm WARN something', exitCode: 0 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('prettier-formatted');
  });

  test('fail "prettier-unformatted" when exit code 1; message has the file count and fix is set', async () => {
    await write('.prettierrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const stderr = [
      '[warn] src/a.ts',
      '[warn] src/b.ts',
      '[warn] Code style issues found in 2 files. Run Prettier with --write to fix.',
    ].join('\n');
    const results = await runPrettierPassing(
      ctx,
      deps(async () => ({ stdout: '', stderr, exitCode: 1 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('prettier-unformatted');
    expect(results[0]?.message).toContain('2 file(s)');
    expect(results[0]?.fix).toBeDefined();
    expect((results[0]?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('detail lists file paths relative to projectDir, one per line', async () => {
    await write('.prettierrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const stderr = [
      `[warn] ${path.join(root, 'src/a.ts')}`,
      `[warn] ${path.join(root, 'src/b.ts')}`,
      '[warn] Code style issues found in 2 files. Run Prettier with --write to fix.',
    ].join('\n');
    const results = await runPrettierPassing(
      ctx,
      deps(async () => ({ stdout: '', stderr, exitCode: 1 })),
    );
    const detail = results[0]?.detail ?? '';
    expect(detail).toContain(`src${path.sep}a.ts`);
    expect(detail).toContain(`src${path.sep}b.ts`);
    expect(detail).not.toContain('Code style issues found');
  });

  test('detail truncates at MAX_DETAIL_LINES with "... and N more"', async () => {
    await write('.prettierrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const lines = Array.from({ length: 25 }, (_, i) => `[warn] src/file-${i}.ts`);
    lines.push('[warn] Code style issues found in 25 files. Run Prettier with --write to fix.');
    const stderr = lines.join('\n');
    const results = await runPrettierPassing(
      ctx,
      deps(async () => ({ stdout: '', stderr, exitCode: 1 })),
    );
    const detail = results[0]?.detail ?? '';
    for (let i = 0; i < 20; i++) {
      expect(detail).toContain(`src/file-${i}.ts`);
    }
    expect(detail).not.toContain('src/file-20.ts');
    expect(detail).toContain('... and 5 more');
    expect(results[0]?.message).toContain('25 file(s)');
  });

  test('fail "prettier-runtime-error" when exit code >= 2', async () => {
    await write('.prettierrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(
      ctx,
      deps(async () => ({ stdout: '', stderr: 'config error', exitCode: 2 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('prettier-runtime-error');
    expect(results[0]?.message).toContain('2');
  });

  test('fail "prettier-runtime-error" when subprocess throws (environmental error like ENOENT)', async () => {
    await write('.prettierrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(
      ctx,
      deps(async () => {
        throw new Error('ENOENT: npx not found');
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('prettier-runtime-error');
    expect(results[0]?.message).toContain('ENOENT');
  });

  test('exit code 1 with no parseable [warn] file lines still fails unformatted with count 0 and stderr detail', async () => {
    await write('.prettierrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(
      ctx,
      deps(async () => ({ stdout: '', stderr: 'unexpected diagnostic output', exitCode: 1 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('prettier-unformatted');
    expect(results[0]?.message).toContain('0 file(s)');
    expect(results[0]?.detail).toContain('unexpected diagnostic output');
  });

  test('all results carry checkerId "prettier-passing" and category "code-quality"', async () => {
    await write('.prettierrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runPrettierPassing(
      ctx,
      deps(async () => CLEAN),
    );
    for (const r of results as CheckResult[]) {
      expect(r.checkerId).toBe('prettier-passing');
      expect(r.category).toBe('code-quality');
    }
  });
});
