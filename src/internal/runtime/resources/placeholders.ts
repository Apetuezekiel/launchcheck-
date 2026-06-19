import type { DnsResolver, Resource } from '../../../types/index.js';
import { BaseResource } from '../base-resource.js';

/**
 * A resource that is never available — used for LiveContext slots whose real
 * implementation lands in a later phase. Consuming checkers see isAvailable()
 * === false and emit 'skip' via resolveResource. compute() never runs.
 */
export class UnavailableResource<T> extends BaseResource<T> {
  readonly name: string;
  private readonly reason: string;

  constructor(name: string, reason: string) {
    super();
    this.name = name;
    this.reason = reason;
  }

  protected isLocallyAvailable(): boolean {
    return false;
  }
  protected localUnavailableReason(): string | null {
    return this.reason;
  }
  dependencies(): Resource<unknown>[] {
    return [];
  }
  protected compute(): Promise<T> {
    return Promise.reject(new Error(this.reason));
  }
}

/**
 * DnsResolver slot for phases before the real resolver lands. Every method
 * rejects; no live checker that consumes 'dns' is registered until then, so
 * these are never called in practice.
 */
export class PlaceholderDnsResolver implements DnsResolver {
  private readonly reason: string;
  constructor(reason: string) {
    this.reason = reason;
  }
  private reject<T>(): Promise<T> {
    return Promise.reject(new Error(this.reason));
  }
  resolveA(): Promise<string[]> {
    return this.reject();
  }
  resolveAAAA(): Promise<string[]> {
    return this.reject();
  }
  resolveTxt(): Promise<string[][]> {
    return this.reject();
  }
  resolveMx(): Promise<Array<{ exchange: string; priority: number }>> {
    return this.reject();
  }
  resolveCname(): Promise<string[]> {
    return this.reject();
  }
  spf(): Promise<string | null> {
    return this.reject();
  }
  dmarc(): Promise<string | null> {
    return this.reject();
  }
  dkim(): Promise<string | null> {
    return this.reject();
  }
}
