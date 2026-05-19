import type { CheckResult } from './check-result.js';
import type { CheckCategory, CheckerMode, Mode } from './common.js';
import type { LiveContext } from './live-context.js';
import type { ProjectContext } from './project-context.js';

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
    runId: string; // UUID
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
   */
  consumes?: Array<'rootResponse' | 'dom' | 'lighthouse' | 'axe' | 'tls' | 'dns'>;

  /**
   * Execute the check. Must return an array of results (one checker -> N
   * results). Must not throw — wrap internal errors and return them as
   * status: 'fail' or 'skip' with a clear message. Must observe ctx.signal.
   *
   * The orchestrator times each call and populates CheckResult.durationMs.
   */
  run(ctx: CheckContext): Promise<CheckResult[]>;
}
