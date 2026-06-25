import { describe, expect, test } from 'vitest';
import type { PackageJson, ProjectContext } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import {
  type DependenciesOutdatedDeps,
  dependenciesOutdatedChecker,
  runDependenciesOutdated,
} from '../dependencies-outdated.js';
import { makeProjectContext, makeStaticContext } from './context.js';

const ROOT = '/tmp/does-not-matter';

function ctxWith(pkg: PackageJson | null) {
  const project: ProjectContext = { ...makeProjectContext(ROOT), packageJson: pkg };
  return makeStaticContext(project);
}

function deps(over: Partial<DependenciesOutdatedDeps>): DependenciesOutdatedDeps {
  return {
    detectPm: async () => 'npm',
    runOutdated: async () => ({ stdout: '{}', exitCode: 0 }),
    getDeprecation: async () => null,
    ...over,
  };
}

describe('dependenciesOutdatedChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('dependencies-outdated');
    expect(dependenciesOutdatedChecker.id).toBe(e?.id);
    expect(dependenciesOutdatedChecker.mode).toBe(e?.mode);
    expect(dependenciesOutdatedChecker.category).toBe(e?.category);
  });

  test('skip when no project context', async () => {
    const ctx = { ...ctxWith({}), project: null };
    const r = await runDependenciesOutdated(ctx, deps({}));
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('no-project-context');
  });

  test('pass when no dependencies', async () => {
    const r = await runDependenciesOutdated(ctxWith({ name: 'x' }), deps({}));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('no-dependencies');
  });

  test('skip registry-unreachable when every deprecation lookup fails', async () => {
    const r = await runDependenciesOutdated(
      ctxWith({ dependencies: { a: '^1', b: '^1' } }),
      deps({
        getDeprecation: async () => {
          throw new Error('ENOTFOUND');
        },
      }),
    );
    expect(r[0]?.status).toBe('skip');
    expect(r[0]?.resultId).toBe('registry-unreachable');
  });

  test('warn deprecated (major) takes priority over outdated', async () => {
    const r = await runDependenciesOutdated(
      ctxWith({ dependencies: { left: '^1', other: '^1' } }),
      deps({
        getDeprecation: async (name) => (name === 'left' ? 'use right instead' : null),
        runOutdated: async () => ({
          stdout: JSON.stringify({ other: { current: '1.0.0', latest: '2.0.0' } }),
          exitCode: 1,
        }),
      }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('deprecated-dependencies');
    expect(r[0]?.severity).toBe('major');
    expect(r[0]?.detail).toContain('left');
  });

  test('warn outdated (info) when none deprecated', async () => {
    const r = await runDependenciesOutdated(
      ctxWith({ dependencies: { other: '^1' } }),
      deps({
        runOutdated: async () => ({
          stdout: JSON.stringify({ other: { current: '1.0.0', latest: '2.0.0' } }),
          exitCode: 1,
        }),
      }),
    );
    expect(r[0]?.status).toBe('warn');
    expect(r[0]?.resultId).toBe('outdated-dependencies');
    expect(r[0]?.severity).toBe('info');
  });

  test('pass when current and none deprecated', async () => {
    const r = await runDependenciesOutdated(ctxWith({ dependencies: { other: '^1' } }), deps({}));
    expect(r[0]?.status).toBe('pass');
    expect(r[0]?.resultId).toBe('dependencies-current');
  });
});

describe('dependenciesOutdatedChecker — package-manager breadth', () => {
  test('pnpm outdated object shape is parsed (info)', async () => {
    const r = await runDependenciesOutdated(
      ctxWith({ dependencies: { minimist: '^1' } }),
      deps({
        detectPm: async () => 'pnpm',
        runOutdated: async (pm) => {
          expect(pm).toBe('pnpm');
          return {
            stdout: JSON.stringify({
              minimist: {
                current: '1.2.0',
                latest: '1.2.8',
                wanted: '1.2.0',
                dependencyType: 'dependencies',
              },
            }),
            exitCode: 1,
          };
        },
      }),
    );
    expect(r[0]?.resultId).toBe('outdated-dependencies');
    expect(r[0]?.detail).toContain('minimist');
  });

  test('yarn classic NDJSON table shape is parsed (info)', async () => {
    const yarnNdjson = [
      JSON.stringify({ type: 'info', data: 'legend' }),
      JSON.stringify({
        type: 'table',
        data: {
          head: ['Package', 'Current', 'Wanted', 'Latest', 'Package Type', 'URL'],
          body: [['minimist', '1.2.0', '1.2.0', '1.2.8', 'dependencies', 'https://x']],
        },
      }),
    ].join('\n');
    const r = await runDependenciesOutdated(
      ctxWith({ dependencies: { minimist: '^1' } }),
      deps({
        detectPm: async () => 'yarn',
        runOutdated: async () => ({ stdout: yarnNdjson, exitCode: 1 }),
      }),
    );
    expect(r[0]?.resultId).toBe('outdated-dependencies');
    expect(r[0]?.detail).toContain('minimist');
  });

  test('no lockfile → outdated check skipped, still passes on current deps', async () => {
    const r = await runDependenciesOutdated(
      ctxWith({ dependencies: { other: '^1' } }),
      deps({
        detectPm: async () => null,
        runOutdated: async () => {
          throw new Error('should not run without a lockfile');
        },
      }),
    );
    expect(r[0]?.resultId).toBe('dependencies-current');
  });
});
