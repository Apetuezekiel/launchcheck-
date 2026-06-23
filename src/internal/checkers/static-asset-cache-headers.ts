import type { CheckResult, Checker, ParsedDom } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'static-asset-cache-headers';
const CAT = 'performance' as const;
const SEV = 'minor' as const;

// Long-lived = at least one day. Hashed assets should use a year + immutable.
const MIN_MAX_AGE = 86_400;

// Bound HEAD requests per asset class to keep the scan fast on asset-heavy pages.
const MAX_PER_CLASS = 10;

interface AssetClass {
  id: string;
  label: string;
  selector: string;
  urlAttr: string;
}

const ASSET_CLASSES: ReadonlyArray<AssetClass> = [
  { id: 'scripts', label: 'script', selector: 'script[src]', urlAttr: 'src' },
  { id: 'styles', label: 'stylesheet', selector: 'link[rel~="stylesheet"]', urlAttr: 'href' },
  { id: 'images', label: 'image', selector: 'img[src]', urlAttr: 'src' },
];

function isLongLived(cacheControl: string | null): boolean {
  if (cacheControl === null) {
    return false;
  }
  if (/\bimmutable\b/i.test(cacheControl)) {
    return true;
  }
  const match = /max-age\s*=\s*(\d+)/i.exec(cacheControl);
  return match !== null && Number(match[1] ?? '0') >= MIN_MAX_AGE;
}

function collectUrls(dom: ParsedDom, cls: AssetClass, baseUrl: string): string[] {
  const seen = new Set<string>();
  for (const el of dom.querySelectorAll(cls.selector)) {
    const raw = el.attr(cls.urlAttr);
    if (raw === null || raw.length === 0) {
      continue;
    }
    let abs: string;
    try {
      abs = new URL(raw, baseUrl).toString();
    } catch {
      continue;
    }
    if (!abs.startsWith('http://') && !abs.startsWith('https://')) {
      continue;
    }
    seen.add(abs);
    if (seen.size >= MAX_PER_CLASS) {
      break;
    }
  }
  return [...seen];
}

export const staticAssetCacheHeadersChecker: Checker = {
  id: ID,
  name: 'Cache-Control on static assets',
  category: CAT,
  mode: 'live',
  consumes: ['dom', 'http'],
  async run(ctx) {
    if (ctx.live === null) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'skip',
          'no-live-context',
          'Skipped: no live context (run with --url).',
        ),
      ];
    }
    const live = ctx.live;
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const dom = got.dom;
    const results: CheckResult[] = [];
    for (const cls of ASSET_CLASSES) {
      const urls = collectUrls(dom, cls, live.url);
      if (urls.length === 0) {
        continue;
      }
      const uncached: string[] = [];
      let checked = 0;
      for (const url of urls) {
        try {
          const res = await live.http.fetch(url, { method: 'HEAD' });
          checked++;
          if (!isLongLived(res.headers.get('cache-control'))) {
            uncached.push(url);
          }
        } catch {
          // Unreachable asset: cannot confirm caching; count it as uncached.
          uncached.push(url);
        }
      }
      if (checked === 0) {
        results.push(
          liveResult(
            ID,
            CAT,
            SEV,
            'warn',
            `${cls.id}-unreachable`,
            `None of the ${urls.length} ${cls.label} asset(s) could be fetched to check Cache-Control.`,
            { detail: urls.join(', ') },
          ),
        );
        continue;
      }
      if (uncached.length === 0) {
        results.push(
          liveResult(
            ID,
            CAT,
            SEV,
            'pass',
            `${cls.id}-cached`,
            `All ${urls.length} ${cls.label} asset(s) send a long-lived Cache-Control (max-age ≥ ${MIN_MAX_AGE} or immutable).`,
          ),
        );
        continue;
      }
      results.push(
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          `${cls.id}-uncached`,
          `${uncached.length} of ${urls.length} ${cls.label} asset(s) lack a long-lived Cache-Control.`,
          {
            detail: uncached.join(', '),
            fix: 'Serve static assets with Cache-Control: max-age=31536000, immutable and use content hashing for cache busting.',
          },
        ),
      );
    }
    if (results.length === 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'no-static-assets',
          'No static assets (scripts, stylesheets, images) found to check.',
        ),
      ];
    }
    return results;
  },
};
