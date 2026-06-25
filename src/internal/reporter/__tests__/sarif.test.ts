import { describe, expect, test } from 'vitest';
import type { CheckResult } from '../../../types/index.js';
import { formatSarif } from '../sarif.js';

const results: CheckResult[] = [
  {
    checkerId: 'csp-present',
    resultId: 'csp-missing',
    status: 'fail',
    message: 'CSP absent',
    severity: 'major',
    category: 'security',
    fix: 'Add a CSP.',
  },
  {
    checkerId: 'permissions-policy-present',
    resultId: 'pp-missing',
    status: 'fail',
    message: 'PP absent',
    severity: 'minor',
    category: 'security',
  },
  {
    checkerId: 'todo-fixme-scan',
    resultId: 'todo',
    status: 'warn',
    message: '2 TODOs',
    severity: 'info',
    category: 'code-quality',
    location: { file: 'src/x.ts', line: 9, column: 3 },
  },
  {
    checkerId: 'hsts-present',
    resultId: 'hsts-present',
    status: 'pass',
    message: 'ok',
    severity: 'critical',
    category: 'security',
  },
  {
    checkerId: 'ssl-valid',
    resultId: 'ssl-unavailable',
    status: 'skip',
    message: 'skip',
    severity: 'critical',
    category: 'security',
  },
];

describe('formatSarif', () => {
  const doc = JSON.parse(formatSarif(results));

  test('valid SARIF 2.1.0 envelope', () => {
    expect(doc.version).toBe('2.1.0');
    expect(doc.runs[0].tool.driver.name).toBe('launchcheck');
  });
  test('emits only fail/warn findings (no pass/skip)', () => {
    const ids = doc.runs[0].results.map((x: { ruleId: string }) => x.ruleId);
    expect(ids).toEqual(['csp-present', 'permissions-policy-present', 'todo-fixme-scan']);
  });
  test('severity maps to SARIF level', () => {
    const byRule = Object.fromEntries(
      doc.runs[0].results.map((x: { ruleId: string; level: string }) => [x.ruleId, x.level]),
    );
    expect(byRule['csp-present']).toBe('error'); // major
    expect(byRule['permissions-policy-present']).toBe('warning'); // minor
    expect(byRule['todo-fixme-scan']).toBe('note'); // info
  });
  test('partial fingerprints + located finding maps to physicalLocation', () => {
    const todo = doc.runs[0].results.find(
      (x: { ruleId: string }) => x.ruleId === 'todo-fixme-scan',
    );
    expect(todo.partialFingerprints.launchcheckId).toBe('todo-fixme-scan/todo@src/x.ts:9');
    expect(todo.locations[0].physicalLocation.artifactLocation.uri).toBe('src/x.ts');
    expect(todo.locations[0].physicalLocation.region.startLine).toBe(9);
  });
  test('fix text folded into the message', () => {
    const csp = doc.runs[0].results.find((x: { ruleId: string }) => x.ruleId === 'csp-present');
    expect(csp.message.text).toContain('Fix: Add a CSP.');
  });
  test('rules deduped by checkerId', () => {
    const ruleIds = doc.runs[0].tool.driver.rules.map((x: { id: string }) => x.id);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    expect(ruleIds).toContain('csp-present');
  });
});

describe('formatSarif with live URL-tagged findings', () => {
  const doc = JSON.parse(
    formatSarif([
      {
        checkerId: 'csp-present',
        resultId: 'csp-missing',
        status: 'fail',
        message: 'CSP absent',
        severity: 'major',
        category: 'security',
        url: 'https://example.test/',
      },
    ]),
  );
  const res = doc.runs[0].results[0];

  test('url exposed as result property', () => {
    expect(res.properties.url).toBe('https://example.test/');
  });
  test('locationless live finding uses the URL as the artifact uri', () => {
    expect(res.locations[0].physicalLocation.artifactLocation.uri).toBe('https://example.test/');
  });
  test('url is part of the partial fingerprint', () => {
    expect(res.partialFingerprints.launchcheckId).toBe(
      'csp-present/csp-missing@https://example.test/',
    );
  });
});
