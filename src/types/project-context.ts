// -----------------------------------------------------------------------------
// Project sub-context (static checks)
// -----------------------------------------------------------------------------

/**
 * File system / repository context. Populated in 'static' and 'combined' modes.
 * Null in 'live' mode.
 */
export interface ProjectContext {
  /** Absolute path to the project directory passed via --config or CLI. */
  projectDir: string;

  /**
   * Absolute path to the git repository root, if projectDir is inside a git
   * repo. Null otherwise. Resolved once at startup via
   * `git -C projectDir rev-parse --show-toplevel`.
   *
   * Three cases:
   *   - gitRoot === projectDir: projectDir IS the repo root.
   *   - gitRoot !== projectDir && gitRoot !== null: projectDir is a
   *     subdirectory of a larger repo (monorepo subpackage). Git-dependent
   *     checkers MUST scope their queries to projectDir
   *     (e.g., `git -C gitRoot ls-files -- <projectDir>/package-lock.json`),
   *     not the whole repo.
   *   - gitRoot === null: projectDir is not in a git repo, OR the `git`
   *     binary is unavailable. Git-dependent checkers MUST emit
   *     status: 'skip' with a message naming the cause.
   */
  gitRoot: string | null;

  /**
   * Parsed package.json from projectDir, if present. Null otherwise.
   * Computed once at startup so checkers don't reparse.
   */
  packageJson: PackageJson | null;

  /**
   * Parsed tsconfig.json from projectDir, if present. Null otherwise.
   */
  tsconfigJson: Record<string, unknown> | null;

  /**
   * Ignore matcher composed from .launchcheckrc `ignore` field, .gitignore,
   * and built-in defaults (node_modules, dist, .next, etc.). Always honored
   * by fs helpers below — checkers should not need to consult it directly
   * unless they bypass the helpers.
   */
  ignore: IgnoreMatcher;

  /**
   * File system helpers, all rooted at projectDir, all honoring `ignore`.
   * Provided so checkers don't reimplement glob/read/exists per module.
   */
  fs: ProjectFs;
}

export interface IgnoreMatcher {
  /** Returns true if the given absolute path is ignored. */
  ignores(absolutePath: string): boolean;
}

export interface ProjectFs {
  /**
   * Returns absolute paths matching the glob pattern, rooted at projectDir.
   * Always filters through IgnoreMatcher. Symlinks not followed.
   */
  glob(pattern: string | string[]): Promise<string[]>;

  /** Returns true if the path exists. Absolute or projectDir-relative. */
  exists(path: string): Promise<boolean>;

  /** Reads a file as UTF-8 text. Absolute or projectDir-relative. */
  readText(path: string): Promise<string>;

  /** Reads a file as binary. Absolute or projectDir-relative. */
  readBytes(path: string): Promise<Uint8Array>;

  /** Stat without throwing on ENOENT — returns null instead. */
  stat(path: string): Promise<{ size: number; isFile: boolean; isDir: boolean } | null>;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  // Open-ended — checkers may read additional fields directly.
  [key: string]: unknown;
}
