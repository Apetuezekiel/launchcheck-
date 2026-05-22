import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DefaultIgnoreMatcher } from '../ignore-matcher.js';
import { DefaultProjectFs } from '../project-fs.js';

/**
 * Per-test fixture tree. Created fresh in beforeEach and torn down in
 * afterEach so tests don't share state and the suite is safe under
 * vitest's default parallel scheduling.
 */
let root: string;
let pfs: DefaultProjectFs;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-projectfs-'));

  // Fixture tree per dispatch spec.
  await fs.mkdir(path.join(root, 'src', 'util'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'index.ts'), 'export const x = 1;\n');
  await fs.writeFile(path.join(root, 'src', 'app.tsx'), 'export const App = () => null;\n');
  await fs.writeFile(path.join(root, 'src', 'util', 'helper.ts'), 'export const h = () => {};\n');
  await fs.writeFile(
    path.join(root, 'src', 'util', 'helper.test.ts'),
    "import { h } from './helper.js';\n",
  );

  await fs.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};\n');

  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  await fs.writeFile(path.join(root, 'dist', 'bundle.js'), '/* bundled */\n');

  await fs.writeFile(path.join(root, '.env'), 'API_KEY=test\n');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }, null, 2));
  await fs.writeFile(path.join(root, 'README.md'), '# fixture\n');
  await fs.writeFile(path.join(root, 'notes.log'), 'note\n');

  const matcher = new DefaultIgnoreMatcher(root, ['*.log']);
  pfs = new DefaultProjectFs(root, matcher);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('DefaultProjectFs', () => {
  // ---------------------------------------------------------------------------
  // glob
  // ---------------------------------------------------------------------------

  test('glob returns absolute paths for matching files', async () => {
    const results = await pfs.glob('src/**/*.ts');
    expect(results.length).toBeGreaterThan(0);
    for (const p of results) {
      expect(path.isAbsolute(p)).toBe(true);
      expect(p.startsWith(root)).toBe(true);
    }
  });

  test('glob excludes files under node_modules', async () => {
    const results = await pfs.glob('**/*.js');
    expect(results.some((p) => p.includes(`${path.sep}node_modules${path.sep}`))).toBe(false);
  });

  test('glob excludes files under dist', async () => {
    const results = await pfs.glob('**/*.js');
    expect(results.some((p) => p.includes(`${path.sep}dist${path.sep}`))).toBe(false);
  });

  test('glob excludes a file matched by an extra IgnoreMatcher pattern (notes.log)', async () => {
    const results = await pfs.glob('**/*');
    expect(results.some((p) => p.endsWith('notes.log'))).toBe(false);
  });

  test('glob accepts an array of patterns', async () => {
    const results = await pfs.glob(['src/**/*.ts', 'src/**/*.tsx']);
    const basenames = results.map((p) => path.basename(p)).sort();
    expect(basenames).toContain('index.ts');
    expect(basenames).toContain('app.tsx');
    expect(basenames).toContain('helper.ts');
  });

  test('glob returns results in ascending sorted order', async () => {
    const results = await pfs.glob('**/*.ts');
    const sorted = [...results].sort();
    expect(results).toEqual(sorted);
  });

  test('glob returns files only, never directories', async () => {
    const results = await pfs.glob('**/*');
    for (const p of results) {
      const s = await fs.stat(p);
      expect(s.isFile()).toBe(true);
    }
  });

  test('glob includes dotfiles (finds .env)', async () => {
    const results = await pfs.glob('**/*');
    expect(results.some((p) => p.endsWith(`${path.sep}.env`))).toBe(true);
  });

  test('glob does not traverse into a symlinked directory', async () => {
    // Create link/ -> src/. On Windows without the symlink privilege this
    // throws EPERM; in that case skip the assertion rather than fail.
    const linkPath = path.join(root, 'link');
    try {
      await fs.symlink(path.join(root, 'src'), linkPath, 'dir');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'ENOSYS') return;
      throw err;
    }

    const results = await pfs.glob('**/*.ts');
    // Files reached only through the symlink would appear under link/ —
    // their presence indicates traversal.
    const viaSymlink = results.filter((p) => p.includes(`${path.sep}link${path.sep}`));
    expect(viaSymlink).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Path resolution + reads
  // ---------------------------------------------------------------------------

  test('exists returns true for an existing file', async () => {
    expect(await pfs.exists(path.join(root, 'package.json'))).toBe(true);
  });

  test('exists returns true for an existing directory', async () => {
    expect(await pfs.exists(path.join(root, 'src'))).toBe(true);
  });

  test('exists returns false for a missing path', async () => {
    expect(await pfs.exists(path.join(root, 'does-not-exist.txt'))).toBe(false);
  });

  test('exists accepts a projectDir-relative path', async () => {
    expect(await pfs.exists('package.json')).toBe(true);
    expect(await pfs.exists('src/index.ts')).toBe(true);
    expect(await pfs.exists('nope.txt')).toBe(false);
  });

  test('readText returns UTF-8 content for relative and absolute paths', async () => {
    const viaRel = await pfs.readText('README.md');
    const viaAbs = await pfs.readText(path.join(root, 'README.md'));
    expect(viaRel).toBe('# fixture\n');
    expect(viaAbs).toBe('# fixture\n');
  });

  test('readBytes returns the file content as a Uint8Array', async () => {
    const bytes = await pfs.readBytes('README.md');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe('# fixture\n');
  });

  // ---------------------------------------------------------------------------
  // stat
  // ---------------------------------------------------------------------------

  test('stat returns size, isFile, isDir for a file', async () => {
    const s = await pfs.stat('README.md');
    expect(s).not.toBeNull();
    expect(s?.isFile).toBe(true);
    expect(s?.isDir).toBe(false);
    expect(s?.size).toBeGreaterThan(0);
  });

  test('stat reports isDir for a directory', async () => {
    const s = await pfs.stat('src');
    expect(s).not.toBeNull();
    expect(s?.isDir).toBe(true);
    expect(s?.isFile).toBe(false);
  });

  test('stat returns null for a missing path', async () => {
    const s = await pfs.stat('definitely-missing.xyz');
    expect(s).toBeNull();
  });
});
