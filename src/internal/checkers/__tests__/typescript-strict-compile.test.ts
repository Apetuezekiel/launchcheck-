import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { CheckResult, ProjectContext } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import {
  type TypescriptStrictCompileDeps,
  runTypescriptStrictCompile,
  typescriptStrictCompileChecker,
} from '../typescript-strict-compile.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-ts-strict-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

function deps(impl: TypescriptStrictCompileDeps['runTsc']): TypescriptStrictCompileDeps {
  return { runTsc: impl };
}

/** Wraps makeProjectContext but overrides the parsed tsconfigJson. */
function projectWithTsconfig(tsconfigJson: Record<string, unknown> | null): ProjectContext {
  return { ...makeProjectContext(root), tsconfigJson };
}

/** A deps stub that fails the test if invoked — guards "no subprocess" expectations. */
const FAIL_IF_CALLED: TypescriptStrictCompileDeps = {
  runTsc: async () => {
    throw new Error('runTsc should not have been called');
  },
};

/** A clean tsc run: exit 0, empty output. */
const CLEAN: Awaited<ReturnType<TypescriptStrictCompileDeps['runTsc']>> = {
  stdout: '',
  stderr: '',
  exitCode: 0,
};

describe('typescriptStrictCompileChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('typescript-strict-compile');
    expect(entry).toBeDefined();
    expect(typescriptStrictCompileChecker.id).toBe(entry?.id);
    expect(typescriptStrictCompileChecker.name).toBe(entry?.name);
    expect(typescriptStrictCompileChecker.category).toBe(entry?.category);
    expect(typescriptStrictCompileChecker.mode).toBe(entry?.mode);
  });

  test('returns a single skip result when ctx.project is null', async () => {
    const baseCtx = makeStaticContext(makeProjectContext(root));
    const ctx = { ...baseCtx, project: null };
    const results = await runTypescriptStrictCompile(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-project-context');
  });

  test('returns a single skip result when ctx.signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const ctx = makeStaticContext(makeProjectContext(root), ac.signal);
    const results = await runTypescriptStrictCompile(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('aborted');
  });

  test('skip with resultId "no-tsconfig" when no tsconfig.json is present', async () => {
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runTypescriptStrictCompile(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-tsconfig');
  });

  test('detects tsconfig.json with strict:true and runs the subprocess', async () => {
    await write('tsconfig.json', '{}');
    let called = false;
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: true } }));
    const results = await runTypescriptStrictCompile(
      ctx,
      deps(async () => {
        called = true;
        return CLEAN;
      }),
    );
    expect(called).toBe(true);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('strict-clean');
  });

  test('fail "strict-disabled" when compilerOptions.strict is explicitly false (no subprocess)', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: false } }));
    const results = await runTypescriptStrictCompile(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('strict-disabled');
    expect((results[0]?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('warn "strict-indeterminate" when strict flag is absent from compilerOptions (no subprocess)', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { target: 'ES2022' } }));
    const results = await runTypescriptStrictCompile(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('warn');
    expect(results[0]?.resultId).toBe('strict-indeterminate');
  });

  test('warn "strict-indeterminate" when tsconfig has no compilerOptions object (no subprocess)', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ files: [] }));
    const results = await runTypescriptStrictCompile(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('warn');
    expect(results[0]?.resultId).toBe('strict-indeterminate');
  });

  test('warn "strict-indeterminate" when tsconfig.json is present but unparsed (tsconfigJson null / JSONC)', async () => {
    await write('tsconfig.json', '{ /* jsonc comment */ "compilerOptions": { "strict": true } }');
    const ctx = makeStaticContext(projectWithTsconfig(null));
    const results = await runTypescriptStrictCompile(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('warn');
    expect(results[0]?.resultId).toBe('strict-indeterminate');
  });

  test('pass "strict-clean" when tsc exits 0', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: true } }));
    const results = await runTypescriptStrictCompile(
      ctx,
      deps(async () => CLEAN),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('strict-clean');
  });

  test('fail "type-errors" when tsc exits 2 with diagnostics; message has the count and fix is set', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: true } }));
    const stdout = [
      "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "src/b.ts(2,5): error TS2322: Type 'number' is not assignable to type 'string'.",
    ].join('\n');
    const results = await runTypescriptStrictCompile(
      ctx,
      deps(async () => ({ stdout, stderr: '', exitCode: 2 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('type-errors');
    expect(results[0]?.message).toContain('2 type error(s)');
    expect((results[0]?.fix ?? '').length).toBeGreaterThan(0);
    expect(results[0]?.detail).toContain('TS2322');
  });

  test('detail truncates at MAX_DETAIL_LINES with "... and N more"', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: true } }));
    const stdout = Array.from(
      { length: 25 },
      (_, i) => `src/f${i}.ts(1,1): error TS2322: msg ${i}`,
    ).join('\n');
    const results = await runTypescriptStrictCompile(
      ctx,
      deps(async () => ({ stdout, stderr: '', exitCode: 2 })),
    );
    const detail = results[0]?.detail ?? '';
    for (let i = 0; i < 20; i++) {
      expect(detail).toContain(`msg ${i}`);
    }
    expect(detail).not.toContain('msg 20');
    expect(detail).toContain('... and 5 more');
    expect(results[0]?.message).toContain('25 type error(s)');
  });

  test('parses diagnostic lines that have no file(line,col) prefix (e.g. TS18003)', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: true } }));
    const stdout = [
      "error TS18003: No inputs were found in config file 'tsconfig.json'.",
      'tsconfig.json(1,54): error TS5010: File specification cannot end in a recursive directory wildcard.',
    ].join('\n');
    const results = await runTypescriptStrictCompile(
      ctx,
      deps(async () => ({ stdout, stderr: '', exitCode: 2 })),
    );
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('type-errors');
    expect(results[0]?.message).toContain('2 type error(s)');
  });

  test('fail "tsc-runtime-error" when exit code is non-zero but no parseable diagnostics', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: true } }));
    const results = await runTypescriptStrictCompile(
      ctx,
      deps(async () => ({ stdout: 'some unexpected output', stderr: '', exitCode: 1 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('tsc-runtime-error');
    expect(results[0]?.message).toContain('1');
  });

  test('fail "tsc-runtime-error" when subprocess throws (environmental error like ENOENT)', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: true } }));
    const results = await runTypescriptStrictCompile(
      ctx,
      deps(async () => {
        throw new Error('ENOENT: tsc not found');
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('tsc-runtime-error');
    expect(results[0]?.message).toContain('ENOENT');
  });

  test('fail "type-errors" when tsc exits with code 1 and diagnostics (exit-code variance)', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: true } }));
    const results = await runTypescriptStrictCompile(
      ctx,
      deps(async () => ({
        stdout: 'src/a.ts(1,1): error TS2304: Cannot find name x.',
        stderr: '',
        exitCode: 1,
      })),
    );
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('type-errors');
    expect(results[0]?.message).toContain('1 type error(s)');
  });

  test('all results carry checkerId "typescript-strict-compile" and category "code-quality"', async () => {
    await write('tsconfig.json', '{}');
    const ctx = makeStaticContext(projectWithTsconfig({ compilerOptions: { strict: true } }));
    const results = await runTypescriptStrictCompile(
      ctx,
      deps(async () => CLEAN),
    );
    for (const r of results as CheckResult[]) {
      expect(r.checkerId).toBe('typescript-strict-compile');
      expect(r.category).toBe('code-quality');
    }
  });
});
