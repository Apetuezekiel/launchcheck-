import { describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import { formatHtml } from '../html.js';

function r(over: Partial<CheckResult>): CheckResult {
  return {
    checkerId: 'csp-present',
    resultId: 'csp-missing',
    status: 'fail',
    message: 'CSP absent',
    severity: 'major',
    category: 'security',
    ...over,
  };
}

describe('formatHtml', () => {
  test('self-contained document with summary counts', () => {
    const html = formatHtml([
      r({ status: 'fail' }),
      r({ resultId: 'b', status: 'pass' }),
      r({ resultId: 'c', status: 'warn' }),
    ]);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).not.toContain('<script');
    expect(html).toContain('1 failed');
    expect(html).toContain('1 warned');
    expect(html).toContain('1 passed');
    expect(html).toContain('launchcheck report');
  });

  test('escapes HTML in dynamic fields (no injection)', () => {
    const html = formatHtml([r({ message: '<img src=x onerror=alert(1)>', fix: 'a & b < c' })]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('a &amp; b &lt; c');
  });

  test('groups live findings by URL; static findings under Project', () => {
    const html = formatHtml([
      r({ url: 'https://a.test/' }),
      r({ checkerId: 'console-log-scan', resultId: 'x', category: 'code-quality' }),
    ]);
    expect(html).toContain('https://a.test/');
    expect(html).toContain('>Project<');
    // the URL section heading precedes the Project section (static rendered last)
    expect(html.indexOf('https://a.test/')).toBeLessThan(html.indexOf('>Project<'));
  });

  test('renders fix text and a status badge', () => {
    const html = formatHtml([r({ fix: 'Add a CSP header.' })]);
    expect(html).toContain('fix: Add a CSP header.');
    expect(html).toContain('>FAIL<');
  });
});
