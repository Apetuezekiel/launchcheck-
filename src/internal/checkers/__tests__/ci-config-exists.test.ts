import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { ciConfigExistsChecker } from '../ci-config-exists.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-ci-config-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content = ''): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

async function mkdirEmpty(rel: string): Promise<void> {
  await fs.mkdir(path.join(root, rel), { recursive: true });
}

async function runChecker(signal?: AbortSignal) {
  const ctx = makeStaticContext(makeProjectContext(root), signal);
  return ciConfigExistsChecker.run(ctx);
}

describe('ciConfigExistsChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('ci-config-exists');
    expect(entry).toBeDefined();
    expect(ciConfigExistsChecker.id).toBe(entry?.id);
    expect(ciConfigExistsChecker.name).toBe(entry?.name);
    expect(ciConfigExistsChecker.category).toBe(entry?.category);
    expect(ciConfigExistsChecker.mode).toBe(entry?.mode);
  });

  test('passes when a GitHub Actions workflow .yml exists', async () => {
    await write('.github/workflows/ci.yml', 'on: push\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('GitHub Actions');
  });

  test('passes when a GitHub Actions workflow .yaml exists', async () => {
    await write('.github/workflows/release.yaml', 'on: push\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('GitHub Actions');
  });

  test('does NOT pass on an empty .github/workflows/ directory', async () => {
    // Empty dir = setup-in-progress; the checker requires at least one
    // pipeline file to give credit.
    await mkdirEmpty('.github/workflows');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
  });

  test('passes on .gitlab-ci.yml', async () => {
    await write('.gitlab-ci.yml', 'stages: []\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('GitLab CI');
  });

  test('passes on .gitlab-ci.yaml (yaml extension variant)', async () => {
    await write('.gitlab-ci.yaml', 'stages: []\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('GitLab CI');
  });

  test('passes on .circleci/config.yml (canonical CircleCI convention)', async () => {
    await write('.circleci/config.yml', 'version: 2.1\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('CircleCI');
  });

  test('passes on the spec-literal `circleci/config.yml` (no leading dot)', async () => {
    // The v1 spec text lists `circleci/config.yml` without a leading
    // dot — almost certainly a typo, but accepted here so a corrected
    // spec does not regress this checker.
    await write('circleci/config.yml', 'version: 2.1\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('CircleCI');
  });

  test('passes on Jenkinsfile', async () => {
    await write('Jenkinsfile', 'pipeline {}\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('Jenkins');
  });

  test('passes on a Buildkite pipeline .yml in .buildkite/', async () => {
    await write('.buildkite/pipeline.yml', 'steps: []\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('Buildkite');
  });

  test('does NOT pass on an empty .buildkite/ directory', async () => {
    await mkdirEmpty('.buildkite');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
  });

  test('detail lists every detected provider when multiple configs coexist', async () => {
    await write('.github/workflows/ci.yml', 'on: push\n');
    await write('.gitlab-ci.yml', 'stages: []\n');
    await write('Jenkinsfile', 'pipeline {}\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('GitHub Actions');
    expect(result?.detail).toContain('GitLab CI');
    expect(result?.detail).toContain('Jenkins');
    expect(result?.message).toMatch(/Found CI configuration for 3 provider/);
  });

  test('fails (severity minor, deployment, non-empty fix) when no config exists', async () => {
    await write('src/index.ts', 'export const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.severity).toBe('minor');
    expect(result?.category).toBe('deployment');
    expect(result?.message).toMatch(/No CI configuration/);
    expect(result?.fix).toBeTruthy();
    expect((result?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('returns exactly one CheckResult', async () => {
    await write('.github/workflows/ci.yml', 'on: push\n');
    await write('.gitlab-ci.yml', 'stages: []\n');
    const results = await runChecker();
    expect(results).toHaveLength(1);
  });

  test('canonical resultId is "ci-config-present"', async () => {
    await write('.github/workflows/ci.yml', 'on: push\n');
    const [result] = await runChecker();
    expect(result?.resultId).toBe('ci-config-present');
  });

  test('returns a skip result when ctx.project is null', async () => {
    const base = makeStaticContext(makeProjectContext(root));
    const results = await ciConfigExistsChecker.run({ ...base, project: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
  });

  test('returns a skip result when ctx.signal is already aborted', async () => {
    await write('.github/workflows/ci.yml', 'on: push\n');
    const controller = new AbortController();
    controller.abort();
    const [result] = await runChecker(controller.signal);
    expect(result?.status).toBe('skip');
  });
});
