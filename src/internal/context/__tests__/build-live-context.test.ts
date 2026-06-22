import { describe, expect, test } from 'vitest';
import { buildLiveContext } from '../build-live-context.js';

describe('buildLiveContext', () => {
  test('https URL â†’ tls resource available', () => {
    const { live } = buildLiveContext('https://example.test/');
    expect(live.tls.isAvailable()).toBe(true);
    expect(live.url).toBe('https://example.test/');
  });
  test('http URL â†’ tls resource unavailable (Issue A: no false SSL pass)', () => {
    const { live } = buildLiveContext('http://example.test/');
    expect(live.tls.isAvailable()).toBe(false);
    expect(live.tls.unavailableReason()).toContain('https');
  });
  test('dom resource is always available (depends on rootResponse)', () => {
    const { live } = buildLiveContext('https://example.test/');
    expect(live.dom.isAvailable()).toBe(true);
  });
});
