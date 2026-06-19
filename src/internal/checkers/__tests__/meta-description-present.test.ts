import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { metaDescriptionPresentChecker } from '../meta-description-present.js';
import { makeLiveContext } from './live-context.js';

const GOOD = `<meta name="description" content="${'x'.repeat(80)}">`;

describe('metaDescriptionPresentChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('meta-description-present');
    expect(metaDescriptionPresentChecker.id).toBe(e?.id);
    expect(metaDescriptionPresentChecker.mode).toBe(e?.mode);
  });
  test('pass for a 50–160 char description', async () => {
    const r = await metaDescriptionPresentChecker.run(makeLiveContext({ domHtml: GOOD }));
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when absent', async () => {
    const r = await metaDescriptionPresentChecker.run(
      makeLiveContext({ domHtml: '<title>x</title>' }),
    );
    expect(r[0]?.status).toBe('fail');
  });
  test('warn when too short', async () => {
    const r = await metaDescriptionPresentChecker.run(
      makeLiveContext({ domHtml: '<meta name="description" content="short">' }),
    );
    expect(r[0]?.status).toBe('warn');
  });
});
