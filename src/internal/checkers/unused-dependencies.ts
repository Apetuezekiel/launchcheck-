import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const ID = 'unused-dependencies';
const CAT = 'dependencies' as const;
const SEV = 'info' as const;

const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs}';

const STATIC_IMPORT = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Extracts the bare package name from a module specifier (null for relative/absolute paths). */
function packageNameOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return null;
  }
  if (specifier.startsWith('@')) {
    const slash = specifier.indexOf('/', 1);
    if (slash === -1) return null;
    const next = specifier.indexOf('/', slash + 1);
    return next === -1 ? specifier : specifier.slice(0, next);
  }
  const slash = specifier.indexOf('/');
  return slash === -1 ? specifier : specifier.slice(0, slash);
}

function extractImports(source: string): Set<string> {
  const names = new Set<string>();
  for (const re of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
    re.lastIndex = 0;
    for (const m of source.matchAll(re)) {
      const specifier = m[1];
      if (specifier === undefined) continue;
      const name = packageNameOf(specifier);
      if (name !== null) names.add(name);
    }
  }
  return names;
}

function makeResult(
  status: CheckResult['status'],
  resultId: string,
  message: string,
  extras: { fix?: string; detail?: string } = {},
): CheckResult {
  const r: CheckResult = {
    checkerId: ID,
    resultId,
    status,
    message,
    severity: SEV,
    category: CAT,
  };
  if (extras.fix !== undefined) r.fix = extras.fix;
  if (extras.detail !== undefined) r.detail = extras.detail;
  return r;
}

/**
 * Static checker. Cross-references `package.json` `dependencies` against
 * import/require statements found in source files. Heuristic — false positives
 * are expected for packages used only at build time or via peer resolution.
 *
 * Exclusions:
 *   - `@types/*` packages (compile-time only)
 *   - Deps whose name matches as a whole word in any package.json script value
 *
 * Only `dependencies` is checked; `devDependencies` and `peerDependencies` are
 * intentionally ignored.
 *
 * Outcomes:
 *   - 'skip' 'no-project-context' — ctx.project is null
 *   - 'skip' 'aborted' — signal aborted
 *   - 'pass' 'no-dependencies' — no production dependencies declared
 *   - 'pass' 'all-dependencies-used' — all prod deps found in source or scripts
 *   - 'warn' 'unused-dependencies-found' — one or more prod deps not found (info severity)
 */
export const unusedDependenciesChecker: Checker = {
  id: ID,
  name: 'No unused dependencies',
  category: CAT,
  mode: 'static',

  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const project = ctx.project;
    if (project === null) {
      return [makeResult('skip', 'no-project-context', 'Skipped: no project context.')];
    }
    if (ctx.signal.aborted) {
      return [makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.')];
    }

    const pkg = project.packageJson;
    const rawDeps =
      pkg !== null && typeof pkg.dependencies === 'object' && pkg.dependencies !== null
        ? Object.keys(pkg.dependencies)
        : [];

    const prodDeps = rawDeps.filter((d) => !d.startsWith('@types/'));

    if (prodDeps.length === 0) {
      return [makeResult('pass', 'no-dependencies', 'No production dependencies to check.')];
    }

    const scripts =
      pkg !== null && typeof pkg.scripts === 'object' && pkg.scripts !== null
        ? Object.values(pkg.scripts as Record<string, string>).join(' ')
        : '';

    const scriptReferenced = new Set<string>(
      prodDeps.filter((d) => {
        const escaped = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`).test(scripts);
      }),
    );

    try {
      const files = await project.fs.glob(SOURCE_GLOB);
      const used = new Set<string>();

      for (const absPath of files) {
        if (ctx.signal.aborted) {
          return [makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.')];
        }
        let content: string;
        try {
          content = await project.fs.readText(absPath);
        } catch {
          continue;
        }
        for (const name of extractImports(content)) {
          used.add(name);
        }
      }

      const unused = prodDeps.filter((d) => !used.has(d) && !scriptReferenced.has(d));

      if (unused.length === 0) {
        return [
          makeResult(
            'pass',
            'all-dependencies-used',
            'All production dependencies are referenced in source.',
          ),
        ];
      }

      return [
        makeResult(
          'warn',
          'unused-dependencies-found',
          `${unused.length} production dependency/dependencies may be unused: ${unused.join(', ')}.`,
          {
            detail: unused.join('\n'),
            fix: 'Remove unused dependencies with `npm uninstall <pkg>` or verify they are used indirectly (e.g. via a plugin or peer resolution).',
          },
        ),
      ];
    } catch (err) {
      return [
        makeResult(
          'fail',
          '__error__',
          `unused-dependencies failed: ${err instanceof Error ? err.message : String(err)}`,
          {
            fix: 'Re-run the scan; if it keeps failing, verify the project directory is readable.',
          },
        ),
      ];
    }
  },
};
