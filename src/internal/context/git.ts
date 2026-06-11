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

/**
 * Checks whether `filePath` is git-tracked (in the index, i.e. either
 * already committed or staged) inside the repository rooted at `gitRoot`.
 *
 * `filePath` may be absolute or relative; it is resolved against `gitRoot`
 * before being passed to git. A path that resolves outside `gitRoot` is
 * treated as untracked — git only knows about files inside its own work
 * tree.
 *
 * Returns false in every failure case (file outside gitRoot, git binary
 * missing, git exits non-zero, file not staged or committed), so callers
 * only need a boolean. Errors are intentionally swallowed because the
 * caller cannot meaningfully distinguish "file is untracked" from "git
 * is broken" — both produce the same observable answer for the checker.
 *
 * git is invoked via execFile with an argument array, never a shell
 * string; the `--` separator before the path further protects against
 * a pathological filename being interpreted as a flag.
 */
export async function isGitTracked(gitRoot: string, filePath: string): Promise<boolean> {
  try {
    const absoluteFilePath = path.resolve(gitRoot, filePath);
    const relFromGitRoot = path.relative(gitRoot, absoluteFilePath);
    if (
      relFromGitRoot === '' ||
      relFromGitRoot.startsWith('..') ||
      path.isAbsolute(relFromGitRoot)
    ) {
      // Outside the work tree — git would never report this as tracked.
      return false;
    }
    const relPosix = relFromGitRoot.split(path.sep).join('/');
    const { stdout } = await execFileAsync('git', ['-C', gitRoot, 'ls-files', '--', relPosix], {
      timeout: 5000,
      windowsHide: true,
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}
