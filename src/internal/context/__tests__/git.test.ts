import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resolveGitRoot } from '../git.js';

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
