import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { openGraphTagsChecker } from '../open-graph-tags.js';
import { makeLiveContext } from './live-context.js';

const ALL = `
<meta property="og:title" content="t">
<meta property="og:description" content="d">
<meta property="og:image" content="https://x.test/i.png">`;

describe('openGraphTagsChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('open-graph-tags');
    expect(openGraphTagsChecker.id).toBe(e?.id);
    expect(openGraphTagsChecker.mode).toBe(e?.mode);
  });
  test('single pass when all three present', async () => {
    const r = await openGraphTagsChecker.run(makeLiveContext({ domHtml: ALL }));
    expect(r).toHaveLength(1);
    expect(r[0]?.status).toBe('pass');
  });
  test('one fail per missing tag (multi-result)', async () => {
    const r = await openGraphTagsChecker.run(
      makeLiveContext({ domHtml: '<meta property="og:title" content="t">' }),
    );
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.status === 'fail')).toBe(true);
    expect(r.map((x) => x.resultId).sort()).toEqual(['missing-og-description', 'missing-og-image']);
  });
});
