import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { type NpmAuditDeps, npmAuditChecker, runNpmAudit } from '../npm-audit.js';
import type { PackageManager } from '../support/package-manager.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-npm-audit-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const writeLock = (file: string) => fs.writeFile(path.join(root, file), '{}');

function deps(
  impl: (
    pm: PackageManager,
    cwd: string,
    signal: AbortSignal,
  ) => Promise<{ stdout: string; exitCode: number }>,
): NpmAuditDeps {
  return { runAudit: impl };
}

// npm/pnpm shape (verified against real `npm audit --json` / `pnpm audit --json`).
function npmShape(vulns: { critical?: number; high?: number }): string {
  return JSON.stringify({ metadata: { vulnerabilities: { critical: 0, high: 0, ...vulns } } });
}

// yarn classic shape: newline-delimited JSON ending in an auditSummary line
// (verified against real `yarn audit --json`, yarn 1.22).
function yarnShape(vulns: { critical?: number; high?: number }): string {
  return [
    JSON.stringify({ type: 'auditAdvisory', data: { advisory: { severity: 'critical' } } }),
    JSON.stringify({
      type: 'auditSummary',
      data: { vulnerabilities: { info: 0, low: 0, moderate: 0, critical: 0, high: 0, ...vulns } },
    }),
  ].join('\n');
}

describe('npmAuditChecker', () => {
  test('id, category, and mode match the registry entry', () => {
    const entry = findById('npm-audit');
    expect(entry).toBeDefined();
    expect(npmAuditChecker.id).toBe(entry?.id);
    expect(npmAuditChecker.category).toBe(entry?.category);
    expect(npmAuditChecker.mode).toBe(entry?.mode);
  });

  test('skip no-project-context when ctx.project is null', async () => {
    const base = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit({ ...base, project: null });
    expect(results[0]?.resultId).toBe('no-project-context');
  });

  test('skip no-lockfile when no recognized lockfile present', async () => {
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async () => {
        throw new Error('should not be called');
      }),
    );
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-lockfile');
  });

  test('npm lockfile → parses metadata.vulnerabilities (pass)', async () => {
    await writeLock('package-lock.json');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async (pm) => ({ stdout: npmShape({}), exitCode: pm === 'npm' ? 0 : 99 })),
    );
    expect(results[0]?.resultId).toBe('no-critical-or-high');
  });

  test('pnpm lockfile → same metadata shape, critical fail tagged pnpm', async () => {
    await writeLock('pnpm-lock.yaml');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async (pm) => {
        expect(pm).toBe('pnpm');
        return { stdout: npmShape({ critical: 1 }), exitCode: 1 };
      }),
    );
    expect(results[0]?.resultId).toBe('critical-vulnerabilities');
    expect(results[0]?.message).toContain('pnpm');
  });

  test('yarn lockfile → parses NDJSON auditSummary (critical + high)', async () => {
    await writeLock('yarn.lock');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async (pm) => {
        expect(pm).toBe('yarn');
        return { stdout: yarnShape({ critical: 1, high: 2 }), exitCode: 1 };
      }),
    );
    const ids = results.map((r) => r.resultId);
    expect(ids).toContain('critical-vulnerabilities');
    expect(ids).toContain('high-vulnerabilities');
    expect(results.find((r) => r.resultId === 'high-vulnerabilities')?.message).toContain('yarn');
  });

  test('precedence: pnpm-lock wins over package-lock', async () => {
    await writeLock('package-lock.json');
    await writeLock('pnpm-lock.yaml');
    const ctx = makeStaticContext(makeProjectContext(root));
    let seen: PackageManager | undefined;
    await runNpmAudit(
      ctx,
      deps(async (pm) => {
        seen = pm;
        return { stdout: npmShape({}), exitCode: 0 };
      }),
    );
    expect(seen).toBe('pnpm');
  });

  test('fail audit-runtime-error when subprocess throws', async () => {
    await writeLock('package-lock.json');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async () => {
        throw new Error('ENOENT: npm not found');
      }),
    );
    expect(results[0]?.resultId).toBe('audit-runtime-error');
    expect(results[0]?.message).toContain('ENOENT');
  });

  test('fail audit-runtime-error on unparseable yarn output', async () => {
    await writeLock('yarn.lock');
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async () => ({ stdout: 'not json\n', exitCode: 1 })),
    );
    expect(results[0]?.resultId).toBe('audit-runtime-error');
  });
});
