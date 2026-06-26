import { createRequire } from 'node:module';
import type { LighthouseResult } from '../../../types/index.js';
import type { ChromeBrowser } from '../resources/chrome.js';
import type { LighthouseAdapter } from '../resources/lighthouse.js';
/**
 * Real adapter over the optional `lighthouse` peer dependency. The ONLY
 * lighthouse-touching module: dynamic-import-only (so the build never requires
 * lighthouse) and validated by real-site dogfooding, not unit tests.
 *
 * Epic C: attaches to the SHARED puppeteer browser via its CDP debug port
 * (parsed from `browser.wsEndpoint()`) instead of self-launching Chrome via
 * chrome-launcher. One Chrome process is shared with axe; this adapter no
 * longer launches or kills a browser.
 */
function moduleResolves(name: string): boolean {
  try {
    createRequire(import.meta.url).resolve(name);
    return true;
  } catch {
    return false;
  }
}
async function importOptional(name: string): Promise<unknown> {
  const specifier = name;
  return import(specifier);
}
type LighthouseFn = (url: string, opts: unknown) => Promise<{ lhr?: RawLhr } | undefined>;
interface RawCategory {
  score?: number | null;
}
interface RawAudit {
  numericValue?: number;
  score?: number | null;
}
interface RawLhr {
  categories?: Record<string, RawCategory | undefined>;
  audits?: Record<string, RawAudit | undefined>;
}
function score(category: RawCategory | undefined): number | null {
  return typeof category?.score === 'number' ? category.score : null;
}
function numeric(audit: RawAudit | undefined): number | null {
  return typeof audit?.numericValue === 'number' ? audit.numericValue : null;
}
/** Extracts the CDP debug port from a puppeteer browser's ws endpoint. */
function debugPort(browser: ChromeBrowser): number {
  const wsEndpoint = (browser as { wsEndpoint(): string }).wsEndpoint();
  const port = Number.parseInt(new URL(wsEndpoint).port, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`could not determine Chrome debug port from ws endpoint: ${wsEndpoint}`);
  }
  return port;
}
export const lighthouseAdapter: LighthouseAdapter = {
  isInstalled: () => moduleResolves('lighthouse'),
  async run(browser: ChromeBrowser, url: string): Promise<LighthouseResult> {
    const lighthouseMod = (await importOptional('lighthouse')) as {
      default?: LighthouseFn;
    } & LighthouseFn;
    const runLighthouse = lighthouseMod.default ?? lighthouseMod;
    const result = await runLighthouse(url, {
      port: debugPort(browser),
      output: 'json',
      logLevel: 'error',
    });
    const lhr: RawLhr = result?.lhr ?? {};
    const cats = lhr.categories ?? {};
    const rawAudits = lhr.audits ?? {};
    // Include a Core Web Vital audit only when Lighthouse actually reported a
    // numeric value; absent metrics are omitted (the checker skips) rather than
    // coerced to 0, which would be a false PASS/FAIL.
    const audits: LighthouseResult['audits'] = {};
    for (const id of [
      'largest-contentful-paint',
      'cumulative-layout-shift',
      'interaction-to-next-paint',
    ] as const) {
      const value = numeric(rawAudits[id]);
      if (value !== null) {
        audits[id] = { numericValue: value };
      }
    }
    return {
      categories: {
        performance: { score: score(cats.performance) },
        accessibility: { score: score(cats.accessibility) },
        'best-practices': { score: score(cats['best-practices']) },
        seo: { score: score(cats.seo) },
      },
      audits,
    };
  },
};
