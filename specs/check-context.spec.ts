// =============================================================================
// launchcheck — CheckContext spec (LOCKED v1)
//
// Contract between the orchestrator and individual checker modules.
// Every checker receives a CheckContext. The orchestrator constructs it once
// per run, injects shared lazy resources, and is responsible for teardown.
//
// Design axes:
//   - Mode awareness: static-only, live-only, combined. Checkers declare the
//     mode they require; the orchestrator only invokes checkers whose mode is
//     compatible with the current run.
//   - Lazy shared resources: expensive operations (Chrome launch, Lighthouse,
//     axe-core, HTML fetch+parse) are exposed as Resource<T>. The underlying
//     operation runs at most once per run, and only if at least one enabled
//     checker actually calls .get().
//   - Cardinality: one checker module produces N CheckResults. checkerId
//     identifies the module; resultId identifies the individual finding.
//     This enables module-level enable/disable in v1 and per-result targeting
//     in v1.1 without an interface break.
// =============================================================================


// -----------------------------------------------------------------------------
// Primitives
// -----------------------------------------------------------------------------

/**
 * Execution mode. Drives which checkers run and which CheckContext fields are
 * populated.
 *   - 'static': project directory only, no URL. ctx.live === null.
 *   - 'live':   URL only, no project directory. ctx.project === null.
 *   - 'combined': both project and URL available. Both sub-contexts populated.
 */
export type Mode = 'static' | 'live' | 'combined';

/**
 * Mode a checker requires. 'both' means the checker has logic for either
 * static or live context independently and can be invoked when at least one
 * is available; the checker is responsible for branching on what's present.
 */
export type CheckerMode = 'static' | 'live' | 'both';

export type ResultStatus = 'pass' | 'fail' | 'warn' | 'skip';

export type Severity = 'critical' | 'major' | 'minor' | 'info';

/**
 * Canonical category taxonomy. This single union is the source of truth for:
 *   - CheckResult.category
 *   - .launchcheckrc config keys
 *   - --only / --skip CLI flag values
 * Any value used in one place MUST exist in this union. No aliases.
 *
 * Note: 'ssl' is intentionally a subcategory of 'security' and does not appear
 * here. CLI/config users who want to disable SSL checks specifically address
 * them by checkerId, not category.
 */
export type CheckCategory =
  | 'code-quality'
  | 'security'
  | 'performance'
  | 'seo'
  | 'accessibility'
  | 'dependencies'
  | 'deployment'
  | 'documentation';


// -----------------------------------------------------------------------------
// CheckResult
// -----------------------------------------------------------------------------

export interface CheckResult {
  /**
   * Identifier of the checker module that produced this result.
   * Kebab-case, stable across versions. Used for config-level enable/disable.
   * Example: 'security-headers'.
   */
  checkerId: string;

  /**
   * Identifier of the specific finding within the checker.
   * Kebab-case, stable across versions. Unique within its checkerId.
   * Example: 'hsts-present'. Fully qualified form: 'security-headers/hsts-present'.
   * The orchestrator constructs the fully qualified form for reporting.
   */
  resultId: string;

  status: ResultStatus;

  /** Short human-readable summary. Single line. Shown in terminal output. */
  message: string;

  /**
   * Optional longer-form detail. May contain multiple lines, file paths,
   * line numbers, header values, URLs, etc. Not shown in terse output modes.
   */
  detail?: string;

  /**
   * Optional actionable remediation. Must describe what the user should do,
   * not what went wrong. Required on 'fail'; recommended on 'warn'.
   */
  fix?: string;

  severity: Severity;

  category: CheckCategory;

  /**
   * Optional source location, when the finding maps to a specific file.
   * Used by HTML reporter to render file references.
   */
  location?: {
    file: string;       // path relative to projectDir
    line?: number;
    column?: number;
  };

  /**
   * Wall-clock duration of this individual finding's computation, in ms.
   * Set by the orchestrator, not the checker. Used for performance debugging.
   */
  durationMs?: number;
}


