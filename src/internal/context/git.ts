import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Resolves the git repository root containing `dir` by running
 * `git -C <dir> rev-parse --show-toplevel`.
 *
 * Returns the absolute, platform-normalized repository root, or null in two
 * cases the ProjectContext contract treats identically:
 *   - `dir` is not inside a git repository, or
 *   - the `git` binary is not available on PATH.
 *
 * git is invoked via execFile with an argument array — never a shell string —
 * so `dir` cannot inject shell syntax.
 */
export async function resolveGitRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      timeout: 5000,
      windowsHide: true,
    });
    const top = stdout.trim();
    return top === '' ? null : path.resolve(top);
  } catch {
    return null;
  }
}
