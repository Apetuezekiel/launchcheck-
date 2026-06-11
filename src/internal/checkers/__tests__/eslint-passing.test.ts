import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { CheckResult, PackageJson, ProjectContext } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import {
  type EslintPassingDeps,
  eslintPassingChecker,
  runEslintPassing,
} from '../eslint-passing.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-eslint-passing-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

function deps(impl: EslintPassingDeps['runEslint']): EslintPassingDeps {
  return { runEslint: impl };
}

/** Wraps makeProjectContext but lets the test override fields like packageJson. */
function projectWithPackageJson(pkg: PackageJson): ProjectContext {
  return { ...makeProjectContext(root), packageJson: pkg };
}

/** A deps stub that fails the test if invoked — guards "no subprocess" expectations. */
const FAIL_IF_CALLED: EslintPassingDeps = {
  runEslint: async () => {
    throw new Error('runEslint should not have been called');
  },
};

/** Default JSON for "one clean file" success path. */
const CLEAN_JSON = JSON.stringify([
  { filePath: 'src/a.ts', errorCount: 0, warningCount: 0, messages: [] },
]);

describe('eslintPassingChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('eslint-passing');
    expect(entry).toBeDefined();
    expect(eslintPassingChecker.id).toBe(entry?.id);
    expect(eslintPassingChecker.name).toBe(entry?.name);
    expect(eslintPassingChecker.category).toBe(entry?.category);
    expect(eslintPassingChecker.mode).toBe(entry?.mode);
  });

  test('returns a single skip result when ctx.project is null', async () => {
    const baseCtx = makeStaticContext(makeProjectContext(root));
    const ctx = { ...baseCtx, project: null };
    const results = await runEslintPassing(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-project-context');
  });

  test('returns a single skip result when ctx.signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const ctx = makeStaticContext(makeProjectContext(root), ac.signal);
    const results = await runEslintPassing(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('aborted');
  });

  test('skip with resultId "no-config-found" when no .eslintrc*, no eslint.config.*, and no package.json eslintConfig', async () => {
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runEslintPassing(ctx, FAIL_IF_CALLED);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-config-found');
  });

  test('detects .eslintrc.json and runs the subprocess', async () => {
    await write('.eslintrc.json', '{}');
    let called = false;
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runEslintPassing(
      ctx,
      deps(async () => {
        called = true;
        return { stdout: CLEAN_JSON, exitCode: 0 };
      }),
    );
    expect(called).toBe(true);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('eslint-clean');
  });

  test('detects eslint.config.js and runs the subprocess', async () => {
    await write('eslint.config.js', 'export default [];');
    let called = false;
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runEslintPassing(
      ctx,
      deps(async () => {
        called = true;
        return { stdout: CLEAN_JSON, exitCode: 0 };
      }),
    );
    expect(called).toBe(true);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('eslint-clean');
  });

  test('detects eslintConfig field in package.json and runs the subprocess', async () => {
    let called = false;
    const ctx = makeStaticContext(
      projectWithPackageJson({ name: 'fx', eslintConfig: {} } as PackageJson),
    );
    const results = await runEslintPassing(
      ctx,
      deps(async () => {
        called = true;
        return { stdout: CLEAN_JSON, exitCode: 0 };
      }),
    );
    expect(called).toBe(true);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('eslint-clean');
  });

  test('pass "eslint-clean" when exit code 0 and JSON is an empty array', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runEslintPassing(
      ctx,
      deps(async () => ({ stdout: '[]', exitCode: 0 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('eslint-clean');
  });

  test('pass message includes the file count from parsed array length', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const stdout = JSON.stringify([
      { filePath: 'a.ts', errorCount: 0, warningCount: 0, messages: [] },
      { filePath: 'b.ts', errorCount: 0, warningCount: 0, messages: [] },
      { filePath: 'c.ts', errorCount: 0, warningCount: 0, messages: [] },
    ]);
    const results = await runEslintPassing(
      ctx,
      deps(async () => ({ stdout, exitCode: 0 })),
    );
    expect(results[0]?.message).toContain('3 file(s)');
  });

  test('fail "eslint-problems" when exit code 1 with problems; message has error and warning counts and the file count', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const stdout = JSON.stringify([
      {
        filePath: path.join(root, 'src/a.ts'),
        errorCount: 2,
        warningCount: 1,
        messages: [
          { ruleId: 'no-console', severity: 2, message: 'Unexpected console', line: 1, column: 1 },
          { ruleId: 'eqeqeq', severity: 2, message: 'Use ===', line: 2, column: 5 },
          { ruleId: 'no-unused-vars', severity: 1, message: 'unused x', line: 3, column: 7 },
        ],
      },
      {
        filePath: path.join(root, 'src/b.ts'),
        errorCount: 0,
        warningCount: 0,
        messages: [],
      },
    ]);
    const results = await runEslintPassing(
      ctx,
      deps(async () => ({ stdout, exitCode: 1 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('eslint-problems');
    expect(results[0]?.message).toContain('2 error(s)');
    expect(results[0]?.message).toContain('1 warning(s)');
    expect(results[0]?.message).toContain('1 file(s)');
    expect(results[0]?.fix).toBeDefined();
    expect((results[0]?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('detail formats as "relpath:line:col  rule  message" lines', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const stdout = JSON.stringify([
      {
        filePath: path.join(root, 'src/a.ts'),
        errorCount: 1,
        warningCount: 0,
        messages: [
          {
            ruleId: 'no-console',
            severity: 2,
            message: 'Unexpected console statement',
            line: 10,
            column: 5,
          },
        ],
      },
    ]);
    const results = await runEslintPassing(
      ctx,
      deps(async () => ({ stdout, exitCode: 1 })),
    );
    const detail = results[0]?.detail ?? '';
    const expected = `src${path.sep}a.ts:10:5  no-console  Unexpected console statement`;
    expect(detail).toContain(expected);
  });

  test('detail truncates at MAX_DETAIL_LINES with "... and N more"', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const messages = Array.from({ length: 25 }, (_, i) => ({
      ruleId: 'no-console',
      severity: 2,
      message: `msg ${i}`,
      line: i + 1,
      column: 1,
    }));
    const stdout = JSON.stringify([
      {
        filePath: path.join(root, 'src/a.ts'),
        errorCount: 25,
        warningCount: 0,
        messages,
      },
    ]);
    const results = await runEslintPassing(
      ctx,
      deps(async () => ({ stdout, exitCode: 1 })),
    );
    const detail = results[0]?.detail ?? '';
    // first 20 lines present
    for (let i = 0; i < 20; i++) {
      expect(detail).toContain(`msg ${i}`);
    }
    // 21st line NOT present
    expect(detail).not.toContain('msg 20');
    // truncation footer
    expect(detail).toContain('... and 5 more');
  });

  test('fail "eslint-runtime-error" when exit code >= 2', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runEslintPassing(
      ctx,
      deps(async () => ({ stdout: '', exitCode: 2 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('eslint-runtime-error');
    expect(results[0]?.message).toContain('2');
  });

  test('fail "eslint-runtime-error" when subprocess throws (environmental error like ENOENT)', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runEslintPassing(
      ctx,
      deps(async () => {
        throw new Error('ENOENT: npx not found');
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('eslint-runtime-error');
    expect(results[0]?.message).toContain('ENOENT');
  });

  test('fail "eslint-runtime-error" when stdout is non-JSON', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runEslintPassing(
      ctx,
      deps(async () => ({ stdout: 'not json at all', exitCode: 0 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('eslint-runtime-error');
  });

  test('fail "eslint-runtime-error" when JSON parses but is not an array', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runEslintPassing(
      ctx,
      deps(async () => ({ stdout: '{}', exitCode: 0 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('eslint-runtime-error');
  });

  test('all results carry checkerId "eslint-passing" and category "code-quality"', async () => {
    await write('.eslintrc.json', '{}');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runEslintPassing(
      ctx,
      deps(async () => ({ stdout: '[]', exitCode: 0 })),
    );
    for (const r of results as CheckResult[]) {
      expect(r.checkerId).toBe('eslint-passing');
      expect(r.category).toBe('code-quality');
    }
  });
});