// -----------------------------------------------------------------------------
// Resource<T> — lazy, memoized, shareable
// -----------------------------------------------------------------------------

/**
 * Wrapper for any expensive operation whose result is shared across multiple
 * checkers. The orchestrator constructs each Resource once per run.
 *
 * Semantics:
 *   - get() memoizes at the Promise level. Concurrent callers share the same
 *     in-flight Promise; the underlying operation runs at most once.
 *   - If isAvailable() is false, get() rejects with a typed error. Checkers
 *     should check isAvailable() first and emit a 'skip' result with
 *     unavailableReason() as the message rather than letting get() throw.
 *   - Disposal is the orchestrator's responsibility, not the checker's.
 */
export interface Resource<T> {
  /**
   * True if the resource can be computed in the current environment.
   * Example: false for the Chrome resource when puppeteer is not installed.
   * Checking this is cheap and synchronous.
   */
  isAvailable(): boolean;

  /**
   * Human-readable reason the resource is unavailable. Null when available.
   * Example: 'puppeteer peer dependency not installed; run `npm i puppeteer`'.
   */
  unavailableReason(): string | null;

  /**
   * Returns the resource, computing it once on first call. Rejects with
   * ResourceUnavailableError if isAvailable() is false. Rejects with the
   * underlying computation error if the operation itself fails.
   */
  get(): Promise<T>;

  /**
   * Introspection only — used by reporter for diagnostics. Returns true once
   * the underlying computation has settled (success or failure).
   */
  wasComputed(): boolean;

  /**
   * Upstream resources this resource depends on. Empty for leaf resources.
   * The orchestrator uses this to compute skip cascades when an upstream
   * resource has failed: any resource whose dependency tree contains a
   * failed resource will short-circuit its own .get() with a
   * ResourceDependencyFailedError naming the original failure.
   */
  dependencies(): Resource<unknown>[];
}

/**
 * Thrown by Resource<T>.get() when isAvailable() returns false.
 * Checkers receiving this via resolveResource() emit a 'skip' result.
 */
export class ResourceUnavailableError extends Error {
  override readonly name = 'ResourceUnavailableError';
  constructor(
    public readonly resourceName: string,
    public readonly reason: string,
  ) {
    super(`Resource ${resourceName} unavailable: ${reason}`);
  }
}

/**
 * Thrown by Resource<T>.get() when an upstream dependency has previously
 * failed. The original failure is preserved on originalError. Checkers
 * receiving this via resolveResource() emit a 'skip' result — the original
 * failure was already reported elsewhere.
 */
export class ResourceDependencyFailedError extends Error {
  override readonly name = 'ResourceDependencyFailedError';

  /** @see ResourceDependencyFailedError.from for the canonical construction path. */
  constructor(
    public readonly resourceName: string,
    public readonly failedDependency: string,
    public readonly originalError: Error,
  ) {
    super(`Resource ${resourceName} skipped: dependency ${failedDependency} failed`);
  }

  /**
   * Construct a ResourceDependencyFailedError from an unknown cause. The
   * orchestrator MUST use this factory rather than the bare constructor,
   * because cause sites typically have `cause: unknown` (per TS 4.4+
   * useUnknownInCatchVariables). The factory normalizes non-Error causes
   * into Error instances so the originalError field stays typed as Error
   * for downstream consumers.
   */
  static from(
    resourceName: string,
    failedDependency: string,
    cause: unknown,
  ): ResourceDependencyFailedError {
    let wrapped: Error;
    if (cause instanceof Error) {
      wrapped = cause;
    } else if (typeof cause === 'string') {
      wrapped = new Error(cause);
    } else {
      try {
        wrapped = new Error(JSON.stringify(cause) ?? String(cause));
      } catch {
        wrapped = new Error(String(cause));
      }
    }
    return new ResourceDependencyFailedError(resourceName, failedDependency, wrapped);
  }
}

