import { describe, expect, test } from 'vitest';
import type { AxeResult } from '../../../types/index.js';
import type { AxeAdapter } from '../resources/axe.js';
import { AxeResource } from '../resources/axe.js';
import type { ChromeAdapter } from '../resources/chrome.js';
import { ChromeResource } from '../resources/chrome.js';

const SIGNAL = new AbortController().signal;
const URL = 'https://example.test/';

const EMPTY_AXE: AxeResult = { violations: [], passes: [], incomplete: [], inapplicable: [] };

function makeChrome(installed: boolean): ChromeResource {
  const adapter: ChromeAdapter = {
    isInstalled: () => installed,
    launch: async () => ({}),
    close: async () => undefined,
  };
  return new ChromeResource(adapter, SIGNAL);
}

function makeAxe(installed: boolean): AxeAdapter {
  return {
    isInstalled: () => installed,
    run: async () => EMPTY_AXE,
  };
}

describe('AxeResource', () => {
  test('available when both puppeteer and axe-core are installed', () => {
    const chrome = makeChrome(true);
    const axe = new AxeResource(chrome, URL, makeAxe(true), SIGNAL);
    expect(axe.isAvailable()).toBe(true);
  });

  test('unavailable when chrome is unavailable (cascade)', () => {
    const chrome = makeChrome(false);
    const axe = new AxeResource(chrome, URL, makeAxe(true), SIGNAL);
    expect(axe.isAvailable()).toBe(false);
  });

  test('unavailable when axe adapter reports not installed', () => {
    const chrome = makeChrome(true);
    const axe = new AxeResource(chrome, URL, makeAxe(false), SIGNAL);
    expect(axe.isAvailable()).toBe(false);
  });

  test('dispose on ChromeResource is idempotent', async () => {
    const chrome = makeChrome(true);
    await chrome.dispose();
    await expect(chrome.dispose()).resolves.toBeUndefined();
  });
});
