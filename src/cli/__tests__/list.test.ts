import chalk from 'chalk';
import { beforeAll, describe, expect, test } from 'vitest';
import { runList } from '../commands/list.js';

describe('runList', () => {
  beforeAll(() => {
    // Strip ANSI colors so snapshots are stable across terminals/CI.
    chalk.level = 0;
  });

  test('default terminal output matches snapshot', () => {
    expect(runList({})).toMatchSnapshot();
  });

  test('--json output is valid JSON', () => {
    const out = runList({ json: true });
    expect(() => JSON.parse(out)).not.toThrow();
  });

  test('--json output has all 59 entries', () => {
    const parsed = JSON.parse(runList({ json: true }));
    expect(parsed.count).toBe(59);
    expect(parsed.entries).toHaveLength(59);
  });

  test('--json structure matches snapshot', () => {
    const parsed = JSON.parse(runList({ json: true }));
    // Snapshot the shape, not all 59 entries (would bloat the snapshot file).
    // Use a small sample and the metadata.
    expect({
      version: parsed.version,
      count: parsed.count,
      sample: parsed.entries.slice(0, 3),
    }).toMatchSnapshot();
  });

  test('--category code-quality returns 7 entries, all code-quality', () => {
    const parsed = JSON.parse(runList({ json: true, category: 'code-quality' }));
    expect(parsed.count).toBe(7);
    expect(parsed.entries.every((e: { category: string }) => e.category === 'code-quality')).toBe(
      true,
    );
  });

  test('--category for every valid category matches the documented count', () => {
    const expected: Record<string, number> = {
      'code-quality': 7,
      dependencies: 5,
      security: 15,
      performance: 10,
      seo: 11,
      accessibility: 6,
      deployment: 4,
      documentation: 1,
    };
    for (const [cat, count] of Object.entries(expected)) {
      const parsed = JSON.parse(runList({ json: true, category: cat }));
      expect(parsed.count).toBe(count);
    }
  });

  test('unknown category throws with suggestion', () => {
    expect(() => runList({ category: 'sercurity' })).toThrow(/Unknown category/);
    expect(() => runList({ category: 'sercurity' })).toThrow(/security/);
  });

  test('unknown category with no close match throws without suggestion', () => {
    expect(() => runList({ category: 'xxxxxxxxxxx' })).toThrow(/Unknown category/);
    // No 'Did you mean' phrase in the message.
    expect(() => runList({ category: 'xxxxxxxxxxx' })).not.toThrow(/Did you mean/);
  });
});