/**
 * Discriminated result of resolving a Resource<T> through the orchestrator
 * helper. Checkers MUST pattern-match on .kind rather than calling
 * Resource.get() directly; this guarantees consistent error classification
 * across all checkers.
 */
export type ResourceOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'skip'; reason: string }
  | { kind: 'fail'; error: Error };

/**
 * Type signature for the orchestrator-provided resource resolver. The
 * concrete implementation is provided by the orchestrator at runtime and
 * lives in src/internal/runtime/resolve-resource.ts. Internal — not
 * re-exported through the public package surface.
 */
export type ResolveResource = <T>(
  resource: Resource<T>,
  signal?: AbortSignal,
) => Promise<ResourceOutcome<T>>;


// -----------------------------------------------------------------------------
// Project sub-context (static checks)
// -----------------------------------------------------------------------------

/**
 * File system / repository context. Populated in 'static' and 'combined' modes.
 * Null in 'live' mode.
 */
export interface ProjectContext {
  /** Absolute path to the project directory passed via --config or CLI. */
  projectDir: string;

  /**
   * Absolute path to the git repository root, if projectDir is inside a git
   * repo. Null otherwise. Resolved once at startup via
   * `git -C projectDir rev-parse --show-toplevel`.
   *
   * Three cases:
   *   - gitRoot === projectDir: projectDir IS the repo root.
   *   - gitRoot !== projectDir && gitRoot !== null: projectDir is a
   *     subdirectory of a larger repo (monorepo subpackage). Git-dependent
   *     checkers MUST scope their queries to projectDir
   *     (e.g., `git -C gitRoot ls-files -- <projectDir>/package-lock.json`),
   *     not the whole repo.
   *   - gitRoot === null: projectDir is not in a git repo, OR the `git`
   *     binary is unavailable. Git-dependent checkers MUST emit
   *     status: 'skip' with a message naming the cause.
   */
  gitRoot: string | null;

  /**
   * Parsed package.json from projectDir, if present. Null otherwise.
   * Computed once at startup so checkers don't reparse.
   */
  packageJson: PackageJson | null;

  /**
   * Parsed tsconfig.json from projectDir, if present. Null otherwise.
   */
  tsconfigJson: Record<string, unknown> | null;

  /**
   * Ignore matcher composed from .launchcheckrc `ignore` field, .gitignore,
   * and built-in defaults (node_modules, dist, .next, etc.). Always honored
   * by fs helpers below — checkers should not need to consult it directly
   * unless they bypass the helpers.
   */
  ignore: IgnoreMatcher;

  /**
   * File system helpers, all rooted at projectDir, all honoring `ignore`.
   * Provided so checkers don't reimplement glob/read/exists per module.
   */
  fs: ProjectFs;
}

export interface IgnoreMatcher {
  /** Returns true if the given absolute path is ignored. */
  ignores(absolutePath: string): boolean;
}

export interface ProjectFs {
  /**
   * Returns absolute paths matching the glob pattern, rooted at projectDir.
   * Always filters through IgnoreMatcher. Symlinks not followed.
   */
  glob(pattern: string | string[]): Promise<string[]>;

  /** Returns true if the path exists. Absolute or projectDir-relative. */
  exists(path: string): Promise<boolean>;

  /** Reads a file as UTF-8 text. Absolute or projectDir-relative. */
  readText(path: string): Promise<string>;

  /** Reads a file as binary. Absolute or projectDir-relative. */
  readBytes(path: string): Promise<Uint8Array>;

