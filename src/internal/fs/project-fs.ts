import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob as runGlob } from 'glob';
import type { IgnoreMatcher, ProjectFs } from '../../types/index.js';
import { DEFAULT_IGNORE_DIRS } from './ignore-matcher.js';

/**
 * Glob-syntax prune list derived from DEFAULT_IGNORE_DIRS. Passed to the
 * glob call purely as a traversal-performance optimization so it does not
 * descend dependency and build trees. This is NOT the authoritative ignore
 * filter: DefaultProjectFs.glob() always post-filters glob output through
 * the injected IgnoreMatcher, which is the single source of truth. The
 * prune is a strict performance subset of what the matcher enforces.
 */
const GLOB_PRUNE: readonly string[] = DEFAULT_IGNORE_DIRS.map((dir) => `**/${dir}/**`);

/**
 * Concrete ProjectFs over `node:fs` and the `glob` library API. Every
 * operation is rooted at projectDir; a relative path passed to exists,
 * readText, readBytes, or stat is resolved against projectDir, an absolute
 * path is used as-is.
 *
 * Only glob() consults the IgnoreMatcher. Per the per-method ProjectFs
 * contract, the direct read helpers operate on whatever path the caller
 * already holds and do not second-guess it. (The interface's summary line
 * is looser than its per-method docs; the per-method docs govern.)
 */
export class DefaultProjectFs implements ProjectFs {
  private readonly projectDir: string;
  private readonly ignore: IgnoreMatcher;

  constructor(projectDir: string, ignore: IgnoreMatcher) {
    this.projectDir = path.resolve(projectDir);
    this.ignore = ignore;
  }

  async glob(pattern: string | string[]): Promise<string[]> {
    const matches = await runGlob(pattern, {
      cwd: this.projectDir,
      absolute: true,
      nodir: true,
      dot: true,
      follow: false,
      ignore: [...GLOB_PRUNE],
    });
    const filtered = matches
      .map((match) => path.resolve(match))
      .filter((abs) => !this.ignore.ignores(abs));
    filtered.sort();
    return filtered;
  }

  async exists(p: string): Promise<boolean> {
    try {
      await fs.access(this.resolvePath(p));
      return true;
    } catch {
      return false;
    }
  }

  async readText(p: string): Promise<string> {
    return fs.readFile(this.resolvePath(p), 'utf8');
  }

  async readBytes(p: string): Promise<Uint8Array> {
    const buf = await fs.readFile(this.resolvePath(p));
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  async stat(p: string): Promise<{ size: number; isFile: boolean; isDir: boolean } | null> {
    try {
      const s = await fs.stat(this.resolvePath(p));
      return { size: s.size, isFile: s.isFile(), isDir: s.isDirectory() };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw err;
    }
  }

  private resolvePath(p: string): string {
    return path.resolve(this.projectDir, p);
  }
}
