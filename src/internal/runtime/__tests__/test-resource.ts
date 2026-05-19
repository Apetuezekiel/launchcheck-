import type { Resource } from '../../../types/index.js';
import { BaseResource } from '../base-resource.js';

/**
 * Configuration for a TestResource. All fields optional; defaults give a
 * locally-available resource with no dependencies that resolves to its name.
 */
export interface TestResourceOptions<T> {
  name?: string;
  locallyAvailable?: boolean;
  localReason?: string | null;
  deps?: Resource<unknown>[];
  /** Override the compute body. Receives the resource for chained access. */
  computeFn?: (self: TestResource<T>) => Promise<T>;
  /** Convenience: resolve to this value. Ignored if computeFn is set. */
  value?: T;
  /** Convenience: reject with this error. Ignored if computeFn is set. */
  error?: unknown;
  /** Delay added to compute() before resolution. Helps test concurrency. */
  computeDelayMs?: number;
}

/**
 * Test-only concrete subclass of BaseResource. Exposes a computeCount counter
 * so tests can assert how many times compute() actually ran. Lives in
 * __tests__/ — not exported from any production surface.
 */
export class TestResource<T = string> extends BaseResource<T> {
  readonly name: string;
  computeCount = 0;

  private readonly opts: TestResourceOptions<T>;

  constructor(opts: TestResourceOptions<T> = {}) {
    super();
    this.opts = opts;
    this.name = opts.name ?? 'test-resource';
  }

  protected isLocallyAvailable(): boolean {
    return this.opts.locallyAvailable ?? true;
  }

  protected localUnavailableReason(): string | null {
    return this.opts.localReason ?? null;
  }

  dependencies(): Resource<unknown>[] {
    return this.opts.deps ?? [];
  }

  protected async compute(): Promise<T> {
    this.computeCount++;
    if (this.opts.computeDelayMs != null) {
      await new Promise((resolve) => setTimeout(resolve, this.opts.computeDelayMs));
    }
    if (this.opts.computeFn) {
      return this.opts.computeFn(this);
    }
    if (this.opts.error !== undefined) {
      throw this.opts.error;
    }
    return this.opts.value as T;
  }

  /** Test helper for subclasses calling getDependency in their compute(). */
  async callGetDependency<U>(depName: string, dep: Resource<U>): Promise<U> {
    return this.getDependency(depName, dep);
  }
}

/**
 * Subclass variant that calls getDependency() inside compute() — used to
 * exercise the error-wrapping helper path.
 */
export interface DependentResourceOptions<T, U> {
  name?: string;
  depName: string;
  dep: Resource<U>;
  /** Transform the resolved upstream value into the computed result. */
  transform?: (upstreamValue: U) => T;
}

export class DependentResource<T = string, U = unknown> extends BaseResource<T> {
  readonly name: string;
  computeCount = 0;

  private readonly opts: DependentResourceOptions<T, U>;

  constructor(opts: DependentResourceOptions<T, U>) {
    super();
    this.opts = opts;
    this.name = opts.name ?? 'dependent-resource';
  }

  protected isLocallyAvailable(): boolean {
    return true;
  }

  protected localUnavailableReason(): string | null {
    return null;
  }

  dependencies(): Resource<unknown>[] {
    return [this.opts.dep];
  }

  protected async compute(): Promise<T> {
    this.computeCount++;
    const upstream = await this.getDependency(this.opts.depName, this.opts.dep);
    if (this.opts.transform) return this.opts.transform(upstream);
    return upstream as unknown as T;
  }
}
