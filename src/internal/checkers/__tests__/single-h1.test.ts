import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { singleH1Checker } from '../single-h1.js';
import { makeLiveContext } from './live-context.js';

describe('singleH1Checker', () => {
  test('matches the registry entry', () => {
    const e = findById('single-h1');
    expect(singleH1Checker.id).toBe(e?.id);
    expect(singleH1Checker.mode).toBe(e?.mode);
  });
  test('pass with exactly one h1', async () => {
    const r = await singleH1Checker.run(makeLiveContext({ domHtml: '<h1>one</h1>' }));
    expect(r[0]?.status).toBe('pass');
  });
  test('fail with zero h1', async () => {
    const r = await singleH1Checker.run(makeLiveContext({ domHtml: '<h2>x</h2>' }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('h1-missing');
  });
  test('fail with multiple h1', async () => {
    const r = await singleH1Checker.run(makeLiveContext({ domHtml: '<h1>a</h1><h1>b</h1>' }));
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('h1-multiple');
  });
});
