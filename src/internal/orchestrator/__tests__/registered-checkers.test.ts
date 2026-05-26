import { describe, expect, test } from 'vitest';
import type { Checker } from '../../../types/index.js';
import { ALL_CHECKERS, validateCheckerRegistration } from '../registered-checkers.js';

describe('ALL_CHECKERS', () => {
  test('is frozen', () => {
    expect(Object.isFrozen(ALL_CHECKERS)).toBe(true);
  });

  test('is non-empty', () => {
    expect(ALL_CHECKERS.length).toBeGreaterThan(0);
  });
});

describe('validateCheckerRegistration', () => {
  test('passes for the production ALL_CHECKERS list (drift guard)', () => {
    expect(() => validateCheckerRegistration()).not.toThrow();
    expect(() => validateCheckerRegistration(ALL_CHECKERS)).not.toThrow();
  });

  test('throws when a checker id has no matching RegistryEntry', () => {
    const bogus: Checker = {
      id: 'definitely-not-a-real-checker-id',
      name: 'bogus',
      category: 'code-quality',
      mode: 'static',
      run: async () => [],
    };
    expect(() => validateCheckerRegistration([bogus])).toThrowError(/no matching RegistryEntry/);
  });

  test('throws when a checker category does not match its RegistryEntry', () => {
    // console-log-scan is registered as category 'code-quality'; claim 'security'.
    const drifted: Checker = {
      id: 'console-log-scan',
      name: 'drifted',
      category: 'security',
      mode: 'static',
      run: async () => [],
    };
    expect(() => validateCheckerRegistration([drifted])).toThrowError(
      /category 'security' does not match RegistryEntry category 'code-quality'/,
    );
  });

  test('throws when a checker mode does not match its RegistryEntry', () => {
    // console-log-scan is registered as mode 'static'; claim 'live'.
    const drifted: Checker = {
      id: 'console-log-scan',
      name: 'drifted',
      category: 'code-quality',
      mode: 'live',
      run: async () => [],
    };
    expect(() => validateCheckerRegistration([drifted])).toThrowError(
      /mode 'live' does not match RegistryEntry mode 'static'/,
    );
  });
});
