import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { CheckContext } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { unusedDependenciesChecker } from '../unused-dependencies.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-unused-deps-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

function ctxWith(pkg: Record<string, unknown>): CheckContext {
  const project = { ...makeProjectContext(root), packageJson: pkg };
  return makeStaticContext(project);
}

describe('unusedDependenciesChecker', () => {
  test('a dependency used only via `import type` is counted as used (AST, no FP)', async () => {
    await write('src/index.ts', "import type { Schema } from 'zod';\nexport type S = Schema;\n");
    const ctx = ctxWith({ dependencies: { zod: '^3' } });
    const results = await unusedDependenciesChecker.run(ctx);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('all-dependencies-used');
  });

  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('unused-dependencies');
    expect(entry).toBeDefined();
    expect(unusedDependenciesChecker.id).toBe(entry?.id);
    expect(unusedDependenciesChecker.name).toBe(entry?.name);
    expect(unusedDependenciesChecker.category).toBe(entry?.category);
    expect(unusedDependenciesChecker.mode).toBe(entry?.mode);
  });

  test('skip no-project-context when ctx.project is null', async () => {
    const base = makeStaticContext(makeProjectContext(root));
    const ctx = { ...base, project: null };
    const results = await unusedDependenciesChecker.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-project-context');
  });

  test('pass no-dependencies when package.json has no dependencies', async () => {
    const ctx = ctxWith({ name: 'my-app' });
    const results = await unusedDependenciesChecker.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('no-dependencies');
  });

  test('pass all-dependencies-used when all deps imported in source', async () => {
    await write('src/index.ts', "import express from 'express';\nimport lodash from 'lodash';");
    const ctx = ctxWith({ dependencies: { express: '^4', lodash: '^4' } });
    const results = await unusedDependenciesChecker.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('all-dependencies-used');
  });

  test('warn unused-dependencies-found when a dep is not imported', async () => {
    await write('src/index.ts', "import express from 'express';");
    const ctx = ctxWith({ dependencies: { express: '^4', lodash: '^4' } });
    const results = await unusedDependenciesChecker.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('warn');
    expect(results[0]?.resultId).toBe('unused-dependencies-found');
    expect(results[0]?.message).toContain('lodash');
    expect(results[0]?.severity).toBe('info');
    expect((results[0]?.fix ?? '').length).toBeGreaterThan(0);
  });

  test('deps referenced in package.json scripts are not flagged', async () => {
    const ctx = ctxWith({
      dependencies: { webpack: '^5' },
      scripts: { build: 'webpack --config webpack.config.js' },
    });
    const results = await unusedDependenciesChecker.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('all-dependencies-used');
  });

  test('@types/* packages are excluded from the unused check', async () => {
    const ctx = ctxWith({ dependencies: { '@types/node': '^20' } });
    const results = await unusedDependenciesChecker.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('no-dependencies');
  });
});
