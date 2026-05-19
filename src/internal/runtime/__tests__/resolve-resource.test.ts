import { describe, expect, test } from 'vitest';
import { ResourceDependencyFailedError, ResourceUnavailableError } from '../../../types/index.js';
import { resolveResource } from '../resolve-resource.js';
import { TestResource } from './test-resource.js';

describe('resolveResource', () => {
  test('returns kind=ok with the value on successful compute', async () => {
    const r = new TestResource<string>({ value: 'hello' });
    const outcome = await resolveResource(r);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.value).toBe('hello');
    }
  });

  test('returns kind=skip when resource is unavailable on entry', async () => {
    const r = new TestResource<string>({
      name: 'chrome',
      locallyAvailable: false,
      localReason: 'puppeteer not installed',
      value: 'hello',
    });
    const outcome = await resolveResource(r);
    expect(outcome.kind).toBe('skip');
    if (outcome.kind === 'skip') {
      expect(outcome.reason).toBe('puppeteer not installed');
    }
    expect(r.computeCount).toBe(0);
  });

  test('returns kind=skip when compute throws ResourceUnavailableError', async () => {
    // The resource passes isAvailable() but compute() itself throws
    // ResourceUnavailableError. The helper must surface the .reason field.
    const thrown = new ResourceUnavailableError('chrome', 'transient unavailability');
    const r = new TestResource<string>({ error: thrown });
    const outcome = await resolveResource(r);
    expect(outcome.kind).toBe('skip');
    if (outcome.kind === 'skip') {
      expect(outcome.reason).toBe('transient unavailability');
    }
  });

  test('returns kind=skip when compute throws ResourceDependencyFailedError', async () => {
    const originalError = new Error('chrome failed to launch');
    const thrown = new ResourceDependencyFailedError('lighthouse', 'chrome', originalError);
    const r = new TestResource<string>({ error: thrown });
    const outcome = await resolveResource(r);
    expect(outcome.kind).toBe('skip');
    if (outcome.kind === 'skip') {
      expect(outcome.reason).toContain('chrome');
      expect(outcome.reason).toContain('chrome failed to launch');
    }
  });

  test('returns kind=fail when compute throws a generic Error', async () => {
    const underlying = new Error('something exploded');
    const r = new TestResource<string>({ error: underlying });
    const outcome = await resolveResource(r);
    expect(outcome.kind).toBe('fail');
    if (outcome.kind === 'fail') {
      expect(outcome.error).toBeInstanceOf(Error);
      expect(outcome.error.message).toBe('something exploded');
    }
  });

  test('returns kind=fail with wrapped Error when compute throws a non-Error', async () => {
    const r = new TestResource<string>({ error: 'string error' });
    const outcome = await resolveResource(r);
    expect(outcome.kind).toBe('fail');
    if (outcome.kind === 'fail') {
      expect(outcome.error).toBeInstanceOf(Error);
      expect(outcome.error.message).toBe('string error');
    }
  });

  test('returns kind=fail with aborted error when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const r = new TestResource<string>({ value: 'hello' });
    const outcome = await resolveResource(r, controller.signal);
    expect(outcome.kind).toBe('fail');
    if (outcome.kind === 'fail') {
      expect(outcome.error).toBeInstanceOf(Error);
      expect(outcome.error.message).toBe('aborted');
    }
  });

  test('does not call resource.get() when signal is aborted on entry', async () => {
    const controller = new AbortController();
    controller.abort();
    const r = new TestResource<string>({ value: 'hello' });
    await resolveResource(r, controller.signal);
    expect(r.computeCount).toBe(0);
  });
});
