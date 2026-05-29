import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { todoFixmeScanChecker } from '../todo-fixme-scan.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-todo-fixme-scan-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

async function runChecker(signal?: AbortSignal) {
  const ctx = makeStaticContext(makeProjectContext(root), signal);
  return todoFixmeScanChecker.run(ctx);
}

describe('todoFixmeScanChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('todo-fixme-scan');
    expect(entry).toBeDefined();
    expect(todoFixmeScanChecker.id).toBe(entry?.id);
    expect(todoFixmeScanChecker.name).toBe(entry?.name);
    expect(todoFixmeScanChecker.category).toBe(entry?.category);
    expect(todoFixmeScanChecker.mode).toBe(entry?.mode);
  });

  test('flags TODO, FIXME, XXX, and HACK in line comments', async () => {
    await write(
      'src/markers.ts',
      ['// TODO refactor', '// FIXME broken', '// XXX revisit', '// HACK workaround'].join('\n'),
    );
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.detail).toContain('TODO');
    expect(result?.detail).toContain('FIXME');
    expect(result?.detail).toContain('XXX');
    expect(result?.detail).toContain('HACK');
  });

  test('flags markers inside single-line block comments', async () => {
    await write('src/block.ts', '/* TODO finish this */\nexport const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.detail).toContain('TODO');
  });

  test('flags markers inside multi-line block comments', async () => {
    await write(
      'src/multi.ts',
      ['/*', ' * line one', ' * FIXME inside multi-line', ' */', 'export const x = 1;'].join('\n'),
    );
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.detail).toContain('FIXME');
  });

  test('does NOT flag a marker inside a string literal in code', async () => {
    await write('src/strings.ts', 'const s = "TODO inside a string";\nexport { s };\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('does NOT flag a bare marker in code (no comment context)', async () => {
    await write('src/bare.ts', "const TODO = 'x';\nexport { TODO };\n");
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('is case-sensitive: does NOT flag lowercase "Todo"', async () => {
    await write('src/case.ts', '// Todo lowercase variant\nexport const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('is word-bounded: does NOT flag "PROTODO" or "TODOX"', async () => {
    await write('src/word.ts', '// PROTODO and TODOX should not match\nexport const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('detail reports file:line:column for every occurrence', async () => {
    await write(
      'src/dirty.ts',
      ['export const x = 1;', '// TODO at line 2', '  // FIXME at line 3 col 3'].join('\n'),
    );
    const [result] = await runChecker();
    expect(result?.detail).toMatch(/src\/dirty\.ts:2:4\s+TODO/);
    expect(result?.detail).toMatch(/src\/dirty\.ts:3:6\s+FIXME/);
  });

  test('message reports the occurrence count and the file count', async () => {
    await write('src/a.ts', '// TODO one\n// FIXME two\n');
    await write('src/b.ts', '// HACK three\n');
    const [result] = await runChecker();
    expect(result?.message).toBe('Found 3 TODO/FIXME marker(s) in 2 file(s).');
  });

  test('location points at the first occurrence', async () => {
    await write('src/a.ts', 'export const x = 1;\n// TODO right here\n');
    const [result] = await runChecker();
    expect(result?.location).toEqual({ file: 'src/a.ts', line: 2, column: 4 });
  });

  test('returns exactly one CheckResult', async () => {
    await write('src/a.ts', '// TODO a\n');
    await write('src/b.ts', '// FIXME b\n');
    const results = await runChecker();
    expect(results).toHaveLength(1);
  });

  test('fail result on detection has status fail, severity minor, and a non-empty fix', async () => {
    await write('src/a.ts', '// TODO a\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.severity).toBe('minor');
    expect(result?.fix).toBeTruthy();
    expect(typeof result?.fix).toBe('string');
    expect((result?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('excludes *.test.* and *.spec.* files', async () => {
    await write('src/util/helper.test.ts', '// TODO inside test\n');
    await write('src/util/helper.spec.ts', '// FIXME inside spec\n');
    await write('src/clean.ts', 'export const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('excludes files under a __tests__/ directory', async () => {
    await write('src/__tests__/inside.ts', '// TODO inside tests dir\n');
    await write('src/clean.ts', 'export const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('excludes node_modules via the ProjectFs ignore matcher', async () => {
    await write('node_modules/pkg/index.js', '// TODO inside dep\n');
    await write('src/clean.ts', 'export const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('scans .cjs/.mjs/.jsx/.tsx in addition to .js/.ts', async () => {
    await write('src/a.cjs', '// TODO cjs\n');
    await write('src/a.mjs', '// TODO mjs\n');
    await write('src/a.jsx', '// TODO jsx\n');
    await write('src/a.tsx', '// TODO tsx\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.message).toBe('Found 4 TODO/FIXME marker(s) in 4 file(s).');
  });

  test('emits a pass result for a project with no markers', async () => {
    await write('src/clean.ts', 'export const x = 1;\n');
    await write('src/util/helper.ts', 'export const h = () => null;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.message).toBe('No TODO/FIXME markers found in source files.');
  });

  test('returns a skip result when ctx.project is null', async () => {
    const base = makeStaticContext(makeProjectContext(root));
    const results = await todoFixmeScanChecker.run({ ...base, project: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
  });

  test('returns a skip result when ctx.signal is already aborted', async () => {
    await write('src/a.ts', '// TODO a\n');
    const controller = new AbortController();
    controller.abort();
    const [result] = await runChecker(controller.signal);
    expect(result?.status).toBe('skip');
  });
});