  /** Stat without throwing on ENOENT — returns null instead. */
  stat(path: string): Promise<{ size: number; isFile: boolean; isDir: boolean } | null>;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  // Open-ended — checkers may read additional fields directly.
  [key: string]: unknown;
}


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
  followRedirects?: boolean;  // default true
  timeoutMs?: number;          // default 30000
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
  url: string;              // final URL after redirects
  status: number;
  statusText: string;
  headers: HttpHeaders;
  body: string;             // UTF-8 decoded; use bodyBytes for binary
  bodyBytes: Uint8Array;
  redirectChain: string[];  // empty when no redirects
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
  jsonLd: unknown[];  // parsed JSON-LD blocks
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
  categories: {
    performance: { score: number };       // 0..1
    accessibility: { score: number };
    'best-practices': { score: number };
    seo: { score: number };
  };
  audits: {
    'largest-contentful-paint': { numericValue: number };  // ms
    'cumulative-layout-shift': { numericValue: number };
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
  id: string;            // e.g. 'color-contrast'
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
  protocol: string;       // e.g. 'TLSv1.3'
  errorReason: string | null;  // populated when valid === false
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


// -----------------------------------------------------------------------------
// Config & Logger
// -----------------------------------------------------------------------------

export interface ResolvedConfig {
  /** Effective URL after CLI + .launchcheckrc merge. Null in static-only runs. */
  url: string | null;

  /** Effective project directory. Null in live-only runs. */
  projectDir: string | null;

  /** Map of checkerId -> enabled. Always populated, including defaults. */
  checkers: Record<string, boolean>;

  /**
   * Threshold map. Flat key-value, addressed by well-known threshold IDs
   * (e.g. 'lighthouse-performance', 'lcp', 'cls'). Checkers read the keys
   * they care about and fall back to their own defaults if absent.
   */
  thresholds: Record<string, number>;

  /**
   * Raw checker-specific config blocks, addressed by checkerId. Use for any
   * configuration that doesn't fit the threshold map (e.g., DKIM selector,
   * custom secret patterns).
   */
  checkerOptions: Record<string, unknown>;

  ignore: string[];
}

/**
 * Structured logger for checker diagnostics. Not for emitting CheckResults —
 * those are returned from run(). Use logger for progress, debug traces, and
 * non-result-bearing warnings (e.g., "skipping git history scan: not a repo").
 */
export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}


// -----------------------------------------------------------------------------
// CheckContext — the object passed to Checker.run()
// -----------------------------------------------------------------------------

/**
 * Combined context. Sub-contexts are nullable based on mode. Checkers
 * declaring mode: 'static' receive a context with project !== null. Checkers
 * declaring mode: 'live' receive a context with live !== null. Checkers
 * declaring mode: 'both' must inspect both fields.
 *
 * For compile-time guarantees, checker authors may import the narrowed
 * aliases below (StaticCheckContext, LiveCheckContext, CombinedCheckContext)
 * and parameterize Checker accordingly.
 */
export interface CheckContext {
  mode: Mode;
  project: ProjectContext | null;
  live: LiveContext | null;
  config: ResolvedConfig;
  logger: Logger;

  /**
   * AbortSignal for the run. Long-running checks must observe this and
   * abort cleanly. The orchestrator triggers abort on timeout or SIGINT.
   */
  signal: AbortSignal;

  /**
   * Run-scoped metadata. Available to all checkers for inclusion in
   * CheckResult.detail or HTML reporter output.
   */
  meta: {
    runId: string;            // UUID
    startedAt: Date;
    launchcheckVersion: string;
    nodeVersion: string;
  };
}

/** Narrowed alias: project guaranteed non-null, live guaranteed null. */
export type StaticCheckContext = Omit<CheckContext, 'project' | 'live' | 'mode'> & {
  mode: 'static';
  project: ProjectContext;
  live: null;
};

/** Narrowed alias: live guaranteed non-null, project guaranteed null. */
export type LiveCheckContext = Omit<CheckContext, 'project' | 'live' | 'mode'> & {
  mode: 'live';
  project: null;
  live: LiveContext;
};

/** Narrowed alias: both guaranteed non-null. */
export type CombinedCheckContext = Omit<CheckContext, 'project' | 'live' | 'mode'> & {
  mode: 'combined';
  project: ProjectContext;
  live: LiveContext;
};


