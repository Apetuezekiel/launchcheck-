import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { CheckContext, CheckResult } from '../../../types/index.js';
import { findById } from '../../registry/index.js';
import { secretScanChecker } from '../secret-scan.js';
import { makeProjectContext, makeStaticContext } from './context.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-secret-scan-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function write(rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}

function ctxWith(options?: Record<string, unknown>): CheckContext {
  const base = makeStaticContext(makeProjectContext(root));
  if (options === undefined) {
    return base;
  }
  return {
    ...base,
    config: { ...base.config, checkerOptions: { 'secret-scan': options } },
  };
}

// Fixture secrets are ASSEMBLED FROM FRAGMENTS at runtime. The committed test
// source therefore contains no contiguous, scanner-matchable token — GitGuardian
// and GitHub push protection flag full provider tokens even inside test
// fixtures (this checker's first landing was reverted for exactly that). The
// runtime-assembled strings still exercise the production regexes.
const AWS_KEY = `AKIA${'A'.repeat(16)}`; // AKIA + 16 uppercase
const GH_TOKEN = `ghp_${'a'.repeat(36)}`; // ghp_ + 36 alnum
const PEM_MARKER = `-----BEGIN RSA PRIV${'ATE KEY-----'}`; // split across the trigger word
const PASSWORD_KW = `pass${'word'}`; // split the keyword the regex/scanners key on

