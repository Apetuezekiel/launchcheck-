import * as path from 'node:path';
import ignore from 'ignore';
import type { IgnoreMatcher } from '../../types/index.js';

/**
 * Directory names pruned by default in every launchcheck run: dependency
 * trees, build outputs, and tool caches that no checker should descend into.
 * Stored as bare directory names. A bare name is added to the matcher as a
 * gitignore pattern that matches the directory entry itself, everything
 * beneath it, and any nested occurrence (e.g. a monorepo's inner
 * node_modules). DefaultProjectFs derives its glob-level prune from the same
 * list, so this is the single source of truth for both.
 */
export const DEFAULT_IGNORE_DIRS: readonly string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.vercel',
  '.output',
];

/**
 * Concrete IgnoreMatcher backed by the `ignore` package, which implements
 * full gitignore pattern semantics (anchoring, negation, `**`, component
 * matching). gitignore semantics are required because ProjectContext.ignore
 * is specified to compose .gitignore content, which a plain glob/minimatch
 * matcher cannot model.
 *
 * Composition: the matcher always seeds the DEFAULT_IGNORE_DIRS prunes, then
 * appends caller-supplied `extraPatterns`. Reading patterns out of .gitignore
 * or .launchcheckrc is NOT this class's responsibility — the future
 * ProjectContext builder passes those lines in via `extraPatterns`. This
 * keeps the matcher a pure, IO-free function of (rootDir, patterns).
 *
 * `ignores()` takes an absolute path, derives its POSIX-relative form against
 * rootDir, and delegates to the `ignore` instance. A path equal to rootDir,
 * or outside it, is never ignored — it is outside the matcher's jurisdiction.
 */
export class DefaultIgnoreMatcher implements IgnoreMatcher {
  private readonly rootDir: string;
  private readonly ig: ReturnType<typeof ignore>;

  constructor(rootDir: string, extraPatterns: string[] = []) {
    this.rootDir = path.resolve(rootDir);
    const patterns = [...DEFAULT_IGNORE_DIRS, ...extraPatterns];
    // allowRelativePaths: return a boolean instead of throwing on an
    // unexpected path shape. ignores() only ever passes clean relative paths.
    this.ig = ignore({ allowRelativePaths: true }).add(patterns);
  }

  ignores(absolutePath: string): boolean {
    const abs = path.resolve(absolutePath);
    const rel = path.relative(this.rootDir, abs);
    // '' => the path IS rootDir. '..'-prefixed or still-absolute => outside
    // rootDir (the absolute case arises across Windows drive letters).
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
    const posixRel = rel.split(path.sep).join('/');
    return this.ig.ignores(posixRel);
  }
}