// -----------------------------------------------------------------------------
// Checker interface
// -----------------------------------------------------------------------------

export interface Checker {
  /**
   * Stable module identifier, kebab-case. Addressable from config.
   * Must be unique across all registered checkers.
   */
  id: string;

  /** Human-readable name for reporting. */
  name: string;

  category: CheckCategory;

  mode: CheckerMode;

  /**
   * Optional declared dependencies on lazy resources. Purely informational
   * for v1 — the lazy-by-get semantics of Resource<T> already prevent unused
   * resources from being computed. Reserved for future use (e.g., orchestrator
   * could pre-warm shared resources for parallel batches).
   *
   * 'http' signals that the checker uses ad-hoc HttpClient.fetch() (e.g., for
   * /sitemap.xml, /robots.txt, /favicon.ico). It does not refer to a
   * first-class Resource<T> — there is no shared `http` resource — but it
   * lets the orchestrator and `launchcheck list` CLI treat ad-hoc HTTP
   * consumption uniformly alongside the first-class Resource<T> consumers.
   */
  consumes?: Array<'rootResponse' | 'dom' | 'lighthouse' | 'axe' | 'tls' | 'dns' | 'http'>;

  /**
   * Execute the check. Must return an array of results (one checker -> N
   * results). Must not throw — wrap internal errors and return them as
   * status: 'fail' or 'skip' with a clear message. Must observe ctx.signal.
   *
   * The orchestrator times each call and populates CheckResult.durationMs.
   */
  run(ctx: CheckContext): Promise<CheckResult[]>;
}


// -----------------------------------------------------------------------------
// Orchestrator contract (informational — not implemented by checkers)
// -----------------------------------------------------------------------------
//
// 1. Resolve config (CLI flags > .launchcheckrc > defaults).
// 2. Determine Mode from (url present?, projectDir present?).
// 3. Filter registered checkers: enabled in config AND mode-compatible.
// 4. Construct ProjectContext (if mode != 'live') and LiveContext (if mode
//    != 'static'). All Resource<T> instances are constructed but not invoked.
// 5. In modes with a live context, run the connectivity pre-flight:
//      a) DNS A/AAAA resolution for the URL host.
//      b) TCP connect to host:port.
//      c) HEAD request to the URL with a 10s timeout, following redirects.
//    Each step emits an orchestrator-authored CheckResult with
//    checkerId '__preflight__' and resultId one of
//    'dns-resolves' | 'host-reachable' | 'http-responds'.
//    The checkerId namespace '__<name>__' is reserved for the orchestrator
//    and MUST NOT be used by any registered checker. Registry load fails
//    if a checker registers an id matching /^__.+__$/.
// 6. If any pre-flight step fails: skip every live-mode checker. Each
//    skipped checker contributes a 'skip' result referencing the failed
//    pre-flight step in its detail. In 'combined' mode, static checkers
//    still run.
// 7. Invoke each enabled checker's run(ctx). Static checkers run in
//    parallel from the start. Live checkers run in parallel after
//    pre-flight passes. Shared expensive resources (Chrome, Lighthouse,
//    axe, root response, DOM, TLS, DNS) execute exactly once via
//    Resource<T> memoization. Ad-hoc HTTP from HttpClient is bounded
//    concurrency, default 4.
// 8. Each checker accesses resources via the resolveResource() helper
//    rather than calling Resource.get() directly. The helper returns a
//    ResourceOutcome<T> that the checker pattern-matches to emit
//    pass / fail / skip results consistently.
// 9. After all checkers complete, the orchestrator disposes shared
//    resources (close Chrome, close HTTP client, etc.). Checkers must
//    not dispose anything.
// 10. The orchestrator collects all CheckResult arrays, applies
//     severity-based exit code policy, and hands results to the
//     configured reporter.
// =============================================================================
