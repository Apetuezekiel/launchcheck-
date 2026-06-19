import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { structuredDataChecker } from '../structured-data.js';
import { makeLiveContext } from './live-context.js';

describe('structuredDataChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('structured-data');
    expect(structuredDataChecker.id).toBe(e?.id);
    expect(structuredDataChecker.mode).toBe(e?.mode);
  });
  test('pass with a valid JSON-LD block', async () => {
    const r = await structuredDataChecker.run(
      makeLiveContext({ domHtml: '<script type="application/ld+json">{"@type":"Org"}</script>' }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail with none', async () => {
    const r = await structuredDataChecker.run(makeLiveContext({ domHtml: '<title>x</title>' }));
    expect(r[0]?.status).toBe('fail');
  });
});
