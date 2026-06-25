import * as path from 'node:path';
import type { ProjectContext } from '../../../types/index.js';

/** The package managers launchcheck can drive for dependency checks. */
export type PackageManager = 'npm' | 'pnpm' | 'yarn';

/** Lockfile → package manager, in detection precedence order. */
const LOCKFILES: ReadonlyArray<{ name: PackageManager; file: string }> = [
  { name: 'pnpm', file: 'pnpm-lock.yaml' },
  { name: 'yarn', file: 'yarn.lock' },
  { name: 'npm', file: 'package-lock.json' },
  { name: 'npm', file: 'npm-shrinkwrap.json' },
];

export interface DetectedPackageManager {
  name: PackageManager;
  /** The lockfile that identified it (relative name). */
  lockfile: string;
}

/**
 * Detects the project's package manager from its lockfile. Precedence:
 * pnpm-lock.yaml → yarn.lock → package-lock.json → npm-shrinkwrap.json.
 * Returns null when no recognized lockfile is present (the caller skips).
 */
export async function detectPackageManager(
  project: ProjectContext,
): Promise<DetectedPackageManager | null> {
  for (const { name, file } of LOCKFILES) {
    if (await project.fs.exists(path.join(project.projectDir, file))) {
      return { name, lockfile: file };
    }
  }
  return null;
}

/** The CLI binary for a package manager (Windows uses the .cmd shim). */
export function packageManagerBin(pm: PackageManager): string {
  return process.platform === 'win32' ? `${pm}.cmd` : pm;
}
