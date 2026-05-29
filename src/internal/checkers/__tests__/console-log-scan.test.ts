import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { findById } from '../../registry/index.js';
import { consoleLogScanChecker } from '../console-log-scan.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-console-log-scan-'));
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
  return consoleLogScanChecker.run(ctx);
}

describe('consoleLogScanChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('console-log-scan');
    expect(entry).toBeDefined();
    expect(consoleLogScanChecker.id).toBe(entry?.id);
    expect(consoleLogScanChecker.name).toBe(entry?.name);
    expect(consoleLogScanChecker.category).toBe(entry?.category);
    expect(consoleLogScanChecker.mode).toBe(entry?.mode);
  });

  test('flags console.log, console.debug, console.error, and console.warn', async () => {
    await write(
      'src/variants.ts',
      [
        "console.log('a');",
        "console.debug('b');",
        "console.error('c');",
        "console.warn('d');",
      ].join('\n'),
    );
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.detail).toContain('console.log');
    expect(result?.detail).toContain('console.debug');
    expect(result?.detail).toContain('console.error');
    expect(result?.detail).toContain('console.warn');
  });

  test('flags bare debugger statements', async () => {
    await write('src/stop.ts', 'export function f() {\n  debugger;\n}\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.detail).toContain('debugger');
  });

  test('detail reports file:line:column for every occurrence', async () => {
    await write(
      'src/dirty.ts',
      ['export const x = 1;', "console.log('a');", '  debugger;'].join('\n'),
    );
    const [result] = await runChecker();
    expect(result?.detail).toMatch(/src\/dirty\.ts:2:1\s+console\.log/);
    expect(result?.detail).toMatch(/src\/dirty\.ts:3:3\s+debugger/);
  });

  test('message reports the occurrence count and the file count', async () => {
    await write('src/a.ts', "console.log('a');\nconsole.error('b');\n");
    await write('src/b.ts', 'debugger;\n');
    const [result] = await runChecker();
    expect(result?.message).toBe('Found 3 console/debugger statement(s) in 2 file(s).');
  });

  test('location points at the first occurrence', async () => {
    await write('src/a.ts', "export const x = 1;\nconsole.log('a');\n");
    const [result] = await runChecker();
    expect(result?.location).toEqual({ file: 'src/a.ts', line: 2, column: 1 });
  });

  test('returns exactly one CheckResult', async () => {
    await write('src/a.ts', "console.log('a');\n");
    await write('src/b.ts', "console.warn('b');\n");
    const results = await runChecker();
    expect(results).toHaveLength(1);
  });

  test('fail result on detection has status fail, severity major, and a non-empty fix', async () => {
    await write('src/a.ts', "console.log('a');\n");
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.severity).toBe('major');
    expect(result?.fix).toBeTruthy();
    expect(typeof result?.fix).toBe('string');
    expect((result?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('does not flag a console statement in a // line comment', async () => {
    await write('src/a.ts', "// console.log('debug me later');\nexport const x = 1;\n");
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('does not flag a console statement in a single-line block comment', async () => {
    await write('src/a.ts', "/* console.log('x') */\nexport const x = 1;\n");
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('does not flag a console statement inside a multi-line block comment', async () => {
    await write(
      'src/a.ts',
      ['/*', " * console.log('inside a multi-line block');", ' */', 'export const x = 1;'].join(
        '\n',
      ),
    );
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('excludes *.test.* and *.spec.* files', async () => {
    await write('src/util/helper.test.ts', "console.log('in test');\n");
    await write('src/util/helper.spec.ts', "console.log('in spec');\n");
    await write('src/clean.ts', 'export const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('excludes files under a __tests__/ directory', async () => {
    await write('src/__tests__/inside.ts', "console.log('in tests dir');\n");
    await write('src/clean.ts', 'export const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('excludes node_modules via the ProjectFs ignore matcher', async () => {
    await write('node_modules/pkg/index.js', "console.log('in dep');\n");
    await write('src/clean.ts', 'export const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('scans .cjs/.mjs/.jsx/.tsx in addition to .js/.ts', async () => {
    await write('src/a.cjs', "console.log('cjs');\n");
    await write('src/a.mjs', "console.log('mjs');\n");
    await write('src/a.jsx', "console.log('jsx');\n");
    await write('src/a.tsx', "console.log('tsx');\n");
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.message).toBe('Found 4 console/debugger statement(s) in 4 file(s).');
  });

  test('emits a pass result for a project with no console/debugger statements', async () => {
    await write('src/clean.ts', 'export const x = 1;\n');
    await write('src/util/helper.ts', 'export const h = () => null;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.message).toBe('No console or debugger statements found in source files.');
  });

  test('returns a skip result when ctx.project is null', async () => {
    const base = makeStaticContext(makeProjectContext(root));
    const results = await consoleLogScanChecker.run({ ...base, project: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
  });

  test('returns a skip result when ctx.signal is already aborted', async () => {
    await write('src/a.ts', "console.log('a');\n");
    const controller = new AbortController();
    controller.abort();
    const [result] = await runChecker(controller.signal);
    expect(result?.status).toBe('skip');
  });

  test('aborts mid-run when ctx.signal aborts during a readText call', async () => {
    // Pressure-tests the in-loop `if (ctx.signal.aborted)` check inside
    // the file iteration. Without it, the checker would keep reading
    // every file after abort and only return at the end. With it, the
    // next iteration after abort short-circuits to a skip.
    await write('src/a.ts', "console.log('a');\n");
    await write('src/b.ts', "console.log('b');\n");
    await write('src/c.ts', "console.log('c');\n");

    const controller = new AbortController();
    const project = makeProjectContext(root);
    const ctx = makeStaticContext(project, controller.signal);

    const originalReadText = project.fs.readText.bind(project.fs);
    let reads = 0;
    vi.spyOn(project.fs, 'readText').mockImplementation(async (p: string) => {
      reads += 1;
      const content = await originalReadText(p);
      if (reads === 1) controller.abort();
      return content;
    });

    const [result] = await consoleLogScanChecker.run(ctx);
    expect(result?.status).toBe('skip');
    expect(result?.message).toMatch(/aborted/i);
    // Exactly one read happened; iteration short-circuited before the
    // second and third files.
    expect(reads).toBe(1);
  });
});
