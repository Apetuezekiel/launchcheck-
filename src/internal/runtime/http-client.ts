import { performance } from 'node:perf_hooks';
import { request } from 'undici';
import type { HttpClient, HttpHeaders, HttpRequestInit, HttpResponse } from '../../types/index.js';

type HttpMethodLite = 'GET' | 'HEAD' | 'OPTIONS' | 'POST';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Minimal transport surface this client needs from undici. Injectable so tests
 * supply canned responses with zero network. The default is undici.request.
 */
export interface UndiciLikeResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: { arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string>; dump(): Promise<void> };
}
export type Transport = (
  url: string,
  opts: {
    method: HttpMethodLite;
    headers?: Record<string, string>;
    maxRedirections: number;
    headersTimeout: number;
    bodyTimeout: number;
  },
) => Promise<UndiciLikeResponse>;

const defaultTransport: Transport = (url, opts) =>
  request(url, opts) as unknown as Promise<UndiciLikeResponse>;

/** Case-insensitive, multi-value-preserving header collection over undici headers. */
class UndiciHeaders implements HttpHeaders {
  private readonly map: Map<string, string[]>;
  constructor(raw: Record<string, string | string[] | undefined>) {
    this.map = new Map();
    for (const [name, value] of Object.entries(raw)) {
      if (value === undefined) {
        continue;
      }
      const lower = name.toLowerCase();
      const values = Array.isArray(value) ? value : [value];
      const existing = this.map.get(lower);
      if (existing) {
        existing.push(...values);
      } else {
        this.map.set(lower, [...values]);
      }
    }
  }
  get(name: string): string | null {
    return this.map.get(name.toLowerCase())?.[0] ?? null;
  }
  getAll(name: string): string[] {
    return this.map.get(name.toLowerCase()) ?? [];
  }
  has(name: string): boolean {
    return this.map.has(name.toLowerCase());
  }
  *entries(): IterableIterator<[string, string]> {
    for (const [name, values] of this.map) {
      for (const value of values) {
        yield [name, value];
      }
    }
  }
  names(): string[] {
    return [...this.map.keys()];
  }
}

/**
 * HttpClient over undici. Follows redirects manually so redirectChain and the
 * final URL are accurate and version-independent. Responses are memoized per
 * (method, url, headers) for the run. Transport is injectable for tests.
 */
export class DefaultHttpClient implements HttpClient {
  private readonly transport: Transport;
  private readonly cache = new Map<string, Promise<HttpResponse>>();

  constructor(transport: Transport = defaultTransport) {
    this.transport = transport;
  }

  fetch(url: string, init?: HttpRequestInit): Promise<HttpResponse> {
    const method = init?.method ?? 'GET';
    const key = `${method} ${url} ${JSON.stringify(init?.headers ?? {})}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const promise = this.doFetch(url, init);
    this.cache.set(key, promise);
    return promise;
  }

  private async doFetch(url: string, init?: HttpRequestInit): Promise<HttpResponse> {
    const method: HttpMethodLite = init?.method ?? 'GET';
    const followRedirects = init?.followRedirects ?? true;
    const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const redirectChain: string[] = [];
    let currentUrl = url;
    const start = performance.now();

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const opts: Parameters<Transport>[1] = {
        method,
        maxRedirections: 0,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      };
      if (init?.headers !== undefined) {
        opts.headers = init.headers;
      }
      const res = await this.transport(currentUrl, opts);
      const ttfbMs = performance.now() - start;
      const headers = new UndiciHeaders(res.headers);

      const location = headers.get('location');
      if (
        followRedirects &&
        REDIRECT_STATUSES.has(res.statusCode) &&
        location &&
        hop < MAX_REDIRECTS
      ) {
        redirectChain.push(currentUrl);
        currentUrl = new URL(location, currentUrl).toString();
        await res.body.dump();
        continue;
      }

      const bytes = new Uint8Array(await res.body.arrayBuffer());
      const totalMs = performance.now() - start;
      return {
        url: currentUrl,
        status: res.statusCode,
        statusText: '',
        headers,
        body: new TextDecoder().decode(bytes),
        bodyBytes: bytes,
        redirectChain,
        timing: { totalMs, ttfbMs },
      };
    }
    throw new Error(`Too many redirects (>${MAX_REDIRECTS}) starting from ${url}`);
  }
}
