import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { envExampleExistsChecker } from '../env-example-exists.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-env-example-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content = ''): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

async function runChecker(signal?: AbortSignal) {
  const ctx = makeStaticContext(makeProjectContext(root), signal);
  return envExampleExistsChecker.run(ctx);
}

describe('envExampleExistsChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('env-example-exists');
    expect(entry).toBeDefined();
    expect(envExampleExistsChecker.id).toBe(entry?.id);
    expect(envExampleExistsChecker.name).toBe(entry?.name);
    expect(envExampleExistsChecker.category).toBe(entry?.category);
    expect(envExampleExistsChecker.mode).toBe(entry?.mode);
  });

  test('passes when .env.example exists at the project root', async () => {
    await write('.env.example', 'FOO=bar\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('.env.example');
  });

  test('passes when .env.template exists at the project root', async () => {
    await write('.env.template', 'FOO=bar\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('.env.template');
  });

  test('passes on multi-environment templates (e.g. .env.dev.example)', async () => {
    await write('.env.dev.example', '');
    await write('.env.prod.example', '');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    // Detail is sorted; both filenames present.
    expect(result?.detail).toContain('.env.dev.example');
    expect(result?.detail).toContain('.env.prod.example');
    expect(result?.message).toMatch(/Found 2 env example\/template/);
  });

  test('passes on hyphenated variants (.env-example)', async () => {
    await write('.env-example', '');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.detail).toContain('.env-example');
  });

  test('fails when no .env example/template file exists at the project root', async () => {
    await write('src/index.ts', 'export const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.message).toMatch(/No \.env\.example or \.env\.template/);
    expect(result?.fix).toBeTruthy();
    expect((result?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('fails when only a real .env exists at the project root (.env is not a template)', async () => {
    await write('.env', 'FOO=bar\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
  });

  test('does not count .env.example.local as the template (strict suffix match)', async () => {
    // `.env.example.local` is a local-override convention, not the
    // documentation template — the checker must not give credit for it.
    await write('.env.example.local', '');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
  });

  test('does not count a nested .env.example in a subdirectory (root-only by design)', async () => {
    await write('apps/web/.env.example', '');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
  });

  test('returns exactly one CheckResult', async () => {
    await write('.env.example', '');
    await write('.env.template', '');
    const results = await runChecker();
    expect(results).toHaveLength(1);
  });

  test('fail result has severity minor, category deployment, and a non-empty fix', async () => {
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.severity).toBe('minor');
    expect(result?.category).toBe('deployment');
    expect(result?.fix).toBeTruthy();
    expect(typeof result?.fix).toBe('string');
  });

  test('canonical resultId is "env-example-present"', async () => {
    await write('.env.example', '');
    const [result] = await runChecker();
    expect(result?.resultId).toBe('env-example-present');
  });

  test('returns a skip result when ctx.project is null', async () => {
    const base = makeStaticContext(makeProjectContext(root));
    const results = await envExampleExistsChecker.run({ ...base, project: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
  });

  test('returns a skip result when ctx.signal is already aborted', async () => {
    await write('.env.example', '');
    const controller = new AbortController();
    controller.abort();
    const [result] = await runChecker(controller.signal);
    expect(result?.status).toBe('skip');
  });
});
