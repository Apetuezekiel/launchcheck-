import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { readmeRequiredSectionsChecker } from '../readme-required-sections.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-readme-sections-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content = ''): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

async function runChecker(args: { signal?: AbortSignal; options?: unknown } = {}) {
  const project = makeProjectContext(root);
  const ctx = makeStaticContext(project, args.signal);
  if (args.options !== undefined) {
    (ctx.config.checkerOptions as Record<string, unknown>)['readme-sections'] = args.options;
  }
  return readmeRequiredSectionsChecker.run(ctx);
}

describe('readmeRequiredSectionsChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('readme-required-sections');
    expect(entry).toBeDefined();
    expect(readmeRequiredSectionsChecker.id).toBe(entry?.id);
    expect(readmeRequiredSectionsChecker.name).toBe(entry?.name);
    expect(readmeRequiredSectionsChecker.category).toBe(entry?.category);
    expect(readmeRequiredSectionsChecker.mode).toBe(entry?.mode);
  });

  test('passes on a README with the canonical three default sections', async () => {
    await write(
      'README.md',
      '# My Project\n\n## Setup\nFoo.\n\n## Environment\nBar.\n\n## Usage\nBaz.\n',
    );
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
    expect(result?.message).toMatch(/3 required heading section/);
  });

  test('passes using the alternative keywords (Install, Configuration, Usage)', async () => {
    await write(
      'README.md',
      '# My Project\n\n## Install\nFoo.\n\n## Configuration\nBar.\n\n## Usage\nBaz.\n',
    );
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('keyword matching is case-insensitive', async () => {
    await write('README.md', '# proj\n\n## setup\n\n## environment\n\n## usage\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('multi-word headings satisfy a single keyword (substring match)', async () => {
    await write('README.md', '## Setup Guide\n\n## Configuration Notes\n\n## Usage Tips\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('accepts any ATX heading level (#, ##, ###, …)', async () => {
    await write('README.md', '# Setup\n\n#### Environment\n\n###### Usage\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('fails when README.md is missing entirely', async () => {
    await write('src/index.ts', 'export const x = 1;\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.message).toMatch(/No README\.md/);
    expect(result?.fix).toBeTruthy();
  });

  test('fails listing the missing groups when some sections are absent', async () => {
    await write('README.md', '# Proj\n\n## Usage\nFoo.\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.message).toMatch(/2 required heading section/);
    // Both missing groups appear in detail, in OR form.
    expect(result?.detail).toContain('Setup OR Install');
    expect(result?.detail).toContain('Environment OR Configuration');
  });

  test('does NOT credit a keyword that appears only in body text, not in a heading', async () => {
    await write(
      'README.md',
      '# Proj\n\nThis section covers Setup, Environment, and Usage in prose.\n',
    );
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
  });

  test('lowercase readme.md filename is accepted', async () => {
    await write('readme.md', '## Setup\n\n## Environment\n\n## Usage\n');
    const [result] = await runChecker();
    expect(result?.status).toBe('pass');
  });

  test('does NOT credit Setext-style headings (documented v1 limitation)', async () => {
    // Setext: "Setup\n=====" form. v1 supports ATX only; document with
    // a regression test so a future Setext-support change is intentional.
    await write(
      'README.md',
      'Setup\n=====\nFoo.\n\nEnvironment\n-----------\nBar.\n\nUsage\n=====\nBaz.\n',
    );
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
  });

  test('custom requiredHeadings: passes when every entry is present as a heading', async () => {
    await write('README.md', '## Quick Start\n\n## Architecture\n\n## Deployment\n');
    const [result] = await runChecker({
      options: { requiredHeadings: ['Quick Start', 'Architecture', 'Deployment'] },
    });
    expect(result?.status).toBe('pass');
  });

  test('custom requiredHeadings: fails listing the missing entries', async () => {
    await write('README.md', '## Quick Start\n');
    const [result] = await runChecker({
      options: { requiredHeadings: ['Quick Start', 'Architecture', 'Deployment'] },
    });
    expect(result?.status).toBe('fail');
    expect(result?.detail).toContain('Architecture');
    expect(result?.detail).toContain('Deployment');
    expect(result?.detail).not.toContain('Quick Start');
  });

  test('custom requiredHeadings: empty array falls back to defaults', async () => {
    // Otherwise a config file with `requiredHeadings: []` would silently
    // disable the check, which is a footgun.
    await write('README.md', '## Setup\n\n## Environment\n\n## Usage\n');
    const [result] = await runChecker({ options: { requiredHeadings: [] } });
    expect(result?.status).toBe('pass');
  });

  test('canonical resultId is "readme-sections-present" on every status', async () => {
    await write('README.md', '## Setup\n\n## Environment\n\n## Usage\n');
    const passing = await runChecker();
    expect(passing[0]?.resultId).toBe('readme-sections-present');

    await fs.rm(path.join(root, 'README.md'));
    const failing = await runChecker();
    expect(failing[0]?.resultId).toBe('readme-sections-present');
  });

  test('returns exactly one CheckResult', async () => {
    await write('README.md', '## Setup\n');
    const results = await runChecker();
    expect(results).toHaveLength(1);
  });

  test('fail result has severity minor, category documentation, and a non-empty fix', async () => {
    const [result] = await runChecker();
    expect(result?.status).toBe('fail');
    expect(result?.severity).toBe('minor');
    expect(result?.category).toBe('documentation');
    expect(result?.fix).toBeTruthy();
  });

  test('returns a skip result when ctx.project is null', async () => {
    const base = makeStaticContext(makeProjectContext(root));
    const results = await readmeRequiredSectionsChecker.run({ ...base, project: null });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
  });

  test('returns a skip result when ctx.signal is already aborted', async () => {
    await write('README.md', '## Setup\n## Environment\n## Usage\n');
    const controller = new AbortController();
    controller.abort();
    const [result] = await runChecker({ signal: controller.signal });
    expect(result?.status).toBe('skip');
  });
});
