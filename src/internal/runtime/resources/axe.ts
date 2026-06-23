import type { AxeResult, Resource } from '../../../types/index.js';
import { BaseResource } from '../base-resource.js';
import type { ChromeBrowser, ChromeResource } from './chrome.js';

/**
 * Seam over the optional `@axe-core/puppeteer` peer dependency. The real
 * adapter dynamic-imports it and drives a page; tests inject a fake returning a
 * canned AxeResult.
 */
export interface AxeAdapter {
  /** Synchronous probe: is @axe-core/puppeteer installed and resolvable? */
  isInstalled(): boolean;
  /** Runs axe-core against `url` using the shared browser. */
  run(browser: ChromeBrowser, url: string, signal: AbortSignal): Promise<AxeResult>;
}

/**
 * axe-core accessibility result for the primary URL. Depends on the shared
 * chrome resource. Unavailable when @axe-core/puppeteer is not installed (or
 * when chrome is unavailable, via dependency cascade).
 */
export class AxeResource extends BaseResource<AxeResult> {
  readonly name = 'axe';
  private readonly chrome: ChromeResource;
  private readonly url: string;
  private readonly adapter: AxeAdapter;
  private readonly signal: AbortSignal;

  constructor(chrome: ChromeResource, url: string, adapter: AxeAdapter, signal: AbortSignal) {
    super();
    this.chrome = chrome;
    this.url = url;
    this.adapter = adapter;
    this.signal = signal;
  }

  protected isLocallyAvailable(): boolean {
    return this.adapter.isInstalled();
  }

  protected localUnavailableReason(): string | null {
    return this.adapter.isInstalled()
      ? null
      : '@axe-core/puppeteer is not installed (optional peer dependency required for a11y checks)';
  }

  dependencies(): Resource<unknown>[] {
    return [this.chrome];
  }

  protected async compute(): Promise<AxeResult> {
    const browser = await this.getDependency('chrome', this.chrome);
    return this.adapter.run(browser, this.url, this.signal);
  }
}
