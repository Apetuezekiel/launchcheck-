import type {
  CheckContext,
  DnsResolver,
  HttpClient,
  HttpHeaders,
  HttpResponse,
  LiveContext,
  Resource,
  TlsResult,
} from '../../../types/index.js';
import { parseDom } from '../../runtime/parse-dom.js';

/** Minimal case-insensitive, multi-value HttpHeaders over a plain object. */
export function headersFrom(raw: Record<string, string | string[]>): HttpHeaders {
  const map = new Map<string, string[]>();
  for (const [name, value] of Object.entries(raw)) {
    map.set(name.toLowerCase(), Array.isArray(value) ? [...value] : [value]);
  }
  return {
    get: (n) => map.get(n.toLowerCase())?.[0] ?? null,
    getAll: (n) => map.get(n.toLowerCase()) ?? [],
    has: (n) => map.has(n.toLowerCase()),
    *entries() {
      for (const [n, vs] of map) {
        for (const v of vs) {
          yield [n, v] as [string, string];
        }
      }
    },
    names: () => [...map.keys()],
  };
}

/** A resolved Resource<T> stub (always available, returns value). */
export function okResource<T>(value: T): Resource<T> {
  return {
    isAvailable: () => true,
    unavailableReason: () => null,
    get: () => Promise.resolve(value),
    wasComputed: () => true,
    dependencies: () => [],
  };
}

/** An unavailable Resource<T> stub (get() rejects; checkers should skip). */
export function unavailableResource<T>(reason: string): Resource<T> {
  return {
    isAvailable: () => false,
    unavailableReason: () => reason,
    get: () => Promise.reject(new Error(reason)),
    wasComputed: () => false,
    dependencies: () => [],
  };
}

export function makeHttpResponse(
  headers: Record<string, string | string[]>,
  over: Partial<HttpResponse> = {},
): HttpResponse {
  return {
    url: 'https://example.test/',
    status: 200,
    statusText: 'OK',
    headers: headersFrom(headers),
    body: '',
    bodyBytes: new Uint8Array(),
    redirectChain: [],
    timing: { totalMs: 1, ttfbMs: 1 },
    ...over,
  };
}

interface LiveCtxOptions {
  headers?: Record<string, string | string[]>;
  rootResponse?: Resource<HttpResponse>;
  url?: string;
  signal?: AbortSignal;
  domHtml?: string;
  tls?: TlsResult;
  dns?: Partial<DnsResolver>;
  checkerOptions?: Record<string, unknown>;
  thresholds?: Record<string, number>;
  http?: HttpClient;
}

const dnsStub = (label: string) => () => Promise.reject(new Error(`dns test-stub: ${label}`));

/** Builds a live-mode CheckContext with a stub rootResponse. No network. */
export function makeLiveContext(opts: LiveCtxOptions = {}): CheckContext {
  const url = opts.url ?? 'https://example.test/';
  const rootResponse =
    opts.rootResponse ?? okResource(makeHttpResponse(opts.headers ?? {}, { url }));
  const live: LiveContext = {
    url,
    parsedUrl: new URL(url),
    http: opts.http ?? { fetch: () => Promise.reject(new Error('not used in test')) },
    rootResponse,
    dom:
      opts.domHtml !== undefined
        ? okResource(parseDom(opts.domHtml))
        : unavailableResource('dom test-stub'),
    lighthouse: unavailableResource('lighthouse test-stub'),
    axe: unavailableResource('axe test-stub'),
    tls: opts.tls !== undefined ? okResource(opts.tls) : unavailableResource('tls test-stub'),
    dns: {
      resolveA: opts.dns?.resolveA ?? dnsStub('resolveA'),
      resolveAAAA: opts.dns?.resolveAAAA ?? dnsStub('resolveAAAA'),
      resolveTxt: opts.dns?.resolveTxt ?? dnsStub('resolveTxt'),
      resolveMx: opts.dns?.resolveMx ?? dnsStub('resolveMx'),
      resolveCname: opts.dns?.resolveCname ?? dnsStub('resolveCname'),
      spf: opts.dns?.spf ?? dnsStub('spf'),
      dmarc: opts.dns?.dmarc ?? dnsStub('dmarc'),
      dkim: opts.dns?.dkim ?? dnsStub('dkim'),
    },
  };
  return {
    mode: 'live',
    project: null,
    live,
    config: {
      url,
      projectDir: null,
      checkers: {},
      thresholds: opts.thresholds ?? {},
      checkerOptions: opts.checkerOptions ?? {},
      ignore: [],
    },
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    signal: opts.signal ?? new AbortController().signal,
    meta: {
      runId: 'test',
      startedAt: new Date(),
      launchcheckVersion: '0.0.0',
      nodeVersion: process.version,
    },
  };
}
