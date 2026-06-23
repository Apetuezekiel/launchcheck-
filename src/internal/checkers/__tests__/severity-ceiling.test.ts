import { describe, expect, test } from 'vitest';
import type { AxeResult, LighthouseResult } from '../../../types/index.js';
import { ALL_CHECKERS } from '../../orchestrator/registered-checkers.js';
import { findById } from '../../registry/index.js';
import { makeLiveContext } from './live-context.js';

/**
 * Guard for the architecture invariant: a checker's emitted `severity` must
 * equal its RegistryEntry.maxSeverity (the source of truth). This is otherwise
 * unenforced — PR #42 shipped two axe checkers exceeding their ceiling and the
 * suite stayed green. This test runs every axe-backed checker against an
 * available axe resource (no violations → the pass path, which still carries
 * the checker's severity) and asserts the contract for every emitted result.
 */
const EMPTY_AXE: AxeResult = { violations: [], passes: [], incomplete: [], inapplicable: [] };

const axeCheckers = ALL_CHECKERS.filter((c) => c.consumes?.includes('axe'));

describe('axe-backed checkers respect registry maxSeverity', () => {
  test('there is at least one axe-backed checker to guard', () => {
    expect(axeCheckers.length).toBeGreaterThan(0);
  });

  for (const checker of axeCheckers) {
    test(`${checker.id} emits severity === registry maxSeverity`, async () => {
      const max = findById(checker.id)?.maxSeverity;
      expect(max).toBeDefined();
      const results = await checker.run(makeLiveContext({ axe: EMPTY_AXE }));
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.severity).toBe(max);
      }
    });
  }
});

// The lighthouse fixture scores and metrics all pass thresholds.
const LIGHTHOUSE_RESULT: LighthouseResult = {
  categories: {
    performance: { score: 1 },
    accessibility: { score: 1 },
    'best-practices': { score: 1 },
    seo: { score: 1 },
  },
  audits: {
    'largest-contentful-paint': { numericValue: 100 },
    'cumulative-layout-shift': { numericValue: 0 },
    'interaction-to-next-paint': { numericValue: 50 },
  },
};

const lighthouseCheckers = ALL_CHECKERS.filter((c) => c.consumes?.includes('lighthouse'));

describe('lighthouse-backed checkers respect registry maxSeverity', () => {
  test('there is at least one lighthouse-backed checker to guard', () => {
    expect(lighthouseCheckers.length).toBeGreaterThan(0);
  });

  for (const checker of lighthouseCheckers) {
    test(`${checker.id} emits severity === registry maxSeverity`, async () => {
      const max = findById(checker.id)?.maxSeverity;
      expect(max).toBeDefined();
      const results = await checker.run(makeLiveContext({ lighthouse: LIGHTHOUSE_RESULT }));
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.severity).toBe(max);
      }
    });
  }
});
