import { describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import { formatTerminal } from '../terminal.js';

function makeResult(
  overrides: Partial<CheckResult> & { checkerId: string; resultId: string },
): CheckResult {
  return {
    status: 'pass',
    message: 'ok',
    severity: 'minor',
    category: 'code-quality',
    ...overrides,
  };
}

describe('formatTerminal', () => {
  test('summary mode prints only fail/warn findings plus the counts line', () => {
    const out = formatTerminal(
      [
        makeResult({
          checkerId: 'csp-present',
          resultId: 'csp',
          status: 'fail',
          message: 'CSP gone',
          category: 'security',
        }),
        makeResult({
          checkerId: 'todo-fixme-scan',
          resultId: 'todo',
          status: 'warn',
          message: '2 TODOs',
          category: 'code-quality',
        }),
        makeResult({
          checkerId: 'ssl-valid',
          resultId: 'ok',
          status: 'pass',
          message: 'fine',
          category: 'security',
        }),
        makeResult({
          checkerId: 'a11y',
          resultId: 'sk',
          status: 'skip',
          message: 'no peer',
          category: 'accessibility',
        }),
      ],
      { summary: true },
    );
    expect(out).toContain('csp-present/csp');
    expect(out).toContain('todo-fixme-scan/todo');
    expect(out).not.toContain('ssl-valid/ok'); // pass omitted
    expect(out).not.toContain('a11y/sk'); // skip omitted
    expect(out).toContain('Summary:');
    expect(out).toContain('1 failed');
  });

  test('annotates a finding with its URL when present', () => {
    const r = makeResult({
      checkerId: 'csp-present',
      resultId: 'csp-missing',
      status: 'fail',
      message: 'CSP absent',
      category: 'security',
      url: 'https://example.test/',
    });
    expect(formatTerminal([r])).toContain('url: https://example.test/');
  });

  test('empty results returns "launchcheck: no results.\\n"', () => {
    expect(formatTerminal([])).toBe('launchcheck: no results.\n');
  });

  test('single pass result renders PASS glyph, severity, and message', () => {
    const r = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'ok',
      status: 'pass',
      severity: 'minor',
      message: 'All clean.',
    });
    const out = formatTerminal([r]);
    expect(out).toContain('PASS');
    expect(out).toContain('[minor]');
    expect(out).toContain('All clean.');
  });

  test('single fail result renders FAIL glyph, severity, and message', () => {
    const r = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'no-console-statements',
      status: 'fail',
      severity: 'major',
      message: 'Found 3 statement(s).',
    });
    const out = formatTerminal([r]);
    expect(out).toContain('FAIL');
    expect(out).toContain('[major]');
    expect(out).toContain('Found 3 statement(s).');
  });

  test('renders detail, fix, and location together on a failing result', () => {
    const r = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'no-console-statements',
      status: 'fail',
      severity: 'major',
      message: 'Found statements.',
      detail: 'src/index.ts:10:1  console.log',
      fix: 'Remove console statements.',
      location: { file: 'src/index.ts', line: 10, column: 1 },
    });
    const out = formatTerminal([r]);
    expect(out).toContain('src/index.ts:10:1  console.log');
    expect(out).toContain('fix: Remove console statements.');
    expect(out).toContain('at src/index.ts:10:1');
  });

  test('location renders {file:line:column}, {file:line}, and {file} variants', () => {
    const withAll = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'a',
      status: 'fail',
      severity: 'major',
      message: 'm',
      location: { file: 'src/a.ts', line: 5, column: 3 },
    });
    const withLine = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'b',
      status: 'fail',
      severity: 'major',
      message: 'm',
      location: { file: 'src/b.ts', line: 7 },
    });
    const fileOnly = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'c',
      status: 'fail',
      severity: 'major',
      message: 'm',
      location: { file: 'src/c.ts' },
    });
    const out = formatTerminal([withAll, withLine, fileOnly]);
    expect(out).toContain('at src/a.ts:5:3');
    expect(out).toContain('at src/b.ts:7');
    expect(out).toContain('at src/c.ts');
    expect(out).not.toContain('at src/c.ts:');
  });

  test('renders Math.round(durationMs) when set; omits the ms segment when absent', () => {
    const withDuration = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'a',
      durationMs: 42.7,
    });
    const withoutDuration = makeResult({ checkerId: 'console-log-scan', resultId: 'b' });
    const outWith = formatTerminal([withDuration]);
    const outWithout = formatTerminal([withoutDuration]);
    expect(outWith).toContain('43ms');
    expect(outWithout).not.toMatch(/\d+ms/);
  });

  test('groups results by category in canonical registry order', () => {
    // Registry order: code-quality (1st), security (3rd), seo (5th)
    const seo = makeResult({ checkerId: 'meta-description', resultId: 'ok', category: 'seo' });
    const cq = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'ok',
      category: 'code-quality',
    });
    const sec = makeResult({ checkerId: 'security-headers', resultId: 'ok', category: 'security' });
    // Intentionally scrambled input order: seo, code-quality, security
    const out = formatTerminal([seo, cq, sec]);
    const cqPos = out.indexOf('code-quality');
    const secPos = out.indexOf('security');
    const seoPos = out.indexOf('seo');
    expect(cqPos).toBeGreaterThanOrEqual(0);
    expect(secPos).toBeGreaterThanOrEqual(0);
    expect(seoPos).toBeGreaterThanOrEqual(0);
    expect(cqPos).toBeLessThan(secPos);
    expect(secPos).toBeLessThan(seoPos);
  });

  test('orders results within a category: fail > warn > skip > pass', () => {
    const pass = makeResult({ checkerId: 'console-log-scan', resultId: 'pass', status: 'pass' });
    const skip = makeResult({ checkerId: 'console-log-scan', resultId: 'skip', status: 'skip' });
    const warn = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'warn',
      status: 'warn',
      severity: 'minor',
    });
    const fail = makeResult({ checkerId: 'console-log-scan', resultId: 'fail', status: 'fail' });
    // Input order: pass, skip, warn, fail — expect rendered order: fail, warn, skip, pass
    const out = formatTerminal([pass, skip, warn, fail]);
    // Find FAIL/WARN/SKIP/PASS glyph positions (use resultId in message to distinguish)
    const failPos = out.indexOf('FAIL');
    const warnPos = out.indexOf('WARN');
    const skipPos = out.indexOf('SKIP');
    const passPos = out.indexOf('PASS');
    expect(failPos).toBeLessThan(warnPos);
    expect(warnPos).toBeLessThan(skipPos);
    expect(skipPos).toBeLessThan(passPos);
  });

  test('unknown categories appear after known ones, alphabetical', () => {
    const known = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'ok',
      category: 'code-quality',
    });
    const unknown = makeResult({
      checkerId: 'some-checker',
      resultId: 'ok',
      category: 'made-up' as unknown as CheckResult['category'],
    });
    const out = formatTerminal([unknown, known]);
    const knownPos = out.indexOf('code-quality');
    const unknownPos = out.indexOf('made-up');
    expect(knownPos).toBeGreaterThanOrEqual(0);
    expect(unknownPos).toBeGreaterThanOrEqual(0);
    expect(knownPos).toBeLessThan(unknownPos);
  });

  test('color: false produces output free of ANSI escape sequences (no \\x1b[)', () => {
    const r = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'ok',
      status: 'fail',
      severity: 'major',
      message: 'msg',
    });
    const out = formatTerminal([r], { color: false });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is the exact character we need to detect
    expect(out).not.toMatch(/\x1b\[/);
  });

  test('color: true wraps FAIL with the red ANSI sequence \\x1b[31m', () => {
    const r = makeResult({
      checkerId: 'console-log-scan',
      resultId: 'ok',
      status: 'fail',
      severity: 'major',
      message: 'msg',
    });
    const out = formatTerminal([r], { color: true });
    expect(out).toContain('\x1b[31mFAIL\x1b[0m');
  });

  test('summary line includes counts for pass / fail / warn / skip', () => {
    const results = [
      makeResult({ checkerId: 'console-log-scan', resultId: 'a', status: 'pass' }),
      makeResult({ checkerId: 'console-log-scan', resultId: 'b', status: 'pass' }),
      makeResult({ checkerId: 'console-log-scan', resultId: 'c', status: 'fail' }),
      makeResult({
        checkerId: 'console-log-scan',
        resultId: 'd',
        status: 'warn',
        severity: 'minor',
      }),
      makeResult({ checkerId: 'console-log-scan', resultId: 'e', status: 'skip' }),
    ];
    const out = formatTerminal(results);
    expect(out).toContain('2 passed');
    expect(out).toContain('1 failed');
    expect(out).toContain('1 warned');
    expect(out).toContain('1 skipped');
  });
});
