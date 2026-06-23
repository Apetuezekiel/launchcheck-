import type { Resource } from '../../../types/index.js';
import { BaseResource } from '../base-resource.js';

/**
 * Headless-browser handle. Opaque to the resource layer (the concrete type is
 * a puppeteer Browser); consumers receive it as `unknown` and the adapter that
 * produced it knows how to use and close it. Keeping it opaque means the
 * runtime never statically imports puppeteer.
 */
export type ChromeBrowser = unknown;

/**
 * Seam over the optional `puppeteer` peer dependency. The real adapter lives in
 * runtime/browser/puppeteer-adapter.ts and dynamic-imports puppeteer; tests
 * inject a fake so the resource cascade is exercised without a real browser.
 */
export interface ChromeAdapter {
  /** Synchronous probe: is puppeteer installed and resolvable? */
  isInstalled(): boolean;
  /** Launches a headless browser. Only called when isInstalled() is true. */
  launch(signal: AbortSignal): Promise<ChromeBrowser>;
  /** Closes a previously launched browser. */
  close(browser: ChromeBrowser): Promise<void>;
}

/**
 * Shared headless-browser resource. Launched at most once per run (BaseResource
 * memoization); `dispose()` closes it. Unavailable when puppeteer is not
 * installed, which cascades to every resource that depends on it (axe,
 * lighthouse) so the dependent checkers skip cleanly.
 */
export class ChromeResource extends BaseResource<ChromeBrowser> {
  readonly name = 'chrome';
  private readonly adapter: ChromeAdapter;
  private readonly signal: AbortSignal;
  private browser: ChromeBrowser | null = null;

  constructor(adapter: ChromeAdapter, signal: AbortSignal) {
    super();
    this.adapter = adapter;
    this.signal = signal;
  }

  protected isLocallyAvailable(): boolean {
    return this.adapter.isInstalled();
  }

  protected localUnavailableReason(): string | null {
    return this.adapter.isInstalled()
      ? null
      : 'puppeteer is not installed (optional peer dependency required for browser-based checks)';
  }

  dependencies(): Resource<unknown>[] {
    return [];
  }

  protected async compute(): Promise<ChromeBrowser> {
    this.browser = await this.adapter.launch(this.signal);
    return this.browser;
  }

  /** Closes the browser if it was launched. Safe to call when it was not. */
  async dispose(): Promise<void> {
    if (this.browser !== null) {
      const browser = this.browser;
      this.browser = null;
      await this.adapter.close(browser);
    }
  }
}
