import { createRequire } from 'node:module';
import type { AxeResult, AxeViolation } from '../../../types/index.js';
import type { AxeAdapter } from '../resources/axe.js';
import type { ChromeAdapter, ChromeBrowser } from '../resources/chrome.js';

/**
 * Real adapters over the optional `puppeteer` and `@axe-core/puppeteer` peer
 * dependencies. This is the ONLY module that touches a real browser; it is
 * dynamic-import-only (the packages are never statically imported, so the build
 * does not require them) and is exercised only when those peers are installed —
 * i.e. it is validated by real-site dogfooding, not unit tests.
 */
function moduleResolves(name: string): boolean {
  try {
    createRequire(import.meta.url).resolve(name);
    return true;
  } catch {
    return false;
  }
}

// Dynamic import via a non-literal specifier so TypeScript does not resolve the
// (optional, possibly-absent) module at build time.
async function importOptional(name: string): Promise<unknown> {
  const specifier = name;
  return import(specifier);
}

interface PuppeteerLike {
  launch(opts: unknown): Promise<unknown>;
}

interface PageLike {
  goto(url: string, opts: unknown): Promise<unknown>;
  close(): Promise<void>;
}

interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

interface AxePuppeteerCtor {
  new (page: PageLike): { analyze(): Promise<RawAxeResults> };
}

interface RawAxeNode {
  html?: unknown;
  target?: unknown;
}

interface RawAxeRule {
  id?: unknown;
  impact?: unknown;
  description?: unknown;
  help?: unknown;
  helpUrl?: unknown;
  nodes?: unknown;
}

interface RawAxeResults {
  violations?: unknown;
  passes?: unknown;
  incomplete?: unknown;
  inapplicable?: unknown;
}

export const puppeteerChromeAdapter: ChromeAdapter = {
  isInstalled: () => moduleResolves('puppeteer'),
  async launch(): Promise<ChromeBrowser> {
    const mod = (await importOptional('puppeteer')) as { default?: PuppeteerLike } & PuppeteerLike;
    const puppeteer = mod.default ?? mod;
    return puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  },
  async close(browser: ChromeBrowser): Promise<void> {
    await (browser as BrowserLike).close();
  },
};

function toViolation(raw: RawAxeRule): AxeViolation {
  const impact = raw.impact;
  const nodesRaw = Array.isArray(raw.nodes) ? (raw.nodes as RawAxeNode[]) : [];
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    impact:
      impact === 'minor' || impact === 'moderate' || impact === 'serious' || impact === 'critical'
        ? impact
        : null,
    description: typeof raw.description === 'string' ? raw.description : '',
    help: typeof raw.help === 'string' ? raw.help : '',
    helpUrl: typeof raw.helpUrl === 'string' ? raw.helpUrl : '',
    nodes: nodesRaw.map((n) => ({
      html: typeof n.html === 'string' ? n.html : '',
      target: Array.isArray(n.target) ? n.target.map(String) : [],
    })),
  };
}

function toViolations(raw: unknown): AxeViolation[] {
  return Array.isArray(raw) ? (raw as RawAxeRule[]).map(toViolation) : [];
}

export const axePuppeteerAdapter: AxeAdapter = {
  isInstalled: () => moduleResolves('@axe-core/puppeteer'),
  async run(browser: ChromeBrowser, url: string): Promise<AxeResult> {
    const mod = (await importOptional('@axe-core/puppeteer')) as { AxePuppeteer: AxePuppeteerCtor };
    const page = await (browser as BrowserLike).newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
      const raw = await new mod.AxePuppeteer(page).analyze();
      return {
        violations: toViolations(raw.violations),
        passes: toViolations(raw.passes),
        incomplete: toViolations(raw.incomplete),
        inapplicable: toViolations(raw.inapplicable),
      };
    } finally {
      await page.close();
    }
  },
};
