import {
  type Resource,
  type ResourceOutcome,
  ResourceDependencyFailedError,
  ResourceUnavailableError,
} from '../../types/index.js';

/**
 * Concrete implementation of the ResolveResource contract. The orchestrator
 * supplies this to checkers; checkers MUST use this rather than calling
 * Resource.get() directly so error classification stays consistent.
 *
 * Discriminated outcomes:
 *   - 'ok'   — compute succeeded; value is the resource result.
 *   - 'skip' — resource was unavailable, or a dependency failed. The
 *              calling checker should emit a CheckResult with
 *              status: 'skip' and `reason` as the message.
 *   - 'fail' — compute itself threw a non-classified error. The calling
 *              checker should emit a CheckResult with status: 'fail'.
 *
 * Signal handling: if the signal is already aborted on entry, returns
 * { kind: 'fail', error: <abort> }. Once compute is in flight, the
 * signal is not consulted further (Resource.get() does not currently
 * accept an abort signal). Future v1.1: thread the signal through.
 */
export async function resolveResource<T>(
  resource: Resource<T>,
  signal?: AbortSignal,
): Promise<ResourceOutcome<T>> {
  if (signal?.aborted) {
    return { kind: 'fail', error: new Error('aborted') };
  }

  if (!resource.isAvailable()) {
    return {
      kind: 'skip',
      reason: resource.unavailableReason() ?? 'resource unavailable',
    };
  }

  try {
    const value = await resource.get();
    return { kind: 'ok', value };
  } catch (err) {
    if (err instanceof ResourceUnavailableError) {
      return { kind: 'skip', reason: err.reason };
    }
    if (err instanceof ResourceDependencyFailedError) {
      return {
        kind: 'skip',
        reason: `dependency ${err.failedDependency} failed: ${err.originalError.message}`,
      };
    }
    return {
      kind: 'fail',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
