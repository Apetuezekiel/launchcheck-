import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { lockfileCommittedChecker } from '../lockfile-committed.js';
import { makeProjectContext, makeStaticContext } from './context.js';

const execFileAsync = promisify(execFile);

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-lockfile-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content = ''): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

/** Init a git repo at root. Returns false (test should skip) when git absent. */
async function tryGitInit(dir: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', dir, 'init', '--quiet'], {
      timeout: 5000,
      windowsHide: true,
    });
    // Make commit author deterministic for environments without global config.
    await execFileAsync('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
    await execFileAsync('git', ['-C', dir, 'config', 'user.name', 'Test']);
    return true;
  } catch {
    return false;
  }
}

async function gitAdd(dir: string, ...paths: string[]): Promise<void> {
  await execFileAsync('git', ['-C', dir, 'add', ...paths], {
    timeout: 5000,
    windowsHide: true,
  });
}

/**
 * Build a CheckContext whose `project.gitRoot` reflects the on-disk git
 * state at `root`. Mirrors what buildProjectContext does — resolving
 * gitRoot via execFile — but inlined so the checker test does not depend
 * on the broader builder. When git is unavailable, gitRoot stays null
 * and the checker will skip; callers handle that explicitly.
 */
async function runChecker(args: { signal?: AbortSignal; gitRoot?: string | null } = {}) {
  const project = makeProjectContext(root);
  if (args.gitRoot !== undefined) {
    (project as { gitRoot: string | null }).gitRoot = args.gitRoot;
  }
  const ctx = makeStaticContext(project, args.signal);
  return lockfileCommittedChecker.run(ctx);
}

