import type { HttpClient, LiveContext } from '../../types/index.js';
import {
  axePuppeteerAdapter,
  puppeteerChromeAdapter,
} from '../runtime/browser/puppeteer-adapter.js';
import { DefaultDnsResolver } from '../runtime/dns-resolver.js';
import { DefaultHttpClient } from '../runtime/http-client.js';
import { type AxeAdapter, AxeResource } from '../runtime/resources/axe.js';
import { type ChromeAdapter, ChromeResource } from '../runtime/resources/chrome.js';
import { DomResource } from '../runtime/resources/dom.js';
import { UnavailableResource } from '../runtime/resources/placeholders.js';
import { RootResponseResource } from '../runtime/resources/root-response.js';
import { TlsResource } from '../runtime/resources/tls.js';

/** Test seam: inject fakes to avoid network and browser in unit tests. */
export interface BuildLiveContextDeps {
  httpClient?: HttpClient;
  signal?: AbortSignal;
  chromeAdapter?: ChromeAdapter;
  axeAdapter?: AxeAdapter;
}

/** A built live context plus a disposer that closes the browser if it was launched. */
export interface BuiltLiveContext {
  live: LiveContext;
  dispose: () => Promise<void>;
}

/**
 * Assembles a LiveContext for `url`. Wires the HTTP client, rootResponse,
 * dom/tls resources, and the chrome/axe browser resources (available when the
 * optional puppeteer / @axe-core/puppeteer peer deps are installed).
 * Lighthouse remains an unavailable placeholder until its phase lands.
 */
export function buildLiveContext(url: string, deps: BuildLiveContextDeps = {}): BuiltLiveContext {
  const parsedUrl = new URL(url);
  const http = deps.httpClient ?? new DefaultHttpClient();
  const signal = deps.signal ?? new AbortController().signal;
  const rootResponse = new RootResponseResource(url, http);
  const chrome = new ChromeResource(deps.chromeAdapter ?? puppeteerChromeAdapter, signal);
  const axe = new AxeResource(chrome, url, deps.axeAdapter ?? axePuppeteerAdapter, signal);
  const live: LiveContext = {
    url,
    parsedUrl,
    http,
    rootResponse,
    dom: new DomResource(rootResponse),
    lighthouse: new UnavailableResource(
      'lighthouse',
      'lighthouse resource not implemented yet (live runtime phase pending)',
    ),
    axe,
    tls:
      parsedUrl.protocol === 'https:'
        ? new TlsResource(parsedUrl.hostname, Number(parsedUrl.port) || 443)
        : new UnavailableResource(
            'tls',
            'TLS not checked: URL scheme is not https (scan the https:// URL).',
          ),
    dns: new DefaultDnsResolver(),
  };
  return { live, dispose: () => chrome.dispose() };
}
