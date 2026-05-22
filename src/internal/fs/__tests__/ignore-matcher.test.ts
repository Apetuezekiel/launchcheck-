import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import { DefaultIgnoreMatcher } from '../ignore-matcher.js';

/**
 * Cross-platform notional root. path.resolve makes it absolute against the
 * test process cwd, but no IO touches it — DefaultIgnoreMatcher is pure
 * path logic.
 */
const ROOT = path.resolve('/tmp/launchcheck-ignore-matcher-test-root');

/** Convenience: build an absolute path under ROOT from POSIX-style segments. */
function under(...segments: string[]): string {
  return path.join(ROOT, ...segments);
}

describe('DefaultIgnoreMatcher', () => {
  // ---------------------------------------------------------------------------
  // Default prunes
  // ---------------------------------------------------------------------------

  test('ignores a file inside node_modules', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    expect(m.ignores(under('node_modules', 'pkg', 'index.js'))).toBe(true);
  });

  test('ignores the node_modules directory entry itself', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    expect(m.ignores(under('node_modules'))).toBe(true);
  });

  test('ignores files inside dist, build, and out', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    expect(m.ignores(under('dist', 'bundle.js'))).toBe(true);
    expect(m.ignores(under('build', 'asset.css'))).toBe(true);
    expect(m.ignores(under('out', 'page.html'))).toBe(true);
  });

  test('ignores files inside .git, .next, and coverage', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    expect(m.ignores(under('.git', 'HEAD'))).toBe(true);
    expect(m.ignores(under('.next', 'build-manifest.json'))).toBe(true);
    expect(m.ignores(under('coverage', 'lcov.info'))).toBe(true);
  });

  test('ignores a nested occurrence of a default dir (monorepo inner node_modules)', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    expect(m.ignores(under('packages', 'a', 'node_modules', 'pkg', 'index.js'))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Non-matches
  // ---------------------------------------------------------------------------

  test('does not ignore a normal source file', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    expect(m.ignores(under('src', 'index.ts'))).toBe(false);
  });

  test('does not substring-match a default dir name (src/layout.ts not ignored by "out")', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    expect(m.ignores(under('src', 'layout.ts'))).toBe(false);
    expect(m.ignores(under('src', 'checkout', 'index.ts'))).toBe(false);
  });

  test('does not ignore rootDir itself', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    expect(m.ignores(ROOT)).toBe(false);
  });

  test('does not ignore a path outside rootDir', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    const outside = path.resolve(ROOT, '..', 'other-project', 'src', 'foo.ts');
    expect(m.ignores(outside)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Extra patterns
  // ---------------------------------------------------------------------------

  test('ignores a file matching an extra glob pattern', () => {
    const m = new DefaultIgnoreMatcher(ROOT, ['*.log']);
    expect(m.ignores(under('debug.log'))).toBe(true);
    expect(m.ignores(under('src', 'app.ts'))).toBe(false);
  });

  test('un-ignores a file via an extra negation pattern', () => {
    const m = new DefaultIgnoreMatcher(ROOT, ['*.log', '!keep.log']);
    expect(m.ignores(under('debug.log'))).toBe(true);
    expect(m.ignores(under('keep.log'))).toBe(false);
  });

  test('extra patterns match relative to rootDir, not the absolute prefix', () => {
    // A pattern anchored at the root should match only at the root.
    const m = new DefaultIgnoreMatcher(ROOT, ['/secret.env']);
    expect(m.ignores(under('secret.env'))).toBe(true);
    expect(m.ignores(under('src', 'secret.env'))).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Path handling
  // ---------------------------------------------------------------------------

  test('handles paths built with the platform separator', () => {
    const m = new DefaultIgnoreMatcher(ROOT);
    // path.join uses the platform separator; the matcher must normalize it
    // to POSIX internally before delegating to `ignore`.
    const p = path.join(ROOT, 'node_modules', 'pkg', 'index.js');
    expect(m.ignores(p)).toBe(true);
  });
});
