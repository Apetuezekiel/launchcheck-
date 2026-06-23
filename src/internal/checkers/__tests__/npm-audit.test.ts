import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { type NpmAuditDeps, npmAuditChecker, runNpmAudit } from '../npm-audit.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-npm-audit-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function writeLockfile(): Promise<void> {
  await fs.writeFile(path.join(root, 'package-lock.json'), '{}');
}

function deps(
  impl: (cwd: string, signal: AbortSignal) => Promise<{ stdout: string; exitCode: number }>,
): NpmAuditDeps {
  return { runNpmAudit: impl };
}

function auditJson(vulns: { critical?: number; high?: number }): string {
  return JSON.stringify({ metadata: { vulnerabilities: { critical: 0, high: 0, ...vulns } } });
}

describe('npmAuditChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('npm-audit');
    expect(entry).toBeDefined();
    expect(npmAuditChecker.id).toBe(entry?.id);
    expect(npmAuditChecker.name).toBe(entry?.name);
    expect(npmAuditChecker.category).toBe(entry?.category);
    expect(npmAuditChecker.mode).toBe(entry?.mode);
  });

  test('skip no-project-context when ctx.project is null', async () => {
    const base = makeStaticContext(makeProjectContext(root));
    const ctx = { ...base, project: null };
    const results = await runNpmAudit(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-project-context');
  });

  test('skip no-npm-lockfile when no lockfile present', async () => {
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async () => {
        throw new Error('should not be called');
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-npm-lockfile');
  });

  test('pass no-critical-or-high when audit finds no critical or high vulns', async () => {
    await writeLockfile();
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async () => ({ stdout: auditJson({}), exitCode: 0 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('no-critical-or-high');
  });

  test('fail critical-vulnerabilities when critical vulns present', async () => {
    await writeLockfile();
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async () => ({ stdout: auditJson({ critical: 2 }), exitCode: 1 })),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('critical-vulnerabilities');
    expect(results[0]?.message).toContain('2');
    expect(results[0]?.severity).toBe('critical');
    expect((results[0]?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('both critical and high vulns produce two results', async () => {
    await writeLockfile();
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async () => ({ stdout: auditJson({ critical: 1, high: 3 }), exitCode: 1 })),
    );
    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.resultId);
    expect(ids).toContain('critical-vulnerabilities');
    expect(ids).toContain('high-vulnerabilities');
    const high = results.find((r) => r.resultId === 'high-vulnerabilities');
    expect(high?.status).toBe('warn');
    expect(high?.severity).toBe('major');
  });

  test('fail audit-runtime-error when subprocess throws', async () => {
    await writeLockfile();
    const ctx = makeStaticContext(makeProjectContext(root));
    const results = await runNpmAudit(
      ctx,
      deps(async () => {
        throw new Error('ENOENT: npm not found');
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('audit-runtime-error');
    expect(results[0]?.message).toContain('ENOENT');
  });
});
