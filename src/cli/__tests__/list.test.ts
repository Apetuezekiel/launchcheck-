import chalk from 'chalk';
import { beforeAll, describe, expect, test } from 'vitest';
import { runList } from '../commands/list.js';

describe('runList', () => {
  beforeAll(() => {
    // Strip ANSI colors so snapshots are stable across terminals/CI.
    chalk.level = 0;
  });

  test('default terminal output: header line + all 8 category section headers with documented counts', () => {
    // Previously a full 59-entry snapshot. The full snapshot churned
    // on every registry description tweak even when the structure was
    // unchanged; the assertions below cover the layout invariants
    // (header line, category ordering, per-category count) without
    // pinning every description line.
    const out = runList({});
    expect(out).toMatch(/^launchcheck v[\w.-]+ — checker registry \(59 entries\)\n/);

    const expectedSections: ReadonlyArray<[string, number]> = [
      ['code-quality', 7],
      ['dependencies', 5],
      ['security', 15],
      ['performance', 10],
      ['seo', 11],
      ['accessibility', 6],
      ['deployment', 4],
      ['documentation', 1],
    ];
    let lastIndex = -1;
    for (const [cat, count] of expectedSections) {
      const header = `${cat} (${count})`;
      const idx = out.indexOf(header);
      expect(idx, `category header "${header}" not found`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
    // Each section is followed by the column header row.
    expect(out).toMatch(/code-quality \(7\)\n\s+id\s+mode\s+default\s+severity\s+description/);
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
