import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { titleTagPresentChecker } from '../title-tag-present.js';
import { makeLiveContext } from './live-context.js';

describe('titleTagPresentChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('title-tag-present');
    expect(titleTagPresentChecker.id).toBe(e?.id);
    expect(titleTagPresentChecker.category).toBe(e?.category);
    expect(titleTagPresentChecker.mode).toBe(e?.mode);
  });
  test('pass for a 10–60 char title', async () => {
    const r = await titleTagPresentChecker.run(
      makeLiveContext({ domHtml: '<title>A perfectly fine title</title>' }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when title absent', async () => {
    const r = await titleTagPresentChecker.run(
      makeLiveContext({ domHtml: '<html><head></head></html>' }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('title-missing');
  });
  test('warn when too short', async () => {
    const r = await titleTagPresentChecker.run(makeLiveContext({ domHtml: '<title>Hi</title>' }));
    expect(r[0]?.status).toBe('warn');
  });
  test('skip with no live context', async () => {
    const r = await titleTagPresentChecker.run({ ...makeLiveContext(), live: null });
    expect(r[0]?.status).toBe('skip');
  });
});
