import * as cheerio from 'cheerio';
import type { HttpClient } from '../../types/index.js';

/** Normalizes a URL for crawl de-duplication: drop the fragment, keep path+query. */
function normalize(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Extracts the absolute, same-or-cross-origin hrefs from an HTML document.
 * Relative links are resolved against baseUrl; only http(s) links are kept;
 * fragments are stripped; the list is de-duplicated.
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: string[] = [];
  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    if (href === undefined) return;
    let resolved: string;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    const norm = normalize(resolved);
    if (norm === null || seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  });
  return out;
}

export interface CrawlOptions {
  /** Hard cap on pages returned. Default 20. */
  maxPages?: number;
  /** Per-fetch timeout. Default 8000ms. */
  timeoutMs?: number;
  /** Honor the origin's robots.txt Disallow rules. Default true. */
  respectRobots?: boolean;
}

/**
 * Parses the `Disallow` path prefixes that apply to `User-agent: *` from a
 * robots.txt body. Tolerant line parser; `Allow` and other agents are ignored,
 * and an empty `Disallow:` (which means "allow all") contributes nothing.
 */
export function parseRobotsDisallow(robotsTxt: string): string[] {
  const disallow: string[] = [];
  let agents: string[] = [];
  let sawDirective = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (line.length === 0) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (sawDirective) {
        agents = [];
        sawDirective = false;
      }
      agents.push(value);
    } else if (key === 'disallow') {
      sawDirective = true;
      if (agents.includes('*') && value.length > 0) disallow.push(value);
    } else if (key === 'allow') {
      sawDirective = true;
    }
  }
  return disallow;
}

async function fetchRobotsDisallow(
  http: HttpClient,
  origin: string,
  timeoutMs: number,
): Promise<string[]> {
  try {
    const res = await http.fetch(`${origin}/robots.txt`, { timeoutMs });
    if (res.status >= 200 && res.status < 300) {
      return parseRobotsDisallow(res.body);
    }
  } catch {
    // unreachable robots.txt → no restrictions
  }
  return [];
}

/**
 * Bounded, same-origin breadth-first crawl from a seed URL. Returns up to
 * maxPages distinct same-origin URLs (seed first). Pages that fail to fetch or
 * are non-HTML are still included (so the live run reports their status) but
 * yield no further links. Never throws on a fetch error.
 */
export async function crawl(
  http: HttpClient,
  seed: string,
  options: CrawlOptions = {},
): Promise<string[]> {
  const maxPages = options.maxPages ?? 20;
  const timeoutMs = options.timeoutMs ?? 8000;

  const start = normalize(seed);
  if (start === null) return [];
  const origin = new URL(start).origin;

  const disallow =
    options.respectRobots === false ? [] : await fetchRobotsDisallow(http, origin, timeoutMs);
  const isAllowed = (u: string): boolean => {
    const pathname = new URL(u).pathname;
    return !disallow.some((prefix) => pathname.startsWith(prefix));
  };
  if (!isAllowed(start)) return [];

  const visited = new Set<string>();
  const queued = new Set<string>([start]);
  const queue: string[] = [start];
  const out: string[] = [];

  while (queue.length > 0 && out.length < maxPages) {
    const url = queue.shift() as string;
    if (visited.has(url)) continue;
    visited.add(url);
    out.push(url);

    let html: string | null = null;
    try {
      const res = await http.fetch(url, { timeoutMs });
      const contentType = res.headers.get('content-type') ?? '';
      if (res.status >= 200 && res.status < 300 && /html/i.test(contentType)) {
        html = res.body;
      }
    } catch {
      html = null;
    }
    if (html === null) continue;

    for (const link of extractLinks(html, url)) {
      if (new URL(link).origin !== origin) continue;
      if (!isAllowed(link)) continue;
      if (queued.has(link) || visited.has(link)) continue;
      queued.add(link);
      queue.push(link);
    }
  }
  return out;
}