describe('secretScanChecker', () => {
  test('id, name, category, and mode match the registry entry', () => {
    const entry = findById('secret-scan');
    expect(entry).toBeDefined();
    expect(secretScanChecker.id).toBe(entry?.id);
    expect(secretScanChecker.name).toBe(entry?.name);
    expect(secretScanChecker.category).toBe(entry?.category);
    expect(secretScanChecker.mode).toBe(entry?.mode);
  });

  test('skip "no-project-context" when ctx.project is null', async () => {
    const base = ctxWith();
    const ctx = { ...base, project: null };
    const results = await secretScanChecker.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('no-project-context');
  });

  test('skip "aborted" when ctx.signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const ctx = makeStaticContext(makeProjectContext(root), ac.signal);
    const results = await secretScanChecker.run(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('skip');
    expect(results[0]?.resultId).toBe('aborted');
  });

  test('pass "no-secrets" on clean source files', async () => {
    await write('src/app.ts', 'export const x = 1;\nconst greeting = "hello world";\n');
    const results = await secretScanChecker.run(ctxWith());
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('no-secrets');
  });

  test('fail "aws-access-key-id" with masked detail and a location', async () => {
    await write('src/config.ts', `const key = "${AWS_KEY}";\n`);
    const results = await secretScanChecker.run(ctxWith());
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('aws-access-key-id');
    expect(results[0]?.severity).toBe('critical');
    expect(results[0]?.detail).toContain('AKIA****');
    expect(results[0]?.detail).not.toContain(AWS_KEY);
    expect(results[0]?.location?.file).toBe('src/config.ts');
  });

  test('fail "private-key" with fully redacted detail (never echoes the key)', async () => {
    await write('keys/server.ts', `export const PEM = \`${PEM_MARKER}\`;\n`);
    const results = await secretScanChecker.run(ctxWith());
    expect(results).toHaveLength(1);
    expect(results[0]?.resultId).toBe('private-key');
    expect(results[0]?.detail).toContain('<redacted>');
    expect(results[0]?.detail).not.toContain(PEM_MARKER);
  });

  test('fail "github-token"', async () => {
    await write('src/gh.ts', `const t = "${GH_TOKEN}";\n`);
    const results = await secretScanChecker.run(ctxWith());
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('github-token');
    expect(results[0]?.detail).not.toContain(GH_TOKEN);
  });

  test('fail "generic-credential-assignment" for a quoted secret value, value not echoed', async () => {
    await write('src/db.ts', `const ${PASSWORD_KW} = "supersecret123";\n`);
    const results = await secretScanChecker.run(ctxWith());
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('generic-credential-assignment');
    expect(results[0]?.detail).not.toContain('supersecret123');
  });

  test('emits multiple results — one per matched category', async () => {
    await write('src/multi.ts', `const a = "${AWS_KEY}";\nconst b = "${GH_TOKEN}";\n`);
    const results = await secretScanChecker.run(ctxWith());
    const ids = results.map((r) => r.resultId).sort();
    expect(ids).toEqual(['aws-access-key-id', 'github-token']);
    for (const r of results) {
      expect(r.status).toBe('fail');
    }
  });

  test('excludes test files (*.test.*, *.spec.*, __tests__/)', async () => {
    await write('src/__tests__/fixtures.test.ts', `const k = "${AWS_KEY}";\n`);
    await write('src/secrets.spec.ts', `const k = "${AWS_KEY}";\n`);
    const results = await secretScanChecker.run(ctxWith());
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
  });

  test('does not scan files under default-ignored dirs (node_modules)', async () => {
    await write('node_modules/pkg/index.ts', `const k = "${AWS_KEY}";\n`);
    const results = await secretScanChecker.run(ctxWith());
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
  });

  test('allowlist (literal) suppresses a matching occurrence', async () => {
    await write('src/config.ts', `const key = "${AWS_KEY}";\n`);
    const results = await secretScanChecker.run(ctxWith({ allowlist: [AWS_KEY] }));
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
  });

  test('allowlist (regex: form) suppresses matching occurrences', async () => {
    await write('src/config.ts', `const key = "${AWS_KEY}";\n`);
    const results = await secretScanChecker.run(ctxWith({ allowlist: ['regex:AKIA[0-9A-Z]+'] }));
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
  });

  test('extraPatterns flags a custom pattern under its own id, severity from defaultSeverity', async () => {
    await write('src/app.ts', 'const internal = "ZICSTACK-INTERNAL-TOKEN-001";\n');
    const results = await secretScanChecker.run(
      ctxWith({
        extraPatterns: [
          {
            id: 'zicstack-token',
            regex: 'ZICSTACK-INTERNAL-TOKEN-\\d+',
            defaultSeverity: 'major',
            description: 'Zicstack internal token',
          },
        ],
      }),
    );
    expect(results[0]?.status).toBe('fail');
    expect(results[0]?.resultId).toBe('zicstack-token');
    expect(results[0]?.severity).toBe('major');
  });

  test('extraPatterns with defaultSeverity "warn" maps to severity "minor"', async () => {
    await write('src/app.ts', 'const internal = "INTERNAL-MARKER-XYZ";\n');
    const results = await secretScanChecker.run(
      ctxWith({
        extraPatterns: [
          {
            id: 'internal-marker',
            regex: 'INTERNAL-MARKER-[A-Z]+',
            defaultSeverity: 'warn',
            description: 'internal marker',
          },
        ],
      }),
    );
    expect(results[0]?.resultId).toBe('internal-marker');
    expect(results[0]?.severity).toBe('minor');
  });

  test('extraPatterns cannot override a built-in id (collision is skipped)', async () => {
    await write('src/app.ts', 'export const ok = 1;\n');
    const results = await secretScanChecker.run(
      ctxWith({
        extraPatterns: [
          { id: 'aws-access-key-id', regex: 'ok', defaultSeverity: 'info', description: 'x' },
        ],
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
  });

  test('an invalid extraPatterns regex is skipped without crashing', async () => {
    await write('src/app.ts', 'export const ok = 1;\n');
    const results = await secretScanChecker.run(
      ctxWith({
        extraPatterns: [
          { id: 'bad', regex: '(unclosed[', defaultSeverity: 'major', description: 'bad' },
        ],
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('pass');
    expect(results[0]?.resultId).toBe('no-secrets');
  });

  test('detail truncates at MAX_DETAIL_LINES with "... and N more"', async () => {
    const lines = Array.from({ length: 25 }, () => `const k = "${AWS_KEY}";`).join('\n');
    await write('src/many.ts', `${lines}\n`);
    const results = await secretScanChecker.run(ctxWith());
    expect(results).toHaveLength(1);
    expect(results[0]?.resultId).toBe('aws-access-key-id');
    expect(results[0]?.message).toContain('25');
    expect(results[0]?.detail).toContain('... and 5 more');
  });

  test('all results carry checkerId "secret-scan", category "security", severity "critical"', async () => {
    await write('src/config.ts', `const key = "${AWS_KEY}";\n`);
    const results = await secretScanChecker.run(ctxWith());
    for (const r of results as CheckResult[]) {
      expect(r.checkerId).toBe('secret-scan');
      expect(r.category).toBe('security');
      expect(r.severity).toBe('critical');
    }
  });
});
