import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { runLiveScan, runScan } from '../commands/scan.js';

async function makeProject(content: { [relPath: string]: string }): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-scan-'));
  for (const [rel, body] of Object.entries(content)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body, 'utf8');
  }
  return dir;
}

const created: string[] = [];

async function project(content: { [relPath: string]: string }): Promise<string> {
  const dir = await makeProject(content);
  created.push(dir);
  return dir;
}

afterEach(async () => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe('runScan', () => {
  test('exit 0 on a clean project (no source files have console.* or debugger)', async () => {
    const dir = await project({
      'src/clean.ts': 'export const x = 1;\n',
      '.env.example': 'FOO=bar\n',
      '.github/workflows/ci.yml': 'on: push\n',
      'README.md': '# Proj\n\n## Setup\n\n## Environment\n\n## Usage\n',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('exit 1 on a project containing a console.log (console-log-scan fails)', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('FAIL');
    expect(result.stderr).toBe('');
  });

  test('exit 2 + non-empty stderr on a .launchcheckrc with invalid JSON', async () => {
    const dir = await project({
      'src/clean.ts': 'export const x = 1;\n',
      '.launchcheckrc': '{ not valid json',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stderr).toContain('Failed to parse');
  });

  test('exit 2 + non-empty stderr on a .launchcheckrc with a shape-invalid field', async () => {
    const dir = await project({
      'src/clean.ts': 'export const x = 1;\n',
      '.launchcheckrc': JSON.stringify({ checkers: { 'console-log-scan': 'yes' } }),
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stderr).toContain('must be a boolean');
  });

  test('.launchcheckrc disabling console-log-scan suppresses the fail (exit 0)', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
      '.env.example': 'FOO=bar\n',
      '.github/workflows/ci.yml': 'on: push\n',
      'README.md': '# Proj\n\n## Setup\n\n## Environment\n\n## Usage\n',
      '.launchcheckrc': JSON.stringify({ checkers: { 'console-log-scan': false } }),
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('FAIL');
  });

  test('.launchcheckrc ignore patterns prevent matching files from being scanned', async () => {
    const dir = await project({
      'lib/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
      '.env.example': 'FOO=bar\n',
      '.github/workflows/ci.yml': 'on: push\n',
      'README.md': '# Proj\n\n## Setup\n\n## Environment\n\n## Usage\n',
      '.launchcheckrc': JSON.stringify({ ignore: ['lib/**'] }),
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(0);
  });

  test('color: false produces stdout free of ANSI escape sequences', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
    });
    const result = await runScan({ projectDir: dir, color: false });
    expect(result.stdout).not.toContain('\x1b[');
  });

  test('color: true wraps FAIL with the red ANSI sequence on a dirty project', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
    });
    const result = await runScan({ projectDir: dir, color: true });
    expect(result.stdout).toContain('\x1b[');
    expect(result.stdout).toContain('\x1b[31mFAIL\x1b[0m');
  });

  test('stdout always includes "Summary:" on a successful run', async () => {
    const dir = await project({ 'src/clean.ts': 'export const x = 1;\n' });
    const result = await runScan({ projectDir: dir });
    expect(result.stdout).toContain('Summary:');
  });

  test('options.projectDir is honored (uses the supplied path, not cwd)', async () => {
    const dir = await project({
      'src/dirty.ts': 'export const x = 1;\nconsole.log("hi");\n',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('src/dirty.ts');
  });

  test('multi-emit: gitignore-coverage emits N fail results through the full scan pipeline', async () => {
    // gitignore-coverage emits one result per missing required-pattern
    // category. A .gitignore that only covers node_modules leaves
    // multiple categories uncovered — exercising the multi-emit
    // pipeline through the full CLI (orchestrator + terminal reporter).
    const dir = await project({
      'src/clean.ts': 'export const x = 1;\n',
      '.gitignore': 'node_modules\n',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(1);
    const failCount = (result.stdout.match(/FAIL/g) ?? []).length;
    expect(failCount).toBeGreaterThan(1);
    // Each missing category has a stable resultId of the form `missing-<id>`.
    expect(result.stdout).toMatch(/missing-/);
  });

  test('exit 2 when a critical-severity fail flows through the full scan pipeline', async () => {
    // No currently-implemented static checker can emit a critical-fail
    // on demand, so we route a synthetic critical fail through the
    // test-only checkers seam. validateCheckerRegistration accepts the
    // stub because secret-scan exists in the registry with the same
    // category/mode/maxSeverity. Once a real checker can emit critical,
    // rewrite this test against it.
    const dir = await project({ 'src/clean.ts': 'export const x = 1;\n' });
    const result = await runScan({
      projectDir: dir,
      checkers: [
        {
          id: 'secret-scan',
          name: 'secret-scan',
          category: 'security',
          mode: 'static',
          run: async () => [
            {
              checkerId: 'secret-scan',
              resultId: 'simulated-leak',
              status: 'fail',
              severity: 'critical',
              category: 'security',
              message: 'simulated critical fail',
              fix: 'remove the secret',
            },
          ],
        },
      ],
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('FAIL');
    expect(result.stdout).toContain('secret-scan/simulated-leak');
  });

  test('non-git project is still scanned end-to-end (records absence of git preflight)', async () => {
    // Documents current behavior: launchcheck does not yet implement a
    // `__preflight__/git-available` check. A non-git project is scanned
    // normally with no preflight skip. When git preflight ships, this
    // test must be updated to assert the preflight-result emission.
    const dir = await project({
      'src/clean.ts': 'export const x = 1;\n',
      '.env.example': 'FOO=bar\n',
      '.github/workflows/ci.yml': 'on: push\n',
      'README.md': '# Proj\n\n## Setup\n\n## Environment\n\n## Usage\n',
    });
    const result = await runScan({ projectDir: dir });
    expect(result.exitCode).toBe(0);
    // No preflight result names leak into the output.
    expect(result.stdout).not.toContain('git-available');
    expect(result.stdout).not.toContain('__preflight__');
  });
});

describe('runLiveScan multi-URL validation', () => {
  test('rejects an invalid URL in --urls (exit 2)', async () => {
    const res = await runLiveScan({ urls: ['https://ok.test/', 'not a url'] });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('invalid URL');
  });
  test('rejects a non-http(s) URL (exit 2)', async () => {
    const res = await runLiveScan({ urls: ['ftp://x.test/'] });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('http or https');
  });
  test('empty target list is a usage error (exit 2)', async () => {
    const res = await runLiveScan({ urls: [] });
    expect(res.exitCode).toBe(2);
  });
});

describe('runLiveScan URL discovery (sitemap + crawl)', () => {
  // A live checker stub (valid registry id) that tags nothing itself — the
  // orchestrator tags each result with its URL. It never touches live resources,
  // so no network beyond the injected discovery httpClient occurs.
  const stub = {
    id: 'csp-present',
    name: 'stub',
    category: 'security' as const,
    mode: 'live' as const,
    run: async () => [
      {
        checkerId: 'csp-present',
        resultId: 'stub',
        status: 'pass' as const,
        message: 'ok',
        severity: 'major' as const,
        category: 'security' as const,
      },
    ],
  };

  function sitemapHttp(body: string) {
    return {
      async fetch() {
        return { body } as unknown as import('../../types/index.js').HttpResponse;
      },
    };
  }

  test('--sitemap discovers page URLs and runs the live checker once per URL', async () => {
    const xml =
      '<urlset><url><loc>http://app.test/p1</loc></url><url><loc>http://app.test/p2</loc></url></urlset>';
    const res = await runLiveScan({
      sitemap: 'http://app.test/sitemap.xml',
      httpClient: sitemapHttp(xml),
      checkers: [stub],
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('url: http://app.test/p1');
    expect(res.stdout).toContain('url: http://app.test/p2');
  });

  test('--crawl without a seed URL is a usage error (exit 2)', async () => {
    const res = await runLiveScan({ crawl: true, httpClient: sitemapHttp('') });
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('requires --url');
  });

  test('a sitemap yielding no usable URLs and no explicit URL is an error (exit 2)', async () => {
    const res = await runLiveScan({
      sitemap: 'http://app.test/sitemap.xml',
      httpClient: sitemapHttp('<urlset></urlset>'),
    });
    expect(res.exitCode).toBe(2);
  });
});

describe('runScan/runLiveScan F.3 flags', () => {
  const liveStub = {
    id: 'csp-present',
    name: 'stub',
    category: 'security' as const,
    mode: 'live' as const,
    run: async () => [
      {
        checkerId: 'csp-present',
        resultId: 'stub',
        status: 'pass' as const,
        message: 'ok',
        severity: 'major' as const,
        category: 'security' as const,
      },
    ],
  };
  const staticStub = {
    id: 'console-log-scan',
    name: 'stub',
    category: 'code-quality' as const,
    mode: 'static' as const,
    run: async () => [
      {
        checkerId: 'console-log-scan',
        resultId: 'x',
        status: 'fail' as const,
        message: 'boom',
        severity: 'critical' as const,
        category: 'code-quality' as const,
      },
    ],
  };
  function http(body: string) {
    return {
      async fetch() {
        return { body } as unknown as import('../../types/index.js').HttpResponse;
      },
    };
  }

  test('--summary prints only the failing finding + counts', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-f3-'));
    const res = await runScan({ projectDir: dir, checkers: [staticStub], summary: true });
    expect(res.stdout).toContain('console-log-scan/x');
    expect(res.stdout).toContain('Summary:');
    expect(res.stdout).toContain('1 failed');
    await fs.rm(dir, { recursive: true, force: true });
  });

  test('--max-sitemap-urls caps ingested URLs', async () => {
    const xml =
      '<urlset><url><loc>http://a.test/1</loc></url><url><loc>http://a.test/2</loc></url><url><loc>http://a.test/3</loc></url></urlset>';
    const res = await runLiveScan({
      sitemap: 'http://a.test/sitemap.xml',
      httpClient: http(xml),
      maxSitemapUrls: 1,
      checkers: [liveStub],
    });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('http://a.test/1');
    expect(res.stdout).not.toContain('http://a.test/2');
  });
});
