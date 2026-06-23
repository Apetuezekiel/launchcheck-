import { createRequire } from 'node:module';
import type { LighthouseResult } from '../../../types/index.js';
import type { LighthouseAdapter } from '../resources/lighthouse.js';
/**
 * Real adapter over the optional `lighthouse` peer dependency (which bundles
 * chrome-launcher + puppeteer-core). The ONLY lighthouse-touching module:
 * dynamic-import-only (so the build never requires lighthouse) and validated by
 * real-site dogfooding, not unit tests. Launches its own headless Chrome via
 * chrome-launcher, runs the audit, and always kills Chrome.
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
interface ChromeInstance {
  port: number;
  kill(): Promise<void>;
}
interface ChromeLauncherLike {
  launch(opts: unknown): Promise<ChromeInstance>;
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
function score(category: RawCategory | undefined): number {
  return typeof category?.score === 'number' ? category.score : 0;
}
function numeric(audit: RawAudit | undefined): number {
  return typeof audit?.numericValue === 'number' ? audit.numericValue : 0;
}
export const lighthouseAdapter: LighthouseAdapter = {
  isInstalled: () => moduleResolves('lighthouse'),
  async run(url: string): Promise<LighthouseResult> {
    const chromeLauncher = (await importOptional('chrome-launcher')) as ChromeLauncherLike;
    const lighthouseMod = (await importOptional('lighthouse')) as {
      default?: LighthouseFn;
    } & LighthouseFn;
    const runLighthouse = lighthouseMod.default ?? lighthouseMod;
    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const result = await runLighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
      });
      const lhr: RawLhr = result?.lhr ?? {};
      const cats = lhr.categories ?? {};
      const audits = lhr.audits ?? {};
      const inp = audits['interaction-to-next-paint'];
      return {
        categories: {
          performance: { score: score(cats.performance) },
          accessibility: { score: score(cats.accessibility) },
          'best-practices': { score: score(cats['best-practices']) },
          seo: { score: score(cats.seo) },
        },
        audits: {
          'largest-contentful-paint': {
            numericValue: numeric(audits['largest-contentful-paint']),
          },
          'cumulative-layout-shift': {
            numericValue: numeric(audits['cumulative-layout-shift']),
          },
          ...(inp !== undefined
            ? { 'interaction-to-next-paint': { numericValue: numeric(inp) } }
            : {}),
        },
      };
    } finally {
      await chrome.kill();
    }
  },
};
