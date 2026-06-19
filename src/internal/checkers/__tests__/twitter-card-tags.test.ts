import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { twitterCardTagsChecker } from '../twitter-card-tags.js';
import { makeLiveContext } from './live-context.js';

describe('twitterCardTagsChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('twitter-card-tags');
    expect(twitterCardTagsChecker.id).toBe(e?.id);
    expect(twitterCardTagsChecker.mode).toBe(e?.mode);
  });
  test('pass with card + title', async () => {
    const r = await twitterCardTagsChecker.run(
      makeLiveContext({
        domHtml:
          '<meta name="twitter:card" content="summary"><meta name="twitter:title" content="t">',
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when card missing', async () => {
    const r = await twitterCardTagsChecker.run(
      makeLiveContext({ domHtml: '<meta name="twitter:title" content="t">' }),
    );
    expect(r.some((x) => x.resultId === 'missing-twitter-card')).toBe(true);
  });
  test('fail when neither title nor description', async () => {
    const r = await twitterCardTagsChecker.run(
      makeLiveContext({ domHtml: '<meta name="twitter:card" content="summary">' }),
    );
    expect(r.some((x) => x.resultId === 'missing-twitter-title-or-description')).toBe(true);
  });
});
