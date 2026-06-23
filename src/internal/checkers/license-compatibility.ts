import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type {
  CheckContext,
  CheckResult,
  Checker,
  LicenseCompatibilityOptions,
} from '../../types/index.js';

const CHECKER_ID = 'license-compatibility';
const CATEGORY = 'dependencies' as const;
const SEVERITY = 'major' as const;

const DEFAULT_DENY: ReadonlyArray<string> = ['AGPL', 'LGPL', 'GPL'];

export interface InstalledPackage {
  name: string;
  license: string | null;
}

/** Dependencies — injectable for tests (no disk walk in unit tests). */
export interface LicenseCompatibilityDeps {
  /**
   * Enumerates installed packages under `<projectDir>/node_modules`, returning
   * each package's name and declared SPDX license (null when undeclared).
   * Returns [] when node_modules is absent.
   */
  readInstalledPackages(projectDir: string, signal: AbortSignal): Promise<InstalledPackage[]>;
}

const DEFAULT_DEPS: LicenseCompatibilityDeps = {
  readInstalledPackages: defaultReadInstalledPackages,
};

interface PackageJsonLicense {
  license?: unknown;
  licenses?: unknown;
}

function extractLicense(pkg: PackageJsonLicense): string | null {
  if (typeof pkg.license === 'string') {
    return pkg.license;
  }
  // Legacy: { license: { type } } or { licenses: [{ type }] }.
  if (typeof pkg.license === 'object' && pkg.license !== null) {
    const t = (pkg.license as { type?: unknown }).type;
    if (typeof t === 'string') {
      return t;
    }
  }
  if (Array.isArray(pkg.licenses)) {
    const first = pkg.licenses[0];
    if (typeof first === 'object' && first !== null) {
      const t = (first as { type?: unknown }).type;
      if (typeof t === 'string') {
        return t;
      }
    }
  }
  return null;
}

async function readPackageLicense(pkgDir: string): Promise<string | null> {
  try {
    const raw = await fsp.readFile(path.join(pkgDir, 'package.json'), 'utf8');
    return extractLicense(JSON.parse(raw) as PackageJsonLicense);
  } catch {
    return null;
  }
}

async function defaultReadInstalledPackages(
  projectDir: string,
  signal: AbortSignal,
): Promise<InstalledPackage[]> {
  const nodeModules = path.join(projectDir, 'node_modules');
  let entries: string[];
  try {
    entries = await fsp.readdir(nodeModules);
  } catch {
    return []; // node_modules absent
  }
  const packages: InstalledPackage[] = [];
  for (const entry of entries) {
    if (signal.aborted || entry === '.bin' || entry === '.cache') {
      continue;
    }
    if (entry.startsWith('@')) {
      let scoped: string[];
      try {
        scoped = await fsp.readdir(path.join(nodeModules, entry));
      } catch {
        continue;
      }
      for (const sub of scoped) {
        const name = `${entry}/${sub}`;
        packages.push({
          name,
          license: await readPackageLicense(path.join(nodeModules, entry, sub)),
        });
      }
      continue;
    }
    if (entry.startsWith('.')) {
      continue;
    }
    packages.push({
      name: entry,
      license: await readPackageLicense(path.join(nodeModules, entry)),
    });
  }
  return packages;
}

function readOptions(ctx: CheckContext): LicenseCompatibilityOptions {
  const raw = ctx.config.checkerOptions['license-compatibility'];
  return typeof raw === 'object' && raw !== null ? (raw as LicenseCompatibilityOptions) : {};
}

/** A license string is denied if any of its tokens starts with a denied prefix. */
function isDenied(license: string, denyList: ReadonlyArray<string>): boolean {
  const tokens = license
    .toUpperCase()
    .split(/[^A-Z0-9.+-]+/)
    .filter((t) => t.length > 0);
  return tokens.some((token) => denyList.some((prefix) => token.startsWith(prefix.toUpperCase())));
}

function makeResult(
  status: CheckResult['status'],
  resultId: string,
  message: string,
  extras: { fix?: string; detail?: string } = {},
): CheckResult {
  const result: CheckResult = {
    checkerId: CHECKER_ID,
    resultId,
    status,
    severity: SEVERITY,
    message,
    category: CATEGORY,
  };
  if (extras.fix !== undefined) {
    result.fix = extras.fix;
  }
  if (extras.detail !== undefined) {
    result.detail = extras.detail;
  }
  return result;
}

/**
 * Static checker core. Walks installed packages (via the injected dep) and
 * flags copyleft licenses against a deny-list. Emits a single result:
 *   - 'skip' 'no-project-context' / 'aborted'
 *   - 'skip' 'not-proprietary' when treatProprietaryAsDefault === false
 *   - 'skip' 'no-node-modules' when no packages are installed
 *   - 'fail' 'copyleft-licenses' (major) when a denied license is found
 *   - 'pass' 'licenses-compatible' otherwise
 */
export async function runLicenseCompatibility(
  ctx: CheckContext,
  deps: LicenseCompatibilityDeps = DEFAULT_DEPS,
): Promise<CheckResult[]> {
  const project = ctx.project;
  if (project === null) {
    return [makeResult('skip', 'no-project-context', 'Skipped: no project context.')];
  }
  try {
    if (ctx.signal.aborted) {
      return [makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.')];
    }

    const options = readOptions(ctx);
    if (options.treatProprietaryAsDefault === false) {
      return [
        makeResult(
          'skip',
          'not-proprietary',
          'Skipped: project declared non-proprietary (treatProprietaryAsDefault: false).',
        ),
      ];
    }

    const denyList =
      Array.isArray(options.denyList) && options.denyList.length > 0
        ? options.denyList
        : DEFAULT_DENY;

    const installed = await deps.readInstalledPackages(project.projectDir, ctx.signal);
    if (installed.length === 0) {
      return [
        makeResult(
          'skip',
          'no-node-modules',
          'Skipped: no installed packages found (run `npm install` to check licenses).',
        ),
      ];
    }

    const denied = installed.filter((p) => p.license !== null && isDenied(p.license, denyList));
    if (denied.length > 0) {
      const detail = denied.map((p) => `${p.name}: ${p.license ?? 'unknown'}`).join('\n');
      return [
        makeResult(
          'fail',
          'copyleft-licenses',
          `${denied.length} dependency(ies) use a copyleft license (deny-list: ${denyList.join(', ')}).`,
          {
            detail,
            fix: 'Replace the package(s), obtain a commercial license, or set `treatProprietaryAsDefault: false` if this project is itself copyleft.',
          },
        ),
      ];
    }

    return [
      makeResult(
        'pass',
        'licenses-compatible',
        `No copyleft licenses among ${installed.length} installed package(s).`,
      ),
    ];
  } catch (err) {
    return [
      makeResult(
        'fail',
        '__error__',
        `license-compatibility failed: ${err instanceof Error ? err.message : String(err)}`,
        { fix: 'Re-run the scan; if it keeps failing, verify node_modules is readable.' },
      ),
    ];
  }
}

export const licenseCompatibilityChecker: Checker = {
  id: CHECKER_ID,
  name: 'No copyleft licenses in proprietary projects',
  category: CATEGORY,
  mode: 'static',
  run: (ctx) => runLicenseCompatibility(ctx),
};
