import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import { runLiveChecks } from '../run-live.js';
import { BAD_HTML, type Fixture, GOOD_HTML, startFixture } from './support/fixture-server.js';

// Force browser resources unavailable so the skip cascade is deterministic.
const NO_BROWSER = {
  chromeAdapter: {
    isInstalled: () => false,
    launch: async () => {
      throw new Error('unused');
    },
    close: async () => {},
  },
  axeAdapter: {
    isInstalled: () => false,
    run: async () => {
      throw new Error('unused');
    },
  },
  lighthouseAdapter: {
    isInstalled: () => false,
    run: async () => {
      throw new Error('unused');
    },
  },
};

const SECURE_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'content-security-policy': "default-src 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-encoding': 'br',
};

const resultsFor = (rs: CheckResult[], id: string): CheckResult[] =>
  rs.filter((r) => r.checkerId === id);

describe('multi-URL live run aggregates and tags per URL', () => {
  let good: Fixture;
  let bad: Fixture;
  let results: CheckResult[];

  beforeAll(async () => {
    good = await startFixture({ routes: { '/': { headers: SECURE_HEADERS, body: GOOD_HTML } } });
    bad = await startFixture({ routes: { '/': { body: BAD_HTML } }, fallback: { status: 404 } });
    results = await runLiveChecks({ urls: [good.url, bad.url], liveDeps: NO_BROWSER });
  }, 60_000);
  afterAll(async () => {
    await good.close();
    await bad.close();
  });

  test('every result carries a url that is one of the targets', () => {
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect([good.url, bad.url]).toContain(r.url);
    }
  });

  test('a live checker produces one tagged result per URL with independent verdicts', () => {
    const csp = resultsFor(results, 'csp-present');
    expect(csp).toHaveLength(2);
    const byUrl = new Map(csp.map((r) => [r.url, r.status]));
    expect(byUrl.get(good.url)).toBe('pass');
    expect(byUrl.get(bad.url)).toBe('fail');
  });

  test('static checkers do not run in a live-only (no projectDir) run', () => {
    expect(resultsFor(results, 'console-log-scan')).toHaveLength(0);
  });
});

describe('combined multi-URL run executes static checkers exactly once', () => {
  let good: Fixture;
  let bad: Fixture;
  let dir: string;
  let results: CheckResult[];

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-multiurl-'));
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'a.ts'), 'export const x = 1;\n');
    good = await startFixture({ routes: { '/': { headers: SECURE_HEADERS, body: GOOD_HTML } } });
    bad = await startFixture({ routes: { '/': { body: BAD_HTML } }, fallback: { status: 404 } });
    results = await runLiveChecks({
      urls: [good.url, bad.url],
      projectDir: dir,
      liveDeps: NO_BROWSER,
    });
  }, 60_000);
  afterAll(async () => {
    await good.close();
    await bad.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('a static checker appears once and is not URL-tagged', () => {
    const cl = resultsFor(results, 'console-log-scan');
    expect(cl).toHaveLength(1);
    expect(cl[0]?.url).toBeUndefined();
  });

  test('a live checker still runs once per URL', () => {
    expect(resultsFor(results, 'csp-present')).toHaveLength(2);
  });
});
