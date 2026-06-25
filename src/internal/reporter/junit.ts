import type { CheckResult } from '../../types/index.js';
import { fingerprint } from './fingerprint.js';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats results as JUnit XML for CI test reporters. One <testcase> per result,
 * grouped into a <testsuite> per category. Mapping: 'fail' -> <failure>,
 * 'skip' -> <skipped>, 'warn' -> passing testcase with a <system-out> note,
 * 'pass' -> passing testcase. This mirrors the exit-code policy (warns don't fail).
 */
export function formatJunit(results: ReadonlyArray<CheckResult>): string {
  const byCategory = new Map<string, CheckResult[]>();
  for (const r of results) {
    const arr = byCategory.get(r.category);
    if (arr) {
      arr.push(r);
    } else {
      byCategory.set(r.category, [r]);
    }
  }

  const totalFailures = results.filter((r) => r.status === 'fail').length;
  const totalSkipped = results.filter((r) => r.status === 'skip').length;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="launchcheck" tests="${results.length}" failures="${totalFailures}" skipped="${totalSkipped}">`,
  );

  for (const [category, group] of byCategory) {
    const failures = group.filter((r) => r.status === 'fail').length;
    const skipped = group.filter((r) => r.status === 'skip').length;
    lines.push(
      `  <testsuite name="${xmlEscape(category)}" tests="${group.length}" failures="${failures}" skipped="${skipped}">`,
    );
    for (const r of group) {
      const name = xmlEscape(fingerprint(r));
      const time = r.durationMs !== undefined ? (r.durationMs / 1000).toFixed(3) : '0';
      const open = `    <testcase name="${name}" classname="${xmlEscape(category)}" time="${time}">`;
      if (r.status === 'fail') {
        const msg = xmlEscape(r.message);
        const body = xmlEscape(r.detail ? `${r.message}\n${r.detail}` : r.message);
        lines.push(open);
        lines.push(
          `      <failure message="${msg}" type="${xmlEscape(r.severity)}">${body}</failure>`,
        );
        lines.push('    </testcase>');
      } else if (r.status === 'skip') {
        lines.push(open);
        lines.push(`      <skipped message="${xmlEscape(r.message)}"/>`);
        lines.push('    </testcase>');
      } else if (r.status === 'warn') {
        lines.push(open);
        lines.push(`      <system-out>${xmlEscape(`warn: ${r.message}`)}</system-out>`);
        lines.push('    </testcase>');
      } else {
        lines.push(`${open}</testcase>`);
      }
    }
    lines.push('  </testsuite>');
  }

  lines.push('</testsuites>');
  return `${lines.join('\n')}\n`;
}
