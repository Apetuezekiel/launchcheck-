import { describe, expect, test } from 'vitest';
import { closestMatch, levenshtein } from '../levenshtein.js';

/**
 * Pins the plain-Levenshtein contract (no Damerau-style transposition
 * shortcut) and closestMatch's first-wins tie-break behavior. Both are
 * relied on by the `list --category <name>` "did you mean" suggestion
 * shown to users.
 */
describe('levenshtein', () => {
  test('identical strings have distance 0', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('security', 'security')).toBe(0);
  });

  test('empty-string short-circuit returns the other length', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  test('single edits each cost 1', () => {
    // substitution
    expect(levenshtein('cat', 'bat')).toBe(1);
    // insertion
    expect(levenshtein('cat', 'cats')).toBe(1);
    // deletion
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  test('transposition costs 2 (plain Levenshtein, no Damerau swap)', () => {
    // 'ab' -> 'ba' requires two substitutions under plain Levenshtein.
    expect(levenshtein('ab', 'ba')).toBe(2);
    // 'form' -> 'from' is a common adjacent-swap transposition; under
    // plain Levenshtein that is two substitutions, NOT one.
    expect(levenshtein('form', 'from')).toBe(2);
  });

  test('classic kitten/sitting case is 3 and is symmetric', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('sitting', 'kitten')).toBe(3);
  });
});

describe('closestMatch', () => {
  test('returns the unique closest candidate', () => {
    expect(closestMatch('sercurity', ['security', 'performance', 'accessibility'])).toBe(
      'security',
    );
  });

  test('returns null when no candidate is within maxDistance', () => {
    expect(closestMatch('zzzzzzzzzzz', ['security', 'performance'])).toBeNull();
  });

  test('returns null on an empty candidate list', () => {
    expect(closestMatch('security', [])).toBeNull();
  });

  test('ties broken by candidate order — first equal-distance candidate wins', () => {
    // 'aaa' and 'aab' are both distance 1 from 'aac'. Implementation
    // only replaces best when d < best.distance (strict), so the first
    // candidate of equal distance keeps the slot.
    expect(closestMatch('aac', ['aaa', 'aab'])).toBe('aaa');
    expect(closestMatch('aac', ['aab', 'aaa'])).toBe('aab');
  });

  test('default maxDistance=3 includes distance-3 but excludes distance-4', () => {
    expect(closestMatch('abcd', ['xyzw'])).toBeNull(); // distance 4
    expect(closestMatch('abcd', ['abcz'])).toBe('abcz'); // distance 1
    expect(closestMatch('abc', ['xyz'])).toBe('xyz'); // distance 3
  });

  test('explicit maxDistance=1 excludes distance-2 candidates', () => {
    expect(closestMatch('cat', ['bbb'], 1)).toBeNull();
    expect(closestMatch('cat', ['cap'], 1)).toBe('cap');
  });

  test('explicit maxDistance=0 only returns exact matches', () => {
    expect(closestMatch('cat', ['cat', 'cats'], 0)).toBe('cat');
    expect(closestMatch('cat', ['cap'], 0)).toBeNull();
  });

  test('exact match wins over near matches regardless of order', () => {
    expect(closestMatch('security', ['code-quality', 'security'])).toBe('security');
    expect(closestMatch('security', ['security', 'sercurity'])).toBe('security');
  });
});
