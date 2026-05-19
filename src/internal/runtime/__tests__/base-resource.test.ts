import { describe, expect, test } from 'vitest';
import {
  ResourceDependencyFailedError,
  ResourceUnavailableError,
} from '../../../types/index.js';
import { DependentResource, TestResource } from './test-resource.js';

describe('BaseResource', () => {
  // ---------------------------------------------------------------------------
  // Memoization
  // ---------------------------------------------------------------------------

  test('compute runs exactly once for sequential get() calls', async () => {
    const r = new TestResource({ value: 'v' });
    await r.get();
    await r.get();
    await r.get();
    expect(r.computeCount).toBe(1);
  });

  test('concurrent get() calls share one in-flight promise', async () => {
    const r = new TestResource({ value: 'v', computeDelayMs: 20 });
    const results = await Promise.all([r.get(), r.get(), r.get(), r.get()]);
    expect(results).toEqual(['v', 'v', 'v', 'v']);
    expect(r.computeCount).toBe(1);
  });

  test('failed compute caches the rejection (no retry on subsequent get)', async () => {
    const r = new TestResource({ error: new Error('boom') });
    await expect(r.get()).rejects.toThrow('boom');
    await expect(r.get()).rejects.toThrow('boom');
    expect(r.computeCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Availability
  // ---------------------------------------------------------------------------

  test('isAvailable is true when locally available and no deps', () => {
    const r = new TestResource({ value: 'v' });
    expect(r.isAvailable()).toBe(true);
  });

  test('isAvailable is false when locally unavailable', () => {
    const r = new TestResource({
      locallyAvailable: false,
      localReason: 'missing peer',
    });
    expect(r.isAvailable()).toBe(false);
  });

  test('isAvailable is false when any dependency is unavailable', () => {
    const okDep = new TestResource({ name: 'ok-dep', value: 'x' });
    const badDep = new TestResource({
      name: 'bad-dep',
      locallyAvailable: false,
      localReason: 'broken',
    });
    const r = new TestResource({ value: 'v', deps: [okDep, badDep] });
    expect(r.isAvailable()).toBe(false);
  });

  test('isAvailable is true when all deps are available', () => {
    const a = new TestResource({ name: 'a', value: 'a' });
    const b = new TestResource({ name: 'b', value: 'b' });
    const r = new TestResource({ value: 'v', deps: [a, b] });
    expect(r.isAvailable()).toBe(true);
  });

  test('unavailableReason surfaces local reason when locally unavailable', () => {
    const r = new TestResource({
      locallyAvailable: false,
      localReason: 'missing peer dep',
    });
    expect(r.unavailableReason()).toBe('missing peer dep');
  });

  test('unavailableReason names the unavailable dependency and its reason', () => {
    const badDep = new TestResource({
      name: 'chrome',
      locallyAvailable: false,
      localReason: 'puppeteer not installed',
    });
    const r = new TestResource({ name: 'lighthouse', value: 'v', deps: [badDep] });
    const reason = r.unavailableReason();
    expect(reason).not.toBeNull();
    expect(reason).toContain('chrome');
    expect(reason).toContain('puppeteer not installed');
  });

  // ---------------------------------------------------------------------------
  // get() error semantics
  // ---------------------------------------------------------------------------

  test('get() rejects with ResourceUnavailableError when not available', async () => {
    const r = new TestResource({
      name: 'chrome',
      locallyAvailable: false,
      localReason: 'puppeteer not installed',
      value: 'v',
    });
    await expect(r.get()).rejects.toBeInstanceOf(ResourceUnavailableError);
    await expect(r.get()).rejects.toMatchObject({
      resourceName: 'chrome',
      reason: 'puppeteer not installed',
    });
    expect(r.computeCount).toBe(0);
  });

  test('get() rejects with the underlying error when compute throws', async () => {
    const underlying = new Error('compute exploded');
    const r = new TestResource({ error: underlying });
    await expect(r.get()).rejects.toBe(underlying);
  });

  // ---------------------------------------------------------------------------
  // wasComputed
  // ---------------------------------------------------------------------------

  test('wasComputed is false before get()', () => {
    const r = new TestResource({ value: 'v' });
    expect(r.wasComputed()).toBe(false);
  });

  test('wasComputed is true after successful compute', async () => {
    const r = new TestResource({ value: 'v' });
    await r.get();
    expect(r.wasComputed()).toBe(true);
  });

  test('wasComputed is true after failed compute', async () => {
    const r = new TestResource({ error: new Error('nope') });
    await expect(r.get()).rejects.toThrow('nope');
    expect(r.wasComputed()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // getDependency helper (exercised via DependentResource subclass)
  // ---------------------------------------------------------------------------

  test('getDependency wraps non-Resource errors in ResourceDependencyFailedError', async () => {
    const upstream = new TestResource({
      name: 'upstream',
      error: new Error('network down'),
    });
    const r = new DependentResource({
      name: 'downstream',
      depName: 'upstream',
      dep: upstream,
    });
    await expect(r.get()).rejects.toBeInstanceOf(ResourceDependencyFailedError);
  });

  test('getDependency wraps the dep name and resource name correctly', async () => {
    const upstream = new TestResource({
      name: 'upstream-internal-name',
      error: new Error('original failure'),
    });
    const r = new DependentResource({
      name: 'downstream',
      depName: 'upstream-label',
      dep: upstream,
    });
    try {
      await r.get();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResourceDependencyFailedError);
      const wrapped = err as ResourceDependencyFailedError;
      expect(wrapped.resourceName).toBe('downstream');
      expect(wrapped.failedDependency).toBe('upstream-label');
      expect(wrapped.originalError.message).toBe('original failure');
    }
  });

  test('getDependency does not double-wrap ResourceDependencyFailedError', async () => {
    // upstream is itself a DependentResource whose upstream throws, so its
    // .get() rejects with a ResourceDependencyFailedError. The middle layer
    // must let that error propagate unchanged rather than wrapping it again.
    const leaf = new TestResource({
      name: 'leaf',
      error: new Error('leaf failure'),
    });
    const middle = new DependentResource({
      name: 'middle',
      depName: 'leaf',
      dep: leaf,
    });
    const top = new DependentResource({
      name: 'top',
      depName: 'middle',
      dep: middle,
    });
    try {
      await top.get();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResourceDependencyFailedError);
      const wrapped = err as ResourceDependencyFailedError;
      // The error should still name middle's wrap (resourceName: 'middle',
      // failedDependency: 'leaf') — proving top did NOT re-wrap.
      expect(wrapped.resourceName).toBe('middle');
      expect(wrapped.failedDependency).toBe('leaf');
      expect(wrapped.originalError.message).toBe('leaf failure');
    }
  });

  test('getDependency propagates the value on success', async () => {
    const upstream = new TestResource({ name: 'upstream', value: 'hello' });
    const r = new DependentResource<string, string>({
      name: 'downstream',
      depName: 'upstream',
      dep: upstream,
      transform: (v) => `got:${v}`,
    });
    await expect(r.get()).resolves.toBe('got:hello');
  });
});