describe('lockfileCommittedChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('lockfile-committed');
    expect(entry).toBeDefined();
    expect(lockfileCommittedChecker.id).toBe(entry?.id);
    expect(lockfileCommittedChecker.name).toBe(entry?.name);
    expect(lockfileCommittedChecker.category).toBe(entry?.category);
    expect(lockfileCommittedChecker.mode).toBe(entry?.mode);
  });

  test('skips when project.gitRoot is null (no git repo / git unavailable)', async () => {
    // No git init at root. gitRoot stays null even with a lockfile on disk.
    await write('package-lock.json', '{}\n');
    const [result] = await runChecker({ gitRoot: null });
    expect(result?.status).toBe('skip');
    expect(result?.message).toMatch(/not a git repository|git unavailable/i);
  });

  test('passes when package-lock.json is git-tracked', async () => {
    if (!(await tryGitInit(root))) return;
    await write('package-lock.json', '{}\n');
    await gitAdd(root, 'package-lock.json');
    const [result] = await runChecker({ gitRoot: root });
    expect(result?.status).toBe('pass');
    expect(result?.message).toContain('package-lock.json');
  });

  test('passes when yarn.lock is git-tracked', async () => {
    if (!(await tryGitInit(root))) return;
    await write('yarn.lock', '\n');
    await gitAdd(root, 'yarn.lock');
    const [result] = await runChecker({ gitRoot: root });
    expect(result?.status).toBe('pass');
    expect(result?.message).toContain('yarn.lock');
  });

  test('passes when pnpm-lock.yaml is git-tracked', async () => {
    if (!(await tryGitInit(root))) return;
    await write('pnpm-lock.yaml', 'lockfileVersion: 6\n');
    await gitAdd(root, 'pnpm-lock.yaml');
    const [result] = await runChecker({ gitRoot: root });
    expect(result?.status).toBe('pass');
    expect(result?.message).toContain('pnpm-lock.yaml');
  });

  test('detail lists every tracked lockfile when multiple are committed', async () => {
    if (!(await tryGitInit(root))) return;
    await write('package-lock.json', '{}\n');
    await write('pnpm-lock.yaml', 'lockfileVersion: 6\n');
    await gitAdd(root, 'package-lock.json', 'pnpm-lock.yaml');
    const [result] = await runChecker({ gitRoot: root });
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('package-lock.json');
    expect(result?.detail).toContain('pnpm-lock.yaml');
  });

  test('fails with "present but not committed" when lockfile exists on disk but is not staged', async () => {
    if (!(await tryGitInit(root))) return;
    await write('package-lock.json', '{}\n');
    // Deliberately do NOT git add.
    const [result] = await runChecker({ gitRoot: root });
    expect(result?.status).toBe('fail');
    expect(result?.message).toMatch(/present but not committed/i);
    expect(result?.message).toContain('package-lock.json');
    expect(result?.fix).toMatch(/git add/);
  });

  test('fails with "no lockfile" when none of the candidates exists on disk', async () => {
    if (!(await tryGitInit(root))) return;
    await write('src/index.ts', 'export const x = 1;\n');
    const [result] = await runChecker({ gitRoot: root });
    expect(result?.status).toBe('fail');
    expect(result?.message).toMatch(/No lockfile found/);
    // Detail enumerates the candidates so the user knows what to commit.
    expect(result?.detail).toContain('package-lock.json');
    expect(result?.detail).toContain('yarn.lock');
    expect(result?.detail).toContain('pnpm-lock.yaml');
    expect(result?.fix).toMatch(/npm install|yarn|pnpm install/);
  });

  test('returns exactly one CheckResult on every status path', async () => {
    if (!(await tryGitInit(root))) return;
    await write('package-lock.json', '{}\n');
    await gitAdd(root, 'package-lock.json');
    const passing = await runChecker({ gitRoot: root });
    expect(passing).toHaveLength(1);
  });

  test('canonical resultId is "lockfile-committed" on every status', async () => {
    const skipped = await runChecker({ gitRoot: null });
    expect(skipped[0]?.resultId).toBe('lockfile-committed');

    if (!(await tryGitInit(root))) return;
    await write('package-lock.json', '{}\n');
    const failing = await runChecker({ gitRoot: root });
    expect(failing[0]?.resultId).toBe('lockfile-committed');

    await gitAdd(root, 'package-lock.json');
    const passing = await runChecker({ gitRoot: root });
    expect(passing[0]?.resultId).toBe('lockfile-committed');
  });

  test('fail result has severity major, category dependencies, and a non-empty fix', async () => {
    if (!(await tryGitInit(root))) return;
    const [result] = await runChecker({ gitRoot: root });
    expect(result?.status).toBe('fail');
    expect(result?.severity).toBe('major');
    expect(result?.category).toBe('dependencies');
    expect(result?.fix).toBeTruthy();
  });

  test('returns a skip result when ctx.project is null', async () => {
    const base = makeStaticContext(makeProjectContext(root));
    const results = await lockfileCommittedChecker.run({ ...base, project: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
  });

  test('returns a skip result when ctx.signal is already aborted', async () => {
    if (!(await tryGitInit(root))) return;
    await write('package-lock.json', '{}\n');
    await gitAdd(root, 'package-lock.json');
    const controller = new AbortController();
    controller.abort();
    const [result] = await runChecker({ signal: controller.signal, gitRoot: root });
    expect(result?.status).toBe('skip');
  });

  test('monorepo-scoped: a workspace lockfile committed at the parent gitRoot but NOT at projectDir is still a fail', async () => {
    // Simulates a monorepo where the root lockfile is committed but the
    // workspace subpackage (projectDir = apps/web) has no lockfile of
    // its own. The check is intentionally strict about projectDir
    // scope; workspace setups should disable this checker in their
    // subpackage .launchcheckrc.
    if (!(await tryGitInit(root))) return;
    await write('package-lock.json', '{}\n'); // root lockfile
    await gitAdd(root, 'package-lock.json');
    await fs.mkdir(path.join(root, 'apps', 'web'), { recursive: true });

    // Now re-run with projectDir = the workspace, but gitRoot still at root.
    const workspaceRoot = path.join(root, 'apps', 'web');
    const workspaceProject = makeProjectContext(workspaceRoot);
    (workspaceProject as { gitRoot: string | null }).gitRoot = root;
    const ctx = makeStaticContext(workspaceProject);
    const [result] = await lockfileCommittedChecker.run(ctx);
    expect(result?.status).toBe('fail');
    expect(result?.message).toMatch(/No lockfile found/);
  });
});
