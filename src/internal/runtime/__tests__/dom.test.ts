import { describe, expect, test } from 'vitest';
import type { HttpResponse } from '../../../types/index.js';
import {
  makeHttpResponse,
  okResource,
  unavailableResource,
} from '../../checkers/__tests__/live-context.js';
import { DomResource } from '../resources/dom.js';

describe('DomResource', () => {
  test('parses the rootResponse body into a ParsedDom', async () => {
    const root = okResource(makeHttpResponse({}, { body: '<title>Hi</title><h1>x</h1>' }));
    const dom = new DomResource(root);
    expect(dom.isAvailable()).toBe(true);
    const parsed = await dom.get();
    expect(parsed.title).toBe('Hi');
    expect(parsed.querySelectorAll('h1')).toHaveLength(1);
  });
  test('unavailable when rootResponse is unavailable', () => {
    const dom = new DomResource(unavailableResource<HttpResponse>('no fetch'));
    expect(dom.isAvailable()).toBe(false);
  });
});
