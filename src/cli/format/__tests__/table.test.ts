import chalk from 'chalk';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { RegistryEntry } from '../../../internal/registry/types.js';
import { formatListTerminal } from '../table.js';

/**
 * Direct tests for the `launchcheck list` terminal formatter. The full
 * 59-entry registry rendering is asserted via behavior checks in
 * list.test.ts; this file exercises edge cases against synthetic
 * registry entries — pluralization, severity rendering, default
 * column, long-id pad short-circuit.
 */

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'fake-id',
    name: 'Fake',
    category: 'code-quality',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'major',
    description: 'A fake checker.',
    ...overrides,
  };
}

describe('formatListTerminal', () => {
  beforeAll(() => {
    // Default: strip ANSI so behavior assertions match plain text. One
    // test below opts back into colored output and restores afterwards.
    chalk.level = 0;
  });

  test('header reports "0 entries" for an empty entry list (plural)', () => {
    expect(formatListTerminal([])).toContain('(0 entries)');
  });

  test('header reports "1 entry" for a single entry (singular)', () => {
    const out = formatListTerminal([entry({ id: 'only' })]);
    expect(out).toContain('(1 entry)');
    expect(out).not.toContain('1 entries');
  });

  test('header reports "N entries" for 2+ entries (plural)', () => {
    const out = formatListTerminal([entry({ id: 'one' }), entry({ id: 'two' })]);
    expect(out).toContain('(2 entries)');
  });

  test('groups by category in first-appearance order, not registry order', () => {
    const out = formatListTerminal([
      entry({ id: 'a', category: 'security' }),
      entry({ id: 'b', category: 'code-quality' }),
      entry({ id: 'c', category: 'security' }),
    ]);
    const secHeader = out.indexOf('security (2)');
    const cqHeader = out.indexOf('code-quality (1)');
    expect(secHeader).toBeGreaterThanOrEqual(0);
    expect(cqHeader).toBeGreaterThan(secHeader);
  });

  test('per-category count in section header matches the entry count', () => {
    const out = formatListTerminal([
      entry({ id: 'a', category: 'security' }),
      entry({ id: 'b', category: 'security' }),
      entry({ id: 'c', category: 'security' }),
    ]);
    expect(out).toContain('security (3)');
  });

  test('default column renders "on" when defaultEnabled is true', () => {
    const out = formatListTerminal([entry({ id: 'a', defaultEnabled: true })]);
    expect(out).toMatch(/a\s+static\s+on\s+major/);
  });

  test('default column renders "off" when defaultEnabled is false', () => {
    const out = formatListTerminal([entry({ id: 'b', defaultEnabled: false })]);
    expect(out).toMatch(/b\s+static\s+off\s+major/);
  });

  test('renders every severity value (critical, major, minor, info)', () => {
    const out = formatListTerminal([
      entry({ id: 'c1', maxSeverity: 'critical' }),
      entry({ id: 'c2', maxSeverity: 'major' }),
      entry({ id: 'c3', maxSeverity: 'minor' }),
      entry({ id: 'c4', maxSeverity: 'info' }),
    ]);
    expect(out).toContain('critical');
    expect(out).toContain('major');
    expect(out).toContain('minor');
    expect(out).toContain('info');
  });

  test('pad short-circuit: id at exactly ID_WIDTH (32) emits a single trailing space', () => {
    const id = 'x'.repeat(32);
    const out = formatListTerminal([entry({ id })]);
    expect(out).toContain(`${id} static`);
  });

  test('pad short-circuit: id exceeding ID_WIDTH is not truncated and still emits one trailing space', () => {
    const id = 'x'.repeat(40);
    const out = formatListTerminal([entry({ id })]);
    expect(out).toContain(`${id} static`);
  });

  test('renders the entry description verbatim in the description column', () => {
    const out = formatListTerminal([entry({ id: 'a', description: 'A fairly precise summary.' })]);
    expect(out).toContain('A fairly precise summary.');
  });

  describe('with colors enabled (chalk.level > 0)', () => {
    let restoreLevel: 0 | 1 | 2 | 3;
    beforeAll(() => {
      restoreLevel = chalk.level;
      chalk.level = 3;
    });
    afterAll(() => {
      chalk.level = restoreLevel;
    });

    test('severity column is wrapped in ANSI escape codes for critical', () => {
      const out = formatListTerminal([entry({ id: 'c', maxSeverity: 'critical' })]);
      // An ANSI escape introducer (ESC + '[') appears in the output and
      // 'critical' appears soon after one. Asserted via index math to
      // keep the regex free of control characters.
      const esc = '\x1b[';
      const firstEsc = out.indexOf(esc);
      const critIdx = out.indexOf('critical');
      expect(firstEsc).toBeGreaterThanOrEqual(0);
      expect(critIdx).toBeGreaterThan(firstEsc);
    });
  });
});
