import { Resolver } from 'node:dns/promises';
import type { DnsResolver } from '../../types/index.js';

/** Minimal node:dns surface this resolver needs. Injectable for tests. */
export interface DnsBackend {
  resolveTxt(host: string): Promise<string[][]>;
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
  resolveMx(host: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolveCname(host: string): Promise<string[]>;
}

function flattenTxt(records: string[][]): string[] {
  return records.map((parts) => parts.join(''));
}

/**
 * DnsResolver over node:dns/promises. Every lookup is memoized by its full
 * argument tuple for the run (mirrors HttpClient.fetch / Resource.get). The
 * backend is injectable so tests supply canned records with no network.
 */
export class DefaultDnsResolver implements DnsResolver {
  private readonly backend: DnsBackend;
  private readonly cache = new Map<string, Promise<unknown>>();

  constructor(backend: DnsBackend = new Resolver()) {
    this.backend = backend;
  }

  private memo<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.cache.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }
    const promise = run();
    this.cache.set(key, promise);
    return promise;
  }

  resolveA(host: string): Promise<string[]> {
    return this.memo(`a:${host}`, () => this.backend.resolve4(host));
  }
  resolveAAAA(host: string): Promise<string[]> {
    return this.memo(`aaaa:${host}`, () => this.backend.resolve6(host));
  }
  resolveTxt(host: string): Promise<string[][]> {
    return this.memo(`txt:${host}`, () => this.backend.resolveTxt(host));
  }
  resolveMx(host: string): Promise<Array<{ exchange: string; priority: number }>> {
    return this.memo(`mx:${host}`, () => this.backend.resolveMx(host));
  }
  resolveCname(host: string): Promise<string[]> {
    return this.memo(`cname:${host}`, () => this.backend.resolveCname(host));
  }

  private async txtFlat(host: string): Promise<string[]> {
    try {
      return flattenTxt(await this.resolveTxt(host));
    } catch {
      return [];
    }
  }

  async spf(host: string): Promise<string | null> {
    return (await this.txtFlat(host)).find((r) => /^v=spf1\b/i.test(r)) ?? null;
  }
  async dmarc(host: string): Promise<string | null> {
    return (await this.txtFlat(`_dmarc.${host}`)).find((r) => /^v=DMARC1\b/i.test(r)) ?? null;
  }
  async dkim(host: string, selector: string): Promise<string | null> {
    const records = await this.txtFlat(`${selector}._domainkey.${host}`);
    return records.find((r) => /(^v=DKIM1\b|[;\s]p=)/i.test(r)) ?? records[0] ?? null;
  }
}
