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
