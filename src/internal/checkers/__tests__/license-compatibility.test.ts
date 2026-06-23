import { describe, expect, test } from 'vitest';
import type { ProjectContext } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import {
  type InstalledPackage,
  type LicenseCompatibilityDeps,
  licenseCompatibilityChecker,
  runLicenseCompatibility,
} from '../license-compatibility.js';
import { makeProjectContext, makeStaticContext } from './context.js';

const ROOT = '/tmp/does-not-matter';

function ctx(checkerOptions: Record<string, unknown> = {}) {
  const project: ProjectContext = makeProjectContext(ROOT);
  const base = makeStaticContext(project);
  return { ...base, config: { ...base.config, checkerOptions } };
}

function deps(packages: InstalledPackage[]): LicenseCompatibilityDeps {
  return { readInstalledPackages: async () => packages };
}

describe('licenseCompatibilityChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('license-compatibility');
    expect(licenseCompatibilityChecker.id).toBe(e?.id);
    expect(licenseCompatibilityChecker.mode).toBe(e?.mode);
    expect(licenseCompatibilityChecker.category).toBe(e?.category);
  });

  test('skip when no project context', async () => {
    const base = ctx();
    const r = await runLicenseCompatibility({ ...base, project: null }, deps([]));
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-project-context');
  });

  test('skip when treatProprietaryAsDefault is false', async () => {
    const r = await runLicenseCompatibility(
      ctx({ 'license-compatibility': { treatProprietaryAsDefault: false } }),
      deps([{ name: 'gpl-lib', license: 'GPL-3.0' }]),
    );
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('not-proprietary');
  });

  test('skip when no node_modules', async () => {
    const r = await runLicenseCompatibility(ctx(), deps([]));
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-node-modules');
  });

  test('fail on copyleft license (GPL/AGPL/LGPL); SPDX expression token match', async () => {
    const r = await runLicenseCompatibility(
      ctx(),
      deps([
        { name: 'ok-lib', license: 'MIT' },
        { name: 'gpl-lib', license: 'GPL-3.0-only' },
        { name: 'expr-lib', license: 'MIT OR LGPL-2.1' },
      ]),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('copyleft-licenses');
    expect(r[0]?.detail).toContain('gpl-lib');
    expect(r[0]?.detail).toContain('expr-lib');
    expect(r[0]?.detail).not.toContain('ok-lib');
  });

  test('pass when all permissive', async () => {
    const r = await runLicenseCompatibility(
      ctx(),
      deps([
        { name: 'a', license: 'MIT' },
        { name: 'b', license: 'Apache-2.0' },
        { name: 'c', license: null },
      ]),
    );
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('licenses-compatible');
  });

  test('honors custom denyList', async () => {
    const r = await runLicenseCompatibility(
      ctx({ 'license-compatibility': { denyList: ['CC-BY-NC'] } }),
      deps([
        { name: 'gpl-lib', license: 'GPL-3.0' },
        { name: 'nc-lib', license: 'CC-BY-NC-4.0' },
      ]),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.detail).toContain('nc-lib');
    expect(r[0]?.detail).not.toContain('gpl-lib');
  });
});
