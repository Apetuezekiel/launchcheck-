import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { canonicalUrlChecker } from '../canonical-url.js';
import { makeLiveContext } from './live-context.js';

describe('canonicalUrlChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('canonical-url');
    expect(canonicalUrlChecker.id).toBe(e?.id);
    expect(canonicalUrlChecker.mode).toBe(e?.mode);
  });
  test('pass when canonical link present', async () => {
    const r = await canonicalUrlChecker.run(
      makeLiveContext({ domHtml: '<link rel="canonical" href="https://x.test/">' }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when absent', async () => {
    const r = await canonicalUrlChecker.run(
      makeLiveContext({ domHtml: '<link rel="icon" href="/f.ico">' }),
    );
    expect(r[0]?.status).toBe('fail');
  });
});
