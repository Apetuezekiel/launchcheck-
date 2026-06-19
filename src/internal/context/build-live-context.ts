import type { HttpClient, LiveContext } from '../../types/index.js';
import { DefaultHttpClient } from '../runtime/http-client.js';
import { PlaceholderDnsResolver, UnavailableResource } from '../runtime/resources/placeholders.js';
import { RootResponseResource } from '../runtime/resources/root-response.js';

/** Test seam: inject a fake HttpClient to avoid network in unit tests. */
export interface BuildLiveContextDeps {
  httpClient?: HttpClient;
}

/** A built live context plus a disposer (no-op until puppeteer lands in phase 4). */
export interface BuiltLiveContext {
  live: LiveContext;
  dispose: () => Promise<void>;
}

const pending = (resource: string): string =>
  `${resource} resource not implemented yet (live runtime phase pending)`;

/**
 * Assembles a LiveContext for `url`. Phase 1 wires the HTTP client and the
 * rootResponse resource; dom/tls/lighthouse/axe are unavailable placeholders
 * and dns is a placeholder resolver until their phases land, so checkers that
 * consume them cleanly skip.
 */
export function buildLiveContext(url: string, deps: BuildLiveContextDeps = {}): BuiltLiveContext {
  const parsedUrl = new URL(url);
  const http = deps.httpClient ?? new DefaultHttpClient();
  const live: LiveContext = {
    url,
    parsedUrl,
    http,
    rootResponse: new RootResponseResource(url, http),
    dom: new UnavailableResource(pending('dom'), pending('dom')),
    lighthouse: new UnavailableResource(pending('lighthouse'), pending('lighthouse')),
    axe: new UnavailableResource(pending('axe'), pending('axe')),
    tls: new UnavailableResource(pending('tls'), pending('tls')),
    dns: new PlaceholderDnsResolver(pending('dns')),
  };
  return { live, dispose: () => Promise.resolve() };
}
