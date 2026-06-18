import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { isGitTracked, resolveGitRoot } from '../git.js';

const execFileAsync = promisify(execFile);

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-git-root-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/**
 * Initialize a git repo at `dir`. Returns true on success, false when git is
 * not available — tests use the false return as a signal to skip the
 * assertion rather than fail.
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

describe('resolveGitRoot', () => {
  test('returns the repository root for a freshly initialized repo', async () => {
    if (!(await tryGitInit(root))) return;
    const result = await resolveGitRoot(root);
    expect(result).not.toBeNull();
    // os.tmpdir() may be symlinked on macOS; compare resolved real paths.
    const expectedReal = await fs.realpath(root);
    const actualReal = await fs.realpath(result as string);
    expect(actualReal).toBe(expectedReal);
  });

  test('returns the repository root when called from a nested subdirectory', async () => {
    if (!(await tryGitInit(root))) return;
    const nested = path.join(root, 'src', 'util');
    await fs.mkdir(nested, { recursive: true });
    const result = await resolveGitRoot(nested);
    expect(result).not.toBeNull();
    const expectedReal = await fs.realpath(root);
    const actualReal = await fs.realpath(result as string);
    expect(actualReal).toBe(expectedReal);
  });

  test('returns null for a directory not inside any git repository', async () => {
    // The temp dir was just created and contains no .git anywhere up the tree
    // on a typical CI/dev box. If the test happens to run with $TMPDIR inside
    // a repo (unusual), the assertion would fire incorrectly — but with the
    // OS temp dir on Windows (C:\Users\<u>\AppData\Local\Temp), macOS
    // (/var/folders/...) and Linux (/tmp) this is reliable. The dispatch
    // accepts this assumption.
    const result = await resolveGitRoot(root);
    expect(result).toBeNull();
  });
});

describe('isGitTracked', () => {
  test('returns true for a staged-but-uncommitted file', async () => {
    if (!(await tryGitInit(root))) return;
    await fs.writeFile(path.join(root, 'package-lock.json'), '{}\n');
    await execFileAsync('git', ['-C', root, 'add', 'package-lock.json'], {
      timeout: 5000,
      windowsHide: true,
    });
    expect(await isGitTracked(root, path.join(root, 'package-lock.json'))).toBe(true);
  });

  test('returns true when called with a relative path', async () => {
    if (!(await tryGitInit(root))) return;
    await fs.writeFile(path.join(root, 'yarn.lock'), '\n');
    await execFileAsync('git', ['-C', root, 'add', 'yarn.lock'], {
      timeout: 5000,
      windowsHide: true,
    });
    expect(await isGitTracked(root, 'yarn.lock')).toBe(true);
  });

  test('returns false for a file that exists on disk but is not staged', async () => {
    if (!(await tryGitInit(root))) return;
    await fs.writeFile(path.join(root, 'package-lock.json'), '{}\n');
    expect(await isGitTracked(root, path.join(root, 'package-lock.json'))).toBe(false);
  });

  test('returns false for a file that does not exist at all', async () => {
    if (!(await tryGitInit(root))) return;
    expect(await isGitTracked(root, path.join(root, 'package-lock.json'))).toBe(false);
  });

  test('returns false for a path that resolves outside gitRoot', async () => {
    if (!(await tryGitInit(root))) return;
    const outside = path.resolve(root, '..', 'definitely-outside.txt');
    expect(await isGitTracked(root, outside)).toBe(false);
  });

  test('returns false when called against a non-repo directory (git exits non-zero)', async () => {
    // No tryGitInit — root has no .git. git ls-files inside fails;
    // helper swallows the error and returns false.
    await fs.writeFile(path.join(root, 'package-lock.json'), '{}\n');
    expect(await isGitTracked(root, 'package-lock.json')).toBe(false);
  });

  test('returns true for a nested tracked file (resolves through subdirectories)', async () => {
    if (!(await tryGitInit(root))) return;
    const nested = path.join(root, 'apps', 'web');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, 'package-lock.json'), '{}\n');
    await execFileAsync('git', ['-C', root, 'add', 'apps/web/package-lock.json'], {
      timeout: 5000,
      windowsHide: true,
    });
    expect(await isGitTracked(root, path.join(nested, 'package-lock.json'))).toBe(true);
  });
});
