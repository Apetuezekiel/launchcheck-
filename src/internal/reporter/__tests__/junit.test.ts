import { describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import { formatJunit } from '../junit.js';

const results: CheckResult[] = [
  {
    checkerId: 'csp-present',
    resultId: 'csp-missing',
    status: 'fail',
    message: 'CSP <absent> & gone',
    severity: 'major',
    category: 'security',
    detail: 'line 1',
  },
  {
    checkerId: 'todo-fixme-scan',
    resultId: 'todo',
    status: 'warn',
    message: '2 TODOs',
    severity: 'info',
    category: 'code-quality',
  },
  {
    checkerId: 'ssl-valid',
    resultId: 'ssl-unavailable',
    status: 'skip',
    message: 'no tls',
    severity: 'critical',
    category: 'security',
  },
  {
    checkerId: 'hsts-present',
    resultId: 'hsts-present',
    status: 'pass',
    message: 'ok',
    severity: 'critical',
    category: 'security',
  },
];

describe('formatJunit', () => {
  const xml = formatJunit(results);

  test('declares XML and testsuites counts', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<testsuites name="launchcheck" tests="4" failures="1" skipped="1">');
  });
  test('fail -> failure, skip -> skipped, pass -> closed testcase', () => {
    expect(xml).toContain('<failure message="CSP &lt;absent&gt; &amp; gone" type="major">');
    expect(xml).toContain('<skipped message="no tls"/>');
    expect(xml).toMatch(/<testcase name="hsts-present\/hsts-present"[^>]*><\/testcase>/);
  });
  test('warn is a passing testcase with system-out', () => {
    expect(xml).toContain('<system-out>warn: 2 TODOs</system-out>');
  });
  test('xml-escapes message content', () => {
    expect(xml).not.toContain('CSP <absent>');
    expect(xml).toContain('&lt;absent&gt;');
  });
});
