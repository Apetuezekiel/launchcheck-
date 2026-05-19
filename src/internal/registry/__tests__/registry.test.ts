import { describe, expect, test } from 'vitest';
import { REGISTRY, findByCategory, findById } from '../index.js';

const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const RESERVED_NAMESPACE = /^__.+__$/;

const CHECK_CATEGORIES = [
  'code-quality',
  'security',
  'performance',
  'seo',
  'accessibility',
  'dependencies',
  'deployment',
  'documentation',
] as const;

const DOCUMENTED_THRESHOLD_KEYS = new Set([
  'lighthouse-performance',
  'lighthouse-accessibility',
  'lighthouse-best-practices',
  'lighthouse-seo',
  'lcp',
  'cls',
  'inp',
  'ssl-expiry-warning-days',
  'large-file-bytes',
]);

const DOCUMENTED_OPTIONS_KEYS = new Set([
  'secret-scan',
  'email-auth',
  'license-compatibility',
  'readme-sections',
  'health-endpoint',
  'cors-policy',
]);

const DOCUMENTED_PEER_DEPS = new Set(['puppeteer', 'typescript']);

describe('REGISTRY invariants', () => {
  // Cardinality
  test('contains exactly 59 entries', () => {
    expect(REGISTRY.length).toBe(59);
  });

  test('static entries === 16', () => {
    const count = REGISTRY.filter((e) => e.mode === 'static').length;
    expect(count).toBe(16);
  });

  test('live entries === 43', () => {
    const count = REGISTRY.filter((e) => e.mode === 'live').length;
    expect(count).toBe(43);
  });

  test('per-category counts === [7,5,15,10,11,6,4,1] in declaration order', () => {
    const declarationOrder = [
      'code-quality',
      'dependencies',
      'security',
      'performance',
      'seo',
      'accessibility',
      'deployment',
      'documentation',
    ] as const;
    const expectedCounts = [7, 5, 15, 10, 11, 6, 4, 1];
    const actualCounts = declarationOrder.map(
      (cat) => REGISTRY.filter((e) => e.category === cat).length,
    );
    expect(actualCounts).toEqual(expectedCounts);
  });

  // Identifier hygiene
  test('all ids match /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/', () => {
    const offenders = REGISTRY.filter((e) => !ID_PATTERN.test(e.id)).map((e) => e.id);
    expect(offenders).toEqual([]);
  });

  test('all ids are unique', () => {
    const ids = REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('no id matches /^__.+__$/ (reserved namespace)', () => {
    const offenders = REGISTRY.filter((e) => RESERVED_NAMESPACE.test(e.id)).map((e) => e.id);
    expect(offenders).toEqual([]);
  });

  test('no id equals any CheckCategory name', () => {
    const categoryNames = new Set<string>(CHECK_CATEGORIES);
    const offenders = REGISTRY.filter((e) => categoryNames.has(e.id)).map((e) => e.id);
    expect(offenders).toEqual([]);
  });

  // Field invariants
  test('every live entry has a non-empty consumes array', () => {
    const offenders = REGISTRY.filter(
      (e) => e.mode === 'live' && (!e.consumes || e.consumes.length === 0),
    ).map((e) => e.id);
    expect(offenders).toEqual([]);
  });

  test('every static entry omits consumes', () => {
    const offenders = REGISTRY.filter((e) => e.mode === 'static' && e.consumes !== undefined).map(
      (e) => e.id,
    );
    expect(offenders).toEqual([]);
  });

  test('defaultEnabled is true for every v1 entry', () => {
    const offenders = REGISTRY.filter((e) => e.defaultEnabled !== true).map((e) => e.id);
    expect(offenders).toEqual([]);
  });

  test('maxSeverity is one of critical|major|minor|info for every entry', () => {
    const allowed = new Set(['critical', 'major', 'minor', 'info']);
    const offenders = REGISTRY.filter((e) => !allowed.has(e.maxSeverity)).map((e) => e.id);
    expect(offenders).toEqual([]);
  });

  // Cross-references
  test('every thresholdKeys entry exists in the documented threshold-key set', () => {
    const offenders: Array<{ id: string; key: string }> = [];
    for (const entry of REGISTRY) {
      if (!entry.thresholdKeys) continue;
      for (const key of entry.thresholdKeys) {
        if (!DOCUMENTED_THRESHOLD_KEYS.has(key)) {
          offenders.push({ id: entry.id, key });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('every optionsKey is one of: secret-scan, email-auth, license-compatibility, readme-sections, health-endpoint, cors-policy', () => {
    const offenders = REGISTRY.filter(
      (e) => e.optionsKey !== undefined && !DOCUMENTED_OPTIONS_KEYS.has(e.optionsKey),
    ).map((e) => ({ id: e.id, optionsKey: e.optionsKey }));
    expect(offenders).toEqual([]);
  });

  test('every requiresPeerDep is one of: puppeteer, typescript', () => {
    const offenders = REGISTRY.filter(
      (e) => e.requiresPeerDep !== undefined && !DOCUMENTED_PEER_DEPS.has(e.requiresPeerDep),
    ).map((e) => ({ id: e.id, requiresPeerDep: e.requiresPeerDep }));
    expect(offenders).toEqual([]);
  });

  test('requiresGit entries are static-mode only', () => {
    const offenders = REGISTRY.filter((e) => e.requiresGit === true && e.mode !== 'static').map(
      (e) => e.id,
    );
    expect(offenders).toEqual([]);
  });

  // Resource consumption sanity
  test('requiresPeerDep=puppeteer iff consumes includes lighthouse or axe', () => {
    const offenders: Array<{ id: string; reason: string }> = [];
    for (const entry of REGISTRY) {
      const usesPuppeteerResource =
        entry.consumes?.includes('lighthouse') || entry.consumes?.includes('axe');
      const hasPuppeteerDep = entry.requiresPeerDep === 'puppeteer';
      if (usesPuppeteerResource && !hasPuppeteerDep) {
        offenders.push({
          id: entry.id,
          reason: 'consumes lighthouse/axe but missing requiresPeerDep=puppeteer',
        });
      } else if (!usesPuppeteerResource && hasPuppeteerDep) {
        offenders.push({
          id: entry.id,
          reason: 'has requiresPeerDep=puppeteer but does not consume lighthouse/axe',
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  // Helpers
  test('findById returns the entry for a known id and undefined for unknown', () => {
    const found = findById('hsts-present');
    expect(found?.id).toBe('hsts-present');
    expect(found?.category).toBe('security');

    expect(findById('nonexistent-checker')).toBeUndefined();
  });

  test('findByCategory returns the documented count per category', () => {
    expect(findByCategory('code-quality')).toHaveLength(7);
    expect(findByCategory('dependencies')).toHaveLength(5);
    expect(findByCategory('security')).toHaveLength(15);
    expect(findByCategory('performance')).toHaveLength(10);
    expect(findByCategory('seo')).toHaveLength(11);
    expect(findByCategory('accessibility')).toHaveLength(6);
    expect(findByCategory('deployment')).toHaveLength(4);
    expect(findByCategory('documentation')).toHaveLength(1);
  });
});
