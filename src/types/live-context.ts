import type { Resource } from './resource.js';

// -----------------------------------------------------------------------------
// Live sub-context (URL checks)
// -----------------------------------------------------------------------------

/**
 * URL-bound context. Populated in 'live' and 'combined' modes.
 * Null in 'static' mode.
 *
 * The primary URL is fixed for the duration of a run. Multi-URL crawls are
 * out of scope for v1 — checkers that need ancillary URLs (sitemap, robots,
 * favicon) fetch them via the shared http resource.
 */
export interface LiveContext {
  /** The primary URL under test, normalized (trailing slash preserved as given). */
  url: string;

  /** Parsed URL for convenience. */
  parsedUrl: URL;

  /**
   * Shared HTTP client. Responses are cached by (method, url) tuple for the
   * duration of the run, so multiple checkers fetching /sitemap.xml share
   * one network call. The cache is per-run, not persistent.
   */
  http: HttpClient;

  /**
   * Root HTTP response for the primary URL (GET, follow redirects).
   * Shared by all security-header, compression, and redirect checks.
   * First .get() triggers the fetch; subsequent .get() returns the cached
   * response.
   */
  rootResponse: Resource<HttpResponse>;

  /**
   * Parsed DOM of the primary URL's response body. Shared by all SEO,
   * structured-data, favicon, and HTML-based accessibility checks.
   * Depends on rootResponse internally — calling .get() will trigger
   * rootResponse if not yet computed.
   */
  dom: Resource<ParsedDom>;

  /**
   * Lighthouse result for the primary URL. Shared by all Lighthouse-derived
   * checks (performance score, accessibility score, LCP, CLS, INP, etc.).
   * Depends on the chrome resource. Unavailable when puppeteer is not
   * installed; checkers must check isAvailable() before .get().
   */
  lighthouse: Resource<LighthouseResult>;

  /**
   * axe-core result for the primary URL. Shared by all WCAG-based
   * accessibility checks. Depends on the chrome resource. Unavailable when
   * puppeteer is not installed.
   */
  axe: Resource<AxeResult>;

  /**
   * TLS/SSL inspection result for the primary URL's host. Shared by ssl
   * checks (validity, expiry). One TLS handshake per run.
   */
  tls: Resource<TlsResult>;

  /**
   * DNS records for the primary URL's host. Shared by DNS, SPF, DKIM, DMARC
   * checks. One resolution per record type, memoized.
   */
  dns: DnsResolver;
}

export interface HttpClient {
  /**
   * Fetch a URL. Responses are memoized for the run by (method, url, headers).
   * Default method GET, follows redirects, default timeout 30s.
   */
  fetch(url: string, init?: HttpRequestInit): Promise<HttpResponse>;
}

export interface HttpRequestInit {
  method?: 'GET' | 'HEAD' | 'OPTIONS' | 'POST';
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  followRedirects?: boolean; // default true
  timeoutMs?: number; // default 30000
}

/**
 * Header collection that preserves multi-value headers (Set-Cookie, Link,
 * Vary, etc.). All lookups are case-insensitive; iteration yields lowercased
 * names. Returned by HttpClient.fetch().
 */
export interface HttpHeaders {
  /** First value for the header (case-insensitive lookup). Null if absent. */
  get(name: string): string | null;
  /** All values for the header. Empty array if absent. Preserves multi-value headers. */
  getAll(name: string): string[];
  /** True if any value exists for the header. */
  has(name: string): boolean;
  /** Iterate every (lowercased name, value) pair. Multi-value headers yield one entry per value. */
  entries(): IterableIterator<[string, string]>;
  /** Distinct header names present, lowercased. */
  names(): string[];
}

export interface HttpResponse {
  url: string; // final URL after redirects
  status: number;
  statusText: string;
  headers: HttpHeaders;
  body: string; // UTF-8 decoded; use bodyBytes for binary
  bodyBytes: Uint8Array;
  redirectChain: string[]; // empty when no redirects
  timing: {
    totalMs: number;
    ttfbMs: number;
  };
}

export interface ParsedDom {
  /** Raw HTML string of the rendered document. */
  html: string;

  /**
   * CSS-selector query interface. Implementation: cheerio or parse5+nwsapi.
   * Returns plain objects with .text(), .attr(), .html() methods to avoid
   * leaking the underlying library type into checker code.
   */
  querySelectorAll(selector: string): DomElement[];
  querySelector(selector: string): DomElement | null;

  /** Convenience accessors for the most-requested elements. */
  title: string | null;
  metaTags: Array<{ name?: string; property?: string; content?: string; httpEquiv?: string }>;
  linkTags: Array<{ rel?: string; href?: string; type?: string; sizes?: string }>;
  jsonLd: unknown[]; // parsed JSON-LD blocks
}

export interface DomElement {
  tagName: string;
  attr(name: string): string | null;
  text(): string;
  html(): string;
}

/**
 * Subset of Lighthouse's result shape needed by v1 checkers. The full
 * Lighthouse type is enormous; expose only what we consume. Extend as needed.
 */
export interface LighthouseResult {
  // A category score is null when Lighthouse did not produce it for this run
  // (a failed/empty audit). Consumers skip rather than treating null as 0.
  categories: {
    performance: { score: number | null }; // 0..1 or null
    accessibility: { score: number | null };
    'best-practices': { score: number | null };
    seo: { score: number | null };
  };
  // Named Core Web Vital audits are absent when Lighthouse did not report them
  // for this run; consumers skip when absent (never coerce to 0).
  audits: {
    'largest-contentful-paint'?: { numericValue: number }; // ms
    'cumulative-layout-shift'?: { numericValue: number };
    'interaction-to-next-paint'?: { numericValue: number }; // ms
    [auditId: string]: { numericValue?: number; score?: number | null } | undefined;
  };
}

export interface AxeResult {
  violations: AxeViolation[];
  passes: AxeViolation[];
  incomplete: AxeViolation[];
  inapplicable: AxeViolation[];
}

export interface AxeViolation {
  id: string; // e.g. 'color-contrast'
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{ html: string; target: string[] }>;
}

export interface TlsResult {
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  daysUntilExpiry: number;
  protocol: string; // e.g. 'TLSv1.3'
  errorReason: string | null; // populated when valid === false
}

/**
 * DNS resolver. All methods MUST memoize by their full argument tuple
 * (record type, host, and selector where applicable) for the duration of
 * the run. Multiple checkers querying the same record share one underlying
 * lookup. The cache is per-run, not persistent. This mirrors the memoization
 * semantics of HttpClient.fetch() and Resource<T>.get().
 */
export interface DnsResolver {
  resolveA(host: string): Promise<string[]>;
  resolveAAAA(host: string): Promise<string[]>;
  resolveTxt(host: string): Promise<string[][]>;
  resolveMx(host: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolveCname(host: string): Promise<string[]>;
  /**
   * Convenience: looks up TXT records and returns the SPF record string if any.
   * Returns null when no v=spf1 record is found.
   */
  spf(host: string): Promise<string | null>;
  /**
   * DMARC convention: TXT lookup at _dmarc.{host}. Returns the record or null.
   */
  dmarc(host: string): Promise<string | null>;
  /**
   * DKIM lookup requires a selector. Checker must obtain it from config; this
   * resolver does not guess. Returns the TXT record at {selector}._domainkey.{host}.
   */
  dkim(host: string, selector: string): Promise<string | null>;
}
