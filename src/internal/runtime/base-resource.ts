import {
  type Resource,
  ResourceDependencyFailedError,
  ResourceUnavailableError,
} from '../../types/index.js';

/**
 * Concrete base for any Resource<T>. Provides:
 *   - Promise-level memoization: get() runs compute() exactly once per
 *     instance. Concurrent callers share the in-flight Promise. A
 *     rejected compute() is cached — failed expensive operations are
 *     not retried.
 *   - Availability cascading: isAvailable() returns false when any
 *     dependency is unavailable. unavailableReason() surfaces the
 *     deepest cause with dependency context.
 *   - Dependency error wrapping: subclasses use getDependency() in
 *     their compute() to call upstreams; failures are wrapped in
 *     ResourceDependencyFailedError with this resource's name as the
 *     failing context.
 *
 * Subclasses MUST implement:
 *   - readonly `name` (used in error messages)
 *   - isLocallyAvailable()
 *   - localUnavailableReason()
 *   - dependencies()
 *   - compute()
 */
export abstract class BaseResource<T> implements Resource<T> {
  /** Stable identifier used in error messages. */
  abstract readonly name: string;

  private _promise: Promise<T> | null = null;
  private _computed = false;

  protected abstract isLocallyAvailable(): boolean;
  protected abstract localUnavailableReason(): string | null;
  abstract dependencies(): Resource<unknown>[];
  protected abstract compute(): Promise<T>;

  isAvailable(): boolean {
    if (!this.isLocallyAvailable()) return false;
    for (const dep of this.dependencies()) {
      if (!dep.isAvailable()) return false;
    }
    return true;
  }

  unavailableReason(): string | null {
    if (!this.isLocallyAvailable()) return this.localUnavailableReason();
    for (const dep of this.dependencies()) {
      if (!dep.isAvailable()) {
        const depName = dep instanceof BaseResource ? dep.name : 'unknown';
        const depReason = dep.unavailableReason() ?? 'unknown';
        return `dependency ${depName} unavailable: ${depReason}`;
      }
    }
    return null;
  }

  async get(): Promise<T> {
    if (this._promise) return this._promise;

    if (!this.isAvailable()) {
      const reason = this.unavailableReason() ?? 'unknown reason';
      throw new ResourceUnavailableError(this.name, reason);
    }

    this._promise = (async () => {
      try {
        return await this.compute();
      } finally {
        this._computed = true;
      }
    })();

    return this._promise;
  }

  wasComputed(): boolean {
    return this._computed;
  }

  /**
   * Subclass helper for calling upstream resources from inside compute().
   * Use this rather than calling dep.get() directly so error classification
   * stays consistent: any non-ResourceDependencyFailedError throw from the
   * upstream is wrapped with this resource's name and the named dep as
   * context. Already-wrapped errors propagate unchanged (no double-wrap).
   */
  protected async getDependency<U>(depName: string, dep: Resource<U>): Promise<U> {
    try {
      return await dep.get();
    } catch (err) {
      if (err instanceof ResourceDependencyFailedError) throw err;
      throw ResourceDependencyFailedError.from(this.name, depName, err);
    }
  }
}
