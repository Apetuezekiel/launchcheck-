import type { HttpClient } from '../../types/index.js';

/** Decodes the small set of XML entities that appear in sitemap <loc> values. */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** True when the document root is a <sitemapindex> (a sitemap of sitemaps). */
export function isSitemapIndex(xml: string): boolean {
  return /<\s*sitemapindex[\s>]/i.test(xml);
}

/**
 * Extracts every `<loc>` value from a sitemap or sitemap index. Tolerant
 * regex parse (sitemaps are flat and simple); entity-decoded and trimmed.
 * Returns raw strings — the caller filters by scheme/origin and dedupes.
 */
export function parseSitemapLocs(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<\s*loc\s*>([\s\S]*?)<\s*\/\s*loc\s*>/gi)) {
    const raw = m[1];
    if (raw === undefined) continue;
    const value = decodeXmlEntities(raw.trim());
    if (value.length > 0) out.push(value);
  }
  return out;
}

export interface CollectSitemapOptions {
  /** Maximum URLs to return. Default 50. */
  maxUrls?: number;
  /** Restrict results to this origin (e.g. new URL(seed).origin). */
  sameOrigin?: string;
  /** Per-fetch timeout. Default 8000ms. */
  timeoutMs?: number;
  /** Max child sitemaps to follow from an index. Default 10. */
  maxIndexChildren?: number;
}

function keepUrl(value: string, sameOrigin: string | undefined): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (sameOrigin !== undefined && parsed.origin !== sameOrigin) return null;
  parsed.hash = '';
  return parsed.toString();
}

/**
 * Fetches a sitemap URL and returns the page URLs it lists. Follows a
 * sitemap index one level deep (bounded by maxIndexChildren). Same-origin
 * filter and de-duplication applied; result capped at maxUrls. Network errors
 * on a child sitemap are skipped, not fatal.
 */
export async function collectSitemapUrls(
  http: HttpClient,
  sitemapUrl: string,
  options: CollectSitemapOptions = {},
): Promise<string[]> {
  const maxUrls = options.maxUrls ?? 50;
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxIndexChildren = options.maxIndexChildren ?? 10;

  const root = await http.fetch(sitemapUrl, { timeoutMs });
  const rootLocs = parseSitemapLocs(root.body);

  let pageLocs: string[];
  if (isSitemapIndex(root.body)) {
    pageLocs = [];
    for (const child of rootLocs.slice(0, maxIndexChildren)) {
      try {
        const childRes = await http.fetch(child, { timeoutMs });
        pageLocs.push(...parseSitemapLocs(childRes.body));
      } catch {
        // skip an unreachable child sitemap
      }
      if (pageLocs.length >= maxUrls) break;
    }
  } else {
    pageLocs = rootLocs;
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const loc of pageLocs) {
    const kept = keepUrl(loc, options.sameOrigin);
    if (kept === null || seen.has(kept)) continue;
    seen.add(kept);
    result.push(kept);
    if (result.length >= maxUrls) break;
  }
  return result;
}
