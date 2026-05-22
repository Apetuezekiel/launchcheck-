import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildProjectContext } from '../build-project-context.js';

const execFileAsync = promisify(execFile);

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-build-ctx-'));

  // Source tree.
  await fs.mkdir(path.join(root, 'src', 'util'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'index.ts'), 'export const x = 1;\n');
  await fs.writeFile(path.join(root, 'src', 'util', 'helper.ts'), 'export const h = () => {};\n');

  // Manifest + tsconfig.
  await fs.writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify({ name: 'fixture' }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(root, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: {} }, null, 2)}\n`,
  );

  // .gitignore with a comment, a blank line, and one pattern.
  await fs.writeFile(path.join(root, '.gitignore'), '# comment\n\nsecret.txt\n');

  // Files referenced by tests.
  await fs.writeFile(path.join(root, 'secret.txt'), 'shhh\n');

  // node_modules — covered by built-in default prunes.
  await fs.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'module.exports={};\n');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/**
 * Initialize a git repo at `dir`. Returns true on success, false when git is
 * not available. Tests use the false return as a skip signal.
 */
async function tryGitInit(dir: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', dir, 'init', '--quiet'], {
      timeout: 5000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

describe('buildProjectContext', () => {
  test('projectDir is the resolved absolute path', async () => {
    const ctx = await buildProjectContext(root);
    expect(path.isAbsolute(ctx.projectDir)).toBe(true);
    expect(ctx.projectDir).toBe(path.resolve(root));
  });

  test('packageJson is parsed when package.json is present', async () => {
    const ctx = await buildProjectContext(root);
    expect(ctx.packageJson).not.toBeNull();
    expect(ctx.packageJson?.name).toBe('fixture');
  });

  test('packageJson is null when package.json is absent', async () => {
    await fs.rm(path.join(root, 'package.json'));
    const ctx = await buildProjectContext(root);
    expect(ctx.packageJson).toBeNull();
  });

  test('packageJson is null when package.json is malformed JSON', async () => {
    await fs.writeFile(path.join(root, 'package.json'), '{not valid json,,}');
    const ctx = await buildProjectContext(root);
    expect(ctx.packageJson).toBeNull();
  });

  test('packageJson is null when the package.json root is not an object', async () => {
    // A JSON array is valid JSON but not a valid PackageJson root.
    await fs.writeFile(path.join(root, 'package.json'), '["not", "an", "object"]');
    const ctx = await buildProjectContext(root);
    expect(ctx.packageJson).toBeNull();
  });

  test('tsconfigJson is parsed when tsconfig.json is present', async () => {
    const ctx = await buildProjectContext(root);
    expect(ctx.tsconfigJson).not.toBeNull();
    expect(ctx.tsconfigJson).toEqual({ compilerOptions: {} });
  });

  test('tsconfigJson is null when tsconfig.json is absent', async () => {
    await fs.rm(path.join(root, 'tsconfig.json'));
    const ctx = await buildProjectContext(root);
    expect(ctx.tsconfigJson).toBeNull();
  });

  test('gitRoot is the repo root when projectDir is inside a git repo', async () => {
    if (!(await tryGitInit(root))) return;
    const ctx = await buildProjectContext(root);
    expect(ctx.gitRoot).not.toBeNull();
    const expectedReal = await fs.realpath(root);
    const actualReal = await fs.realpath(ctx.gitRoot as string);
    expect(actualReal).toBe(expectedReal);
  });

  test('gitRoot is null when projectDir is not in a git repo', async () => {
    // No `git init` was run on the temp dir; with $TMPDIR on a typical
    // box this is reliably outside any repo.
    const ctx = await buildProjectContext(root);
    expect(ctx.gitRoot).toBeNull();
  });

  test('ignore honors a pattern from the project .gitignore', async () => {
    const ctx = await buildProjectContext(root);
    expect(ctx.ignore.ignores(path.join(root, 'secret.txt'))).toBe(true);
    expect(ctx.ignore.ignores(path.join(root, 'src', 'index.ts'))).toBe(false);
  });

  test('ignore honors a pattern from options.ignore', async () => {
    const ctx = await buildProjectContext(root, { ignore: ['*.tmp'] });
    expect(ctx.ignore.ignores(path.join(root, 'scratch.tmp'))).toBe(true);
    expect(ctx.ignore.ignores(path.join(root, 'src', 'index.ts'))).toBe(false);
  });

  test('ignore still honors the built-in default prunes', async () => {
    const ctx = await buildProjectContext(root);
    expect(ctx.ignore.ignores(path.join(root, 'node_modules', 'pkg', 'index.js'))).toBe(true);
  });

  test('ignore drops comment and blank lines from .gitignore', async () => {
    // .gitignore content was "# comment", "", "secret.txt". The "# comment"
    // line is NOT treated as a pattern — if it were, a literal file named
    // "# comment" would be ignored. Assert the opposite.
    await fs.writeFile(path.join(root, '# comment'), 'literal-name\n');
    const ctx = await buildProjectContext(root);
    expect(ctx.ignore.ignores(path.join(root, '# comment'))).toBe(false);
  });

  test('a missing .gitignore yields no error and no extra patterns', async () => {
    await fs.rm(path.join(root, '.gitignore'));
    const ctx = await buildProjectContext(root);
    // secret.txt is no longer ignored once .gitignore is gone — only default
    // prunes remain in effect.
    expect(ctx.ignore.ignores(path.join(root, 'secret.txt'))).toBe(false);
  });

  test('fs.glob returns project source files', async () => {
    const ctx = await buildProjectContext(root);
    const results = await ctx.fs.glob('src/**/*.ts');
    const basenames = results.map((p) => path.basename(p)).sort();
    expect(basenames).toContain('index.ts');
    expect(basenames).toContain('helper.ts');
  });

  test('fs.glob excludes a file listed in .gitignore', async () => {
    const ctx = await buildProjectContext(root);
    const results = await ctx.fs.glob('**/*.txt');
    expect(results.some((p) => p.endsWith('secret.txt'))).toBe(false);
  });

  test('options.ignore defaults to empty when omitted', async () => {
    // Constructing without options must succeed and behave identically to
    // passing {}. The .gitignore-only pattern (secret.txt) still ignores.
    const ctx = await buildProjectContext(root);
    expect(ctx.ignore.ignores(path.join(root, 'secret.txt'))).toBe(true);
    // And a path that no .gitignore or default rule covers stays un-ignored.
    expect(ctx.ignore.ignores(path.join(root, 'src', 'index.ts'))).toBe(false);
  });
});
